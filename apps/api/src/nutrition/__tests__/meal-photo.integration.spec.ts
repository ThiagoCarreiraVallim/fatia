import { NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../../common/prisma.service';
import type { HostedAiService } from '../../ai/hosted-ai.service';
import { MediaService, UNLINKED_MEAL_PHOTO_MS } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';
import { AccountService } from '../../users/account.service';
import type { LogtoManagementService } from '../../auth/logto-management.service';
import type { CheckpointPurgeService } from '../../chat/checkpoint-purge.service';
import type { FoodService } from '../food.service';
import { MealRecognitionService } from '../meal-recognition.service';
import { MealService } from '../meal.service';
import { NutritionSummaryService } from '../nutrition-summary.service';

/**
 * A foto da refeição guardada (ADR 038, #374), no Postgres real e com o bucket
 * em memória: só com a escolha da pessoa, só quando vira refeição, e o arquivo
 * some com "Apagar só a foto", com a refeição e com a conta.
 */
describe('foto da refeição guardada (integração)', () => {
  const prisma = new PrismaService();
  const store = new MemoryObjectStore();
  const media = new MediaService(prisma, store);
  const meals = new MealService(prisma, media);
  const summary = new NutritionSummaryService(prisma);
  const hostedAi = {
    recognizeMeal: jest.fn(async () => ({
      items: [{ name: 'prato feito', grams: 350, confidence: 0.8, kcal: 620 }],
      note: null,
    })),
  } as unknown as HostedAiService;
  const foods = { search: async () => [] } as unknown as FoodService;
  const recognition = new MealRecognitionService(foods, hostedAi, prisma, media);
  const account = new AccountService(
    prisma,
    {} as LogtoManagementService,
    {} as CheckpointPurgeService,
    [],
    media,
  );

  const stamp = `foto-refeicao-${Date.now()}`;
  const criados: string[] = [];
  let n = 0;

  async function pessoa(keepMealPhotos: boolean | null) {
    n += 1;
    const user = await prisma.user.create({
      data: {
        logtoSub: `${stamp}-${n}`,
        email: `${stamp}-${n}@test.local`,
        name: `P${n}`,
        keepMealPhotos,
      },
    });
    criados.push(user.id);
    return user.id;
  }

  /** JPEG com GPS e câmera no EXIF, como sai do celular. */
  const fotoDoCelular = () =>
    sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 120, b: 40 } },
    })
      .jpeg()
      .withExif({ IFD0: { Make: 'CameraDeTeste' }, IFD3: { GPSLatitudeRef: 'S' } })
      .toBuffer();

  const almoco = (photoFileId?: string) => ({
    mealType: 'LUNCH' as const,
    eatenAt: new Date().toISOString(),
    photoFileId,
    items: [{ foodName: 'Prato feito', grams: 350, kcal: 620, source: 'AI' as const }],
  });

  afterAll(async () => {
    await prisma.mediaFile.deleteMany({ where: { uploaderId: { in: criados } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  it.each([null, false])('com a preferência %s a foto vai à IA e é descartada', async (pref) => {
    const userId = await pessoa(pref);
    const antes = store.objects.size;
    const r = await recognition.recognize(userId, await fotoDoCelular());
    expect(r.itens).toHaveLength(1);
    expect(r.photoFileId).toBeNull();
    expect(store.objects.size).toBe(antes);
    expect(await prisma.mediaFile.count({ where: { uploaderId: userId } })).toBe(0);
  });

  it('com fotos guardadas: WebP sem EXIF, ligada à refeição, no dia e na refeição', async () => {
    const userId = await pessoa(true);
    const r = await recognition.recognize(userId, await fotoDoCelular());
    expect(r.photoFileId).not.toBeNull();

    const arquivo = await prisma.mediaFile.findUniqueOrThrow({ where: { id: r.photoFileId! } });
    expect(arquivo).toMatchObject({ purpose: 'meal_photo', mime: 'image/webp', status: 'READY' });
    const bytes = await store.get(arquivo.key);
    expect((await sharp(bytes).metadata()).exif).toBeUndefined();
    expect(bytes.includes(Buffer.from('CameraDeTeste'))).toBe(false);

    const meal = await meals.create(userId, almoco(r.photoFileId!));
    expect(meal).toMatchObject({ hasPhoto: true, origin: 'AI' });
    expect(meal).not.toHaveProperty('photoFileId');

    const tela = await meals.findWithPhoto(userId, meal.id);
    expect(tela.photo?.url).toContain(`memory://get/${arquivo.key}`);

    const dia = await summary.getDayView(userId, new Date().toISOString().slice(0, 10), 'UTC');
    expect(dia.meals.find((m) => m.id === meal.id)).toMatchObject({ hasPhoto: true });
    expect(dia.nutrients[0]).toMatchObject({ key: 'kcal', value: 620 });

    // Uma foto por refeição: a mesma foto não vira outra refeição, e a outra
    // refeição é gravada sem foto em vez de se perder.
    const outra = await meals.create(userId, {
      ...almoco(r.photoFileId!),
      eatenAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(outra.hasPhoto).toBe(false);
  });

  it('a foto que a limpeza já levou não derruba a refeição: grava sem foto', async () => {
    const userId = await pessoa(true);
    const r = await recognition.recognize(userId, await fotoDoCelular());
    await prisma.mediaFile.delete({ where: { id: r.photoFileId! } });

    const meal = await meals.create(userId, almoco(r.photoFileId!));
    expect(meal.hasPhoto).toBe(false);
    expect(meal.items).toHaveLength(1);
  });

  it('"Apagar só a foto" tira o arquivo do bucket e deixa os números', async () => {
    const userId = await pessoa(true);
    const r = await recognition.recognize(userId, await fotoDoCelular());
    const meal = await meals.create(userId, almoco(r.photoFileId!));
    const { key } = await prisma.mediaFile.findUniqueOrThrow({ where: { id: r.photoFileId! } });

    const depois = await meals.deletePhoto(userId, meal.id);
    expect(depois).toMatchObject({ hasPhoto: false });
    expect(depois.items).toHaveLength(1);
    expect(store.objects.has(key)).toBe(false);
    expect(await prisma.mediaFile.count({ where: { id: r.photoFileId! } })).toBe(0);
    // Sem foto, não há o que apagar.
    await expect(meals.deletePhoto(userId, meal.id)).rejects.toThrow(NotFoundException);
  });

  it('apagar a refeição ou a conta apaga o arquivo', async () => {
    const userId = await pessoa(true);
    const primeira = await recognition.recognize(userId, await fotoDoCelular());
    const meal = await meals.create(userId, almoco(primeira.photoFileId!));
    const k1 = (await prisma.mediaFile.findUniqueOrThrow({ where: { id: primeira.photoFileId! } }))
      .key;
    await meals.delete(userId, meal.id);
    expect(store.objects.has(k1)).toBe(false);

    const segunda = await recognition.recognize(userId, await fotoDoCelular());
    await meals.create(userId, {
      ...almoco(segunda.photoFileId!),
      eatenAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const k2 = (await prisma.mediaFile.findUniqueOrThrow({ where: { id: segunda.photoFileId! } }))
      .key;
    await media.beforeDeleteAccount(userId);
    expect(store.objects.has(k2)).toBe(false);
  });

  it('foto que não virou refeição some na faxina; a ligada fica', async () => {
    const userId = await pessoa(true);
    const solta = await recognition.recognize(userId, await fotoDoCelular());
    const usada = await recognition.recognize(userId, await fotoDoCelular());
    await meals.create(userId, almoco(usada.photoFileId!));
    const antigo = new Date(Date.now() - UNLINKED_MEAL_PHOTO_MS - 60_000);
    await prisma.mediaFile.updateMany({
      where: { id: { in: [solta.photoFileId!, usada.photoFileId!] } },
      data: { createdAt: antigo },
    });

    await media.purgeOrphans(new Date());
    const restantes = await prisma.mediaFile.findMany({
      where: { uploaderId: userId },
      select: { id: true },
    });
    expect(restantes.map((f) => f.id)).toEqual([usada.photoFileId]);
  });

  it('a foto entra no export (LGPD) com o link, e o MCP vê só o hasPhoto', async () => {
    const userId = await pessoa(true);
    const r = await recognition.recognize(userId, await fotoDoCelular());
    await meals.create(userId, almoco(r.photoFileId!));

    const arquivo = await account.exportData(userId, { photoLinks: true });
    expect(arquivo.meals[0]).toMatchObject({
      hasPhoto: true,
      photo: { mime: 'image/webp', url: expect.stringContaining('memory://get/users/') },
    });
    const peloMcp = await account.exportData(userId);
    expect(peloMcp.meals[0].photo).not.toHaveProperty('url');
    expect(JSON.stringify(peloMcp)).not.toContain(r.photoFileId!);
  });
});
