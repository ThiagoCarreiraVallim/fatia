import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Food } from '@prisma/client';
import { MAX_FOTO_BYTES, MealRecognitionService } from '../meal-recognition.service';
import type { FoodService } from '../food.service';

/**
 * O agente Python nunca é chamado de verdade aqui — `fetch` é sempre dublê.
 *
 * O que mais importa afirmar não é o caminho feliz: é (1) que **nada do usuário
 * sai daqui** junto da foto, (2) que a foto sai **sem EXIF**, e (3) que toda
 * falha do agente vira um erro que manda a pessoa para o registro manual, nunca
 * um 500 nem um beco sem saída.
 */

/**
 * JPEG real, 32×32, com EXIF real (GPS na Praça da Sé, marca, modelo e número de
 * série). É a mesma fixture de `helpers/strip-exif.spec.ts`, e é real de
 * propósito: um `Buffer.from('foto')` passaria numa asserção de "não contém
 * GPS" sem provar nada, porque nunca teve GPS.
 */
const JPEG_COM_EXIF_GPS = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/4QEKRXhpZgAATU0AKgAAAAgABQEPAAIAAAAGAAAASgEQAAIA' +
    'AAAOAAAAUAExAAIAAAAJAAAAXodpAAQAAAABAAAAZ4glAAQAAAABAAAAoAAAAABBcHBsZQBpUGhv' +
    'bmUgMTUgUHJvAGlPUyAxOC4yAAACkAMAAgAAABQAAACBpDEAAgAAAAsAAACVMjAyNjowODowMyAx' +
    'MjozMDowMABGMkxaUThYS0pDAAAEAAEAAgAAAAJTAAAAAAIABQAAAAMAAADSAAMAAgAAAAJXAAAA' +
    'AAQABQAAAAMAAADqAAAAFwAAAAEAAAAhAAAAAQAADhAAAABkAAAALgAAAAEAAAAmAAAAAQAADOQA' +
    'AABk/9sAQwACAQEBAQECAQEBAgICAgIEAwICAgIFBAQDBAYFBgYGBQYGBgcJCAYHCQcGBggLCAkK' +
    'CgoKCgYICwwLCgwJCgoK/9sAQwECAgICAgIFAwMFCgcGBwoKCgoKCgoKCgoKCgoKCgoKCgoKCgoK' +
    'CgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoK/8AAEQgAIAAgAwEiAAIRAQMRAf/EAB8AAAEFAQEB' +
    'AQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNR' +
    'YQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldY' +
    'WVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TF' +
    'xsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAAB' +
    'AgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGx' +
    'wQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpz' +
    'dHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW' +
    '19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8A5rxna/CvRbbVNH+JWi+GfAmqzaNq' +
    'Ed9bwMk02oBkTUZrhn04KiTr/aJDLHFfpayWduwdVuGI7K88F2/jjTdYntLi7+Ds58Oa54ZtF+H3' +
    'i+G6iWa9ube8gijktUDXs8omt9PS0jdYJJrZIo02xRKeci1P4y3PiWHWPGXgrS77/hGtS1axv9T8' +
    'M6fFYQLO2q3McFlYmzgvnhimvZpAZtgX+0NLis4xEkBkm19e+G3iC48MjwTffBC58T2srWlj/Y6Q' +
    'Kst7Gk9z9kttPhmK77i3Ej2+6yZ0ZbOCUSskrG4jFYqvioShGo3iJpxlOKjyuc5u04wck5zpUnGP' +
    's5Qm5c0FGUYKan005U7yoUq1oQbqX56kYck7ximq0nGmoxVnOTm5SjRXve0fJkw+CPifpukS/ArT' +
    '7f8As+61Ax7PF9zqH2620yG6a0t0dHaC63yWpNrYhBPJHHpmoywPIonlMZZ+IPHXh34k+APEd18a' +
    'NC8S6roetQ6vqtlq+o2kTWn2iSORxwd7pbWoe8uZredYYhBcvLOPKWe51LHSPDWnfEnxjf8AxJ8W' +
    'eCLqJvB921j4en1K9hg1spC8ds1zawyw3VxE13cXDurxXRe3aSa2jhLy5ydC8CfGf43+FjFpHg/4' +
    'eazr3hXwrZQ69q0cNzc6pNpViunLb3kulzW95Gl8VtlQpGwguiTJJtEMRXvxWPwGIwn1nESk7c8e' +
    'Zx54pOPJ7J1KrvOnWlV5asqbi41FFKDnJtbclTExr46vRSTacWlOahKahCm6b5ala6VJqVtUmqbU' +
    '6ftYTd+1n8Uvh7L8NvC+g6n4w0ax1HweZU0i11DWprmDTNINpGtwken2kFrBKzWUl+pikjntFgtp' +
    'LeJAMlN3WfEGkQ+INDXwhqF9YP4S1HVtY1DULLxrp1yqadqdzYRNaXdpNqzILdGW1sVRFuY3uEAt' +
    'gk9xFKM7X/HSDwXpWva9qmn67ZeINAnbVV0vWX1IXmsSjT4LMllujmW4ht3NtaxTRXDh3ZAktvbK' +
    '2Zpnx4g8F+A5/wDhWWtWes+F9CsLZ7TR7rWodXtLrTywuJfsJuIxendetJZbxayGOKQzYt5lu4Yp' +
    'w2CoSwOGo4WMoqlOVSf760bTb91wlSoqdLWq1Nwqw5pSklLn5TxsJgJYHGeyyqpKpWlF+0jy0oxl' +
    'eUW5pJVHCnGUpqnSlBR9mnVXLeMXo+EbrT/ip4ptl13Rvh3oy6rrl9ealqGoXlnFHpdohMRaSdLc' +
    'i5lWSyt4YbVrh7a4tft6rFMVD26/FP4Uxw6R4x8QeJFh0Kx0/wC1i4uvDum6SlprOpxNfOZUimgh' +
    'VpbjT9Mgmczm3iEcksiqvnwrPm+E7LVvFFt4mvfBHw21YanqGnNf3PiLxBpFhDZaQY4jdwzWqQT3' +
    '0s0/2t9SgdzKDC0YXy1uYGlg3PCfjPx5qHxH1jwDa2Xiax0Ga3urW30zwxp73TeGbSZ5obi8V2cX' +
    '0LwsGHlNGj3dxYxrbRRNbwz1GFw2f4LEzxuDhGMIKnKnJ1HHm9nLmkqcr1LqEVKCU+WKp8taVrq9' +
    '5p7mK+tQfuqpKdJ3i1enJTpS96MXSUW581Oaq1FGNRVWrwnL/9k=',
  'base64',
);

