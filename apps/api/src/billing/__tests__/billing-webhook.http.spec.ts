import type { AddressInfo } from 'node:net';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from '../../common/common.module';
import { PrismaService } from '../../common/prisma.service';
import { AsaasProvider } from '../asaas/asaas.provider';
import { BillingModule } from '../billing.module';
import { registrarCorposDoWebhook } from '../corpos-do-webhook';
import { SUBSCRIPTION_PROVIDER } from '../user-subscription.service';

/**
 * O webhook pela porta da frente: o parser cru registrado em `main.ts` e a
 * rota pública. O que quebra aqui sem quebrar teste de serviço é a fiação — o
 * parser de JSON global entregaria um objeto, e o `corpoCru` leria vazio.
 */
const TOKEN = 'segredo-http';

describe('POST /api/billing/webhooks/asaas', () => {
  let app: INestApplication;
  let url: string;
  const prisma = new PrismaService();
  const eventId = `http-${Date.now()}`;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
        CommonModule,
        BillingModule,
      ],
    })
      .overrideProvider(SUBSCRIPTION_PROVIDER)
      .useValue(
        new AsaasProvider({ baseUrl: 'http://asaas.invalid', apiKey: 'k', webhookToken: TOKEN }),
      )
      .compile();
    app = modulo.createNestApplication({ logger: false });
    registrarCorposDoWebhook(app);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/billing/webhooks/asaas`;
  });

  afterAll(async () => {
    await prisma.billingWebhookEvent.deleteMany({ where: { eventId } });
    await prisma.$disconnect();
    await app.close();
  });

  const postar = (token: string, corpo: string) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'asaas-access-token': token },
      body: corpo,
    });

  it('o corpo JSON chega cru ao verificador e o evento é registrado', async () => {
    const corpo = JSON.stringify({
      id: eventId,
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_x', dueDate: '2026-10-15', subscription: 'sub_nao_nossa' },
    });
    const r = await postar(TOKEN, corpo);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ received: true, ignored: 'assinatura_desconhecida' });
    expect(await prisma.billingWebhookEvent.count({ where: { eventId } })).toBe(1);
  });

  it('token errado é 401', async () => {
    expect((await postar('outro', '{}')).status).toBe(401);
  });
});