const USER = '11111111-1111-1111-1111-111111111111';
const OUTRO_USER = '22222222-2222-2222-2222-222222222222';

function alimento(parcial: Partial<Food> & Pick<Food, 'id' | 'name'>): Food {
  return {
    source: 'TACO',
    groupId: 1,
    searchName: parcial.name.toLowerCase(),
    kcalPer100g: 100,
    proteinPer100g: 2,
    carbsPer100g: 20,
    fatPer100g: 1,
    createdByUserId: null,
    nutrients: null,
    ...parcial,
  } as Food;
}

/**
 * Recorte do catálogo **real**, com id, nome e kcal copiados de
 * `packages/db/prisma/data/taco.csv`.
 *
 * Ele existe porque a versão anterior destes testes montava um catálogo de
 * **um item** por cenário, e com cardinalidade 1 não existe desempate — que é
 * exatamente onde o casamento errava. Um catálogo de um item só responde "achou
 * o único que havia" e diz isso com cara de teste verde.
 *
 * As vizinhanças aqui não são decorativas: cada uma é uma classe de erro que já
 * aconteceu contra o catálogo de verdade. Macaúba é a vizinha de "maçã" em
 * `Prefix`; Melado é a de "mel"; os três arrozes e as duas maçãs são a
 * ambiguidade que nenhum nome de uma palavra resolve.
 */
const TACO: Food[] = [
  alimento({ id: 1, name: 'Arroz, integral, cozido', kcalPer100g: 123.53 }),
  alimento({ id: 2, name: 'Arroz, integral, cru', kcalPer100g: 359.68 }),
  alimento({ id: 3, name: 'Arroz, tipo 1, cozido', kcalPer100g: 128.26 }),
  alimento({ id: 221, name: 'Maçã, Argentina, com casca, crua', kcalPer100g: 62.53 }),
  alimento({ id: 222, name: 'Maçã, Fuji, com casca, crua', kcalPer100g: 55.52 }),
  alimento({ id: 223, name: 'Macaúba, crua', kcalPer100g: 404.28 }),
  alimento({ id: 129, name: 'Mandioca, cozida', kcalPer100g: 125.36 }),
  alimento({ id: 130, name: 'Mandioca, crua', kcalPer100g: 151.42 }),
  alimento({
    id: 132,
    name: 'Mandioca, frita',
    kcalPer100g: 300.06,
    proteinPer100g: 2.2,
    carbsPer100g: 40.5,
    fatPer100g: 13.4,
  }),
  alimento({ id: 507, name: 'Mel, de abelha', kcalPer100g: 309.24 }),
  alimento({ id: 508, name: 'Melado', kcalPer100g: 296.5 }),
  alimento({ id: 509, name: 'Caramelo, doce', kcalPer100g: 382 }),
  alimento({ id: 523, name: 'Leite, de coco', kcalPer100g: 166.16 }),
  alimento({ id: 148, name: 'Coco, cru', kcalPer100g: 406 }),
  alimento({ id: 149, name: 'Coco, verde, água', kcalPer100g: 21.6 }),
];

interface CenarioOpcoes {
  env?: Record<string, string>;
  catalogo?: Food[];
}

function montar(opcoes: CenarioOpcoes = {}) {
  const env: Record<string, string> = {
    AGENT_BASE_URL: 'http://agent.local:8100',
    ...opcoes.env,
  };

  const config = {
    get: (chave: string, padrao?: string) => env[chave] ?? padrao,
  } as unknown as ConfigService;

  const search = jest.fn(
    async (userId: string, params: { q?: string; limit?: number }): Promise<Food[]> => {
      // Reusa o ranqueamento de verdade — e, com ele, o filtro que o `contains`
      // do banco faz (`rankByRelevance` descarta `MatchRank.None`). Um duplo que
      // devolvesse sempre o primeiro alimento esconderia justamente a recusa que
      // este serviço acrescenta em cima da busca.
      const { rankByRelevance } = await import('../../common/search-text');
      const visiveis = (opcoes.catalogo ?? []).filter(
        (f) => f.createdByUserId === null || f.createdByUserId === userId,
      );
      return rankByRelevance(visiveis, params.q ?? '', (f) => f.name, params.limit ?? 20);
    },
  );

  const foods = { search } as unknown as FoodService;
  const service = new MealRecognitionService(config, foods);
  jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

  return { service, search };
}

function respostaDoAgente(corpo: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  } as unknown as Response;
}

describe('MealRecognitionService', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('privacidade — o que sai daqui', () => {
    it('manda a foto sem EXIF, sem GPS e sem nada que identifique a pessoa', async () => {
      const { service } = montar();
      fetchMock.mockResolvedValue(respostaDoAgente({ items: [], note: null }));

      await service.reconhecer(USER, JPEG_COM_EXIF_GPS);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://agent.local:8100/recognize-meal');

      const enviado = JSON.parse(init.body as string) as Record<string, unknown>;
      // Lista fechada de propósito: um `userId` acrescentado "só para o log"
      // criaria um segundo lugar onde o dado do usuário existe, e um teste que
      // só checasse "tem image_base64" não veria isso.
      expect(Object.keys(enviado).sort()).toEqual(['image_base64', 'media_type']);

      const foto = Buffer.from(enviado.image_base64 as string, 'base64');
      expect(foto.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8])); // ainda é JPEG
      expect(foto.includes(Buffer.from('Exif\0\0', 'binary'))).toBe(false);
      expect(foto.includes(Buffer.from('iPhone 15 Pro'))).toBe(false);
      expect(foto.includes(Buffer.from('F2LZQ8XKJC'))).toBe(false);
      // Guarda contra o teste virar vácuo: a entrada tinha mesmo o que se afirma
      // ter saído.
      expect(JPEG_COM_EXIF_GPS.includes(Buffer.from('iPhone 15 Pro'))).toBe(true);
    });

    it('não manda cabeçalho de autorização do usuário para o agente', async () => {
      const { service } = montar({ env: { AGENT_API_KEY: 'segredo-do-compose' } });
      fetchMock.mockResolvedValue(respostaDoAgente({ items: [] }));

      await service.reconhecer(USER, JPEG_COM_EXIF_GPS);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      // O segredo é do serviço, não da pessoa: ele identifica o `apps/api`, e o
      // agente não fica sabendo de quem é a foto.
      expect(Object.keys(headers).sort()).toEqual(['Accept', 'Content-Type', 'X-Fatia-Agent-Key']);
      expect(headers['X-Fatia-Agent-Key']).toBe('segredo-do-compose');
    });

    it('recusa quem não é JPEG antes de qualquer chamada ao provedor', async () => {
      const { service } = montar();
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      await expect(service.reconhecer(USER, png)).rejects.toBeInstanceOf(BadRequestException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('recusa foto acima do teto sem gastar inferência', async () => {
      const { service } = montar();
      const grande = Buffer.concat([JPEG_COM_EXIF_GPS, Buffer.alloc(MAX_FOTO_BYTES)]);

      await expect(service.reconhecer(USER, grande)).rejects.toBeInstanceOf(
        PayloadTooLargeException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('casamento com a TACO', () => {
    const respostaComMandiocaEBolinho = {
      items: [
        {
          name: 'mandioca frita',
          grams: 150,
          confidence: 0.9,
          kcal: 999,
          protein_g: 99,
          carbs_g: 99,
          fat_g: 99,
        },
        { name: 'bolinho da vó', grams: 60, confidence: 0.4, kcal: 210, protein_g: 4 },
      ],
    };

    it('casou: o macro vem da TACO e a estimativa do modelo é descartada', async () => {
      // O catálogo tem as **três** mandiocas, e não só a que deve ganhar: com
      // uma entrada só não existe desempate, e é no desempate que o casamento
      // erra. Quem escolhe aqui é o preparo dito pelo modelo ("frita"), não a
      // sorte da ordenação.
      const { service } = montar({ catalogo: TACO });
      fetchMock.mockResolvedValue(respostaDoAgente(respostaComMandiocaEBolinho));

      const { itens } = await service.reconhecer(USER, JPEG_COM_EXIF_GPS);

      expect(itens[0]).toMatchObject({
        nomeReconhecido: 'mandioca frita',
        foodId: 132,
        // A UI mostra qual entrada casou, e não só o nome que o modelo disse:
        // crua, cozida e frita são o mesmo alimento com o dobro da caloria.
        nomeDoCatalogo: 'Mandioca, frita',
        estimado: false,
        kcal: 450.09,
        proteinG: 3.3,
      });
      // O 999 kcal do modelo não sobreviveu ao casamento.
      expect(itens[0].kcal).not.toBe(999);
    });

    it('não casa "maçã" com "Macaúba" só porque um nome começa pelo outro', async () => {
      // A regressão que custou caro. Todo nome da TACO começa pela identidade,
      // então "maca" é `MatchRank.Prefix` (1) de "macauba crua" — passava em
      // qualquer piso de rank — e o desempate por nome mais curto escolhia
      // Macaúba na frente das duas maçãs. Resultado contra o catálogo real:
      // 525,56 kcal em 130 g no lugar de ~73, com `estimado: false`, ou seja,
      // apresentado como confirmado pela tabela.
      const { service } = montar({ catalogo: TACO });
      fetchMock.mockResolvedValue(
        respostaDoAgente({ items: [{ name: 'maçã', grams: 130, confidence: 0.9 }] }),
      );

      const { itens } = await service.reconhecer(USER, JPEG_COM_EXIF_GPS);

      expect(itens[0]).toMatchObject({ foodId: null, nomeDoCatalogo: null, estimado: true });
      // E, principalmente, sem a caloria da macaúba entrando como maçã.
      expect(itens[0].kcal).toBeNull();
    });

    it('nome genérico que serve a várias entradas não escolhe nenhuma', async () => {
      // "arroz" vale igualmente para integral cru (360 kcal/100 g) e tipo 1
      // cozido (128). O nome não escolheu entre elas; escolher por conta seria
      // errar o macro em quase 3× sem nenhum sintoma na tela. Item livre é a
      // resposta honesta — a pessoa corrige em um toque e vê que é estimado.
      const { service } = montar({ catalogo: TACO });
      fetchMock.mockResolvedValue(
        respostaDoAgente({ items: [{ name: 'arroz', grams: 150, confidence: 0.9 }] }),
      );

      const { itens } = await service.reconhecer(USER, JPEG_COM_EXIF_GPS);

      expect(itens[0]).toMatchObject({ foodId: null, estimado: true });
    });

    it('não casou: vira item livre marcado como estimado', async () => {
      const { service } = montar({ catalogo: [] });
      fetchMock.mockResolvedValue(respostaDoAgente(respostaComMandiocaEBolinho));

      const { itens } = await service.reconhecer(USER, JPEG_COM_EXIF_GPS);

      expect(itens[1]).toMatchObject({
        nomeReconhecido: 'bolinho da vó',
        foodId: null,
        nomeDoCatalogo: null,
        estimado: true,
        kcal: 210,
        proteinG: 4,
      });
      // Macro que o modelo não disse continua ausente. Virando zero, entraria na
      // refeição como "este alimento não tem carboidrato", indistinguível de
      // dado real.
      expect(itens[1].carbsG).toBeNull();
      expect(itens[1].fatG).toBeNull();
    });

    it('"mel" acha "Mel, de abelha" no meio de "Melado" e "Caramelo"', async () => {
      // Um teste, as duas classes de erro que competem com a resposta certa:
      // "Melado" começa com "mel" (`Prefix`, a falha dominante e a que nenhum
      // piso de rank barrava) e "Caramelo, doce" contém "mel" no meio da
      // palavra (`Contains`). Nenhum dos dois tem "mel" como identidade, então
      // sobra uma entrada só — e é a certa, com o macro dela.
      const { service } = montar({ catalogo: TACO });
      fetchMock.mockResolvedValue(
        respostaDoAgente({ items: [{ name: 'mel', grams: 20, confidence: 0.7 }] }),
      );

      const { itens } = await service.reconhecer(USER, JPEG_COM_EXIF_GPS);

      expect(itens[0]).toMatchObject({
        foodId: 507,
        nomeDoCatalogo: 'Mel, de abelha',
        estimado: false,
        kcal: 61.85,
      });
    });

    it('"coco" não casa com "Leite, de coco", mas "leite de coco" casa', async () => {
      // O par que o comentário antigo usava como exemplo, agora nos dois
      // sentidos. "coco" não é a identidade de "Leite, de coco" — a identidade
      // é "leite" —, e além disso serve a duas entradas de coco: item livre. Já
      // "leite de coco" cobre a identidade "leite" e sobra uma só.
      const { service } = montar({ catalogo: TACO });
      fetchMock.mockResolvedValue(
        respostaDoAgente({
          items: [
            { name: 'coco', grams: 50, confidence: 0.6 },
            { name: 'leite de coco', grams: 200, confidence: 0.8 },
          ],
        }),
      );

      const { itens } = await service.reconhecer(USER, JPEG_COM_EXIF_GPS);

      expect(itens[0]).toMatchObject({ foodId: null, estimado: true });
      expect(itens[1]).toMatchObject({
        foodId: 523,
        nomeDoCatalogo: 'Leite, de coco',
        estimado: false,
      });
    });

    it('procura no catálogo do dono da foto, e não em catálogo alheio', async () => {
      // Sem RLS (ADR 010), o isolamento é da aplicação: o `userId` que chega ao
      // `FoodService.search` tem de ser o do `@CurrentUser()`, sempre.
      // O nome é "Tapioca" e não "Tapioca da casa": precisa ser um alimento que
      // **casaria** se estivesse visível (identidade igual ao termo, e único),
      // senão o `foodId: null` abaixo seria consequência da regra de casamento
      // e não do isolamento, e o teste passaria verde com o isolamento furado.
      const { service, search } = montar({
        catalogo: [
          alimento({
            id: 9,
            name: 'Tapioca',
            source: 'CUSTOM',
            createdByUserId: OUTRO_USER,
          }),
        ],
      });
      fetchMock.mockResolvedValue(
        respostaDoAgente({ items: [{ name: 'tapioca', grams: 80, confidence: 0.8 }] }),
      );

      const { itens } = await service.reconhecer(USER, JPEG_COM_EXIF_GPS);

      expect(search).toHaveBeenCalledWith(USER, expect.objectContaining({ q: 'tapioca' }));
      // O custom do outro usuário não pode virar `foodId` da refeição desta pessoa.
      expect(itens[0].foodId).toBeNull();
    });

    it('foto sem comida devolve lista vazia, não erro', async () => {
      const { service } = montar();
      fetchMock.mockResolvedValue(
        respostaDoAgente({ items: [], note: 'não identifiquei alimentos na foto' }),
      );

      const resultado = await service.reconhecer(USER, JPEG_COM_EXIF_GPS);

      expect(resultado.itens).toEqual([]);
      expect(resultado.observacao).toBe('não identifiquei alimentos na foto');
    });
  });

  describe('degradação — o caminho manual nunca fecha', () => {
    it('sem AGENT_BASE_URL responde 503 sem chamar ninguém', async () => {
      const { service } = montar({ env: { AGENT_BASE_URL: '' } });

      await expect(service.reconhecer(USER, JPEG_COM_EXIF_GPS)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('agente fora do ar vira 503 com instrução de registrar à mão', async () => {
      const { service } = montar();
      fetchMock.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), {}));

      await expect(service.reconhecer(USER, JPEG_COM_EXIF_GPS)).rejects.toThrow(
        /Registre manualmente/i,
      );
    });

    it('timeout vira 504, e não erro genérico', async () => {
      const { service } = montar();
      fetchMock.mockRejectedValue(
        Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }),
      );

      await expect(service.reconhecer(USER, JPEG_COM_EXIF_GPS)).rejects.toBeInstanceOf(
        GatewayTimeoutException,
      );
    });

    it('traduz pelo `code` do agente, não pela mensagem em prosa', async () => {
      // A mensagem muda sem aviso; o código é contrato. Casar por texto faria uma
      // edição de português no `apps/agent` mudar o status HTTP daqui.
      const casos: Array<[string, unknown]> = [
        ['AI_PROVIDER_NOT_CONFIGURED', ServiceUnavailableException],
        ['AI_PROVIDER_TIMEOUT', GatewayTimeoutException],
        ['AI_RESPONSE_UNPARSEABLE', BadGatewayException],
        ['AI_PROVIDER_REFUSED', BadGatewayException],
      ];

      for (const [code, tipo] of casos) {
        const { service } = montar();
        fetchMock.mockResolvedValue(
          respostaDoAgente({ error: { code, message: 'qualquer coisa' } }, 502),
        );

        await expect(service.reconhecer(USER, JPEG_COM_EXIF_GPS)).rejects.toBeInstanceOf(
          tipo as never,
        );
      }
    });

    it('401 do agente é erro de configuração, e não "o modelo falhou"', async () => {
      // API com `AGENT_API_KEY` e agente sem (ou com outra) devolve 401 com
      // `AGENT_KEY_REJECTED` — um código que este `switch` não conhece, e que
      // portanto cairia no `default`: a pessoa lia "o reconhecimento por foto
      // falhou" e quem opera ia procurar defeito no modelo. É configuração, e o
      // erro tem de dizer. Por isso a decisão é pelo status, antes do código.
      //
      // O corpo é o que o agente responde de verdade desde a revisão da #248
      // (`apps/agent/src/fatia_agent/api.py`, `AgentKeyRejected`); antes era um
      // `{ detail: 'Unauthorized' }`, e um duplo com forma que a realidade não
      // tem passa verde sobre a tradução que deveria testar.
      const { service } = montar();
      fetchMock.mockResolvedValue(
        respostaDoAgente(
          { error: { code: 'AGENT_KEY_REJECTED', message: 'chave ausente ou inválida' } },
          401,
        ),
      );

      await expect(service.reconhecer(USER, JPEG_COM_EXIF_GPS)).rejects.toThrow(
        /mal configurado.*autenticar no agente/i,
      );
    });

    it('resposta do agente sem `items` vira 502 em vez de itens undefined', async () => {
      const { service } = montar();
      fetchMock.mockResolvedValue(respostaDoAgente({ resultado: 'ok' }));

      await expect(service.reconhecer(USER, JPEG_COM_EXIF_GPS)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });

  describe('disponibilidade — a entrada por foto some quando não há IA', () => {
    it('sem AGENT_BASE_URL responde indisponível sem tocar a rede', async () => {
      const { service } = montar({ env: { AGENT_BASE_URL: '' } });

      expect(await service.disponivel()).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('agente no ar mas sem modelo de visão também é indisponível', async () => {
      // Sem `AI_MODEL_VISION` o agente sobe saudável e recusa toda inferência.
      // Mostrar o botão nesse estado leva a pessoa a tirar uma foto para receber
      // um erro — que é pior que a funcionalidade não existir.
      const { service } = montar();
      fetchMock.mockResolvedValue(
        respostaDoAgente({ capabilities: { text: 'ornith-1.0-9b', vision: null } }),
      );

      expect(await service.disponivel()).toBe(false);
    });

    it('agente com modelo de visão responde disponível', async () => {
      const { service } = montar();
      fetchMock.mockResolvedValue(
        respostaDoAgente({ capabilities: { vision: 'google/gemma-4-12b-qat' } }),
      );

      expect(await service.disponivel()).toBe(true);
    });

    it('agente inacessível não estoura — só desliga a entrada por foto', async () => {
      const { service } = montar();
      fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

      expect(await service.disponivel()).toBe(false);
    });
  });
});
