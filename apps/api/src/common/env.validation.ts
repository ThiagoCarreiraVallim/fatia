import { z } from 'zod';
import { parseAiPriceTable } from '../ai/ai-pricing';

export const AppEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    API_PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().url(),
    // Logto (ADR 008) — provider OIDC. A API valida JWTs do Logto.
    LOGTO_ENDPOINT: z.string().url(),
    LOGTO_AUDIENCE: z.string().min(1),
    // OAuth facade pro MCP — app dedicado no Logto (tipo Traditional Web).
    LOGTO_MCP_APP_ID: z.string().min(1),
    LOGTO_MCP_APP_SECRET: z.string().min(1),
    WEB_ORIGIN: z.string().url().default('http://localhost:3030'),
    // Endereço público da API, para os links que ela mesma entrega (exportação de dados, #387).
    // Vazio = `http://localhost:<API_PORT>`, o do dev.
    API_PUBLIC_URL: z.string().url().optional().or(z.literal('')),
    // E-mail da própria API (convites de comunidade). Separado do conector SMTP do Logto
    // (`EMAIL_SMTP_*`), que é configurado dentro do Logto e enxerga a rede do Docker; a API roda
    // fora dela no dev. Vazio = não envia: o convite continua valendo pelo link copiado.
    MAIL_SMTP_URL: z.string().url().optional().or(z.literal('')),
    EMAIL_FROM: z.string().min(3).default('Fatia <nao-responda@fatia.local>'),
    // Assina o link de descadastro do e-mail de comunicado (#398), que funciona sem login. Vazio
    // (ou com menos de 16 caracteres) = o e-mail de comunicado fica indisponível no painel.
    // Gerar com `openssl rand -hex 32`. Trocar invalida os links dos e-mails já mandados.
    EMAIL_UNSUBSCRIBE_SECRET: z.string().optional().or(z.literal('')),
    // Deriva o token do link de convite sem e-mail (#401), para a equipe copiar o link (e o QR)
    // de novo depois; o banco guarda só o hash. Vazio = o link só aparece na criação. Gerar com
    // `openssl rand -hex 32`. Trocar invalida os links e QRs já impressos.
    INVITE_LINK_SECRET: z.string().optional().or(z.literal('')),
    // Comunicados com aviso (notificação ou e-mail) por comunidade em 7 dias (#398). Passou
    // disso, o comunicado sai só no mural.
    ANNOUNCEMENT_PUSH_WEEKLY_LIMIT: z.coerce.number().int().min(0).default(3),
    // Avisos no celular pela Expo (ADR 033). Desligado por padrão: o dev e os testes não mandam
    // aviso para o celular de ninguém. O token de acesso só vale se o projeto na Expo exigir.
    PUSH_ENABLED: z.enum(['true', 'false']).default('false'),
    EXPO_ACCESS_TOKEN: z.string().optional().or(z.literal('')),
    // Push no navegador (Web Push, Fase 9g). As três juntas, ou nenhuma: sem elas o
    // PWA não oferece a opção. Gerar com `npx web-push generate-vapid-keys`.
    WEB_PUSH_VAPID_PUBLIC_KEY: z.string().optional().or(z.literal('')),
    WEB_PUSH_VAPID_PRIVATE_KEY: z.string().optional().or(z.literal('')),
    WEB_PUSH_SUBJECT: z
      .string()
      .regex(/^(mailto:|https:\/\/)/, 'WEB_PUSH_SUBJECT é mailto: ou https://')
      .optional()
      .or(z.literal('')),
    // Observabilidade (issue #39). Vazio = instrumentação inerte: sem exportador, sem timer, sem
    // container extra. Quem sobe o stack do `infra/docker-compose.observability.yml` preenche.
    // Declarado aqui só para validar e documentar — o `tracing.ts` lê `process.env` direto,
    // porque roda antes do Nest existir.
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional().or(z.literal('')),
    OTEL_SERVICE_NAME: z.string().min(1).default('fatia-api'),

    // IA hospedada (issue #135). Tudo opcional e inerte por default: a instância que não usa IA —
    // que é como o produto funciona hoje — não precisa preencher nada, e o caminho manual não
    // depende de nenhuma destas.
    //
    // Preço por **configuração**, não por deploy: o AI Gateway troca de modelo sem subir código, e a
    // tabela de preço tem de poder acompanhar pela mesma via, senão o custo passa a ser medido com o
    // preço do modelo antigo.
    AI_PRICE_TABLE: z
      .string()
      .default('')
      // `transform` e não `refine`: validar sem converter deixaria o `JSON.parse` para o primeiro uso
      // — ou seja, para o meio de uma requisição de usuário em produção. Aqui o boot falha.
      .transform((raw, ctx) => {
        try {
          return parseAiPriceTable(raw);
        } catch (err) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: err instanceof Error ? err.message : String(err),
          });
          return z.NEVER;
        }
      }),

    // Tetos diários em micro-unidades da moeda, na janela UTC de `ai-quota.ts`. `0` = sem cota, que é
    // o correto para instância auto-hospedada com modelo local: não há custo a conter.
    AI_QUOTA_DAILY_MICROS: z.coerce.number().int().nonnegative().default(0),
    AI_QUOTA_GLOBAL_DAILY_MICROS: z.coerce.number().int().nonnegative().default(0),

    // Tolerância de chamadas cujo custo não deu para saber, na mesma janela. Existe porque custo
    // desconhecido entra na soma como `0`, e uma soma que fica em `0` libera a cota para sempre —
    // ou seja, a contenção se desligaria sozinha exatamente quando a medição se perdeu. O default
    // não é `0` de propósito: um punhado de chamadas dá tempo de o alerta de anomalia aparecer
    // antes de a IA apagar, e a exposição não medida fica limitada a esse punhado.
    //
    // Diferente dos dois de cima, `0` aqui não desliga — significa "nenhuma tolerância". A guarda
    // inteira só vale quando algum teto de dinheiro está ligado (ver `decideAiQuota`).
    AI_QUOTA_UNPRICED_DAILY_CALLS: z.coerce.number().int().nonnegative().default(20),
    // Add-on de insights (#160), habilitado à mão enquanto a cobrança (#158) não
    // existe: lista de ids de grupo separados por vírgula. Vazio = ninguém tem o
    // painel pago. DÍVIDA DECLARADA: lista manual envelhece — grupo que cancelar
    // continua ligado até alguém editar o env. Sai quando a #158 entrar.
    INSIGHTS_ADDON_GROUP_IDS: z.string().default(''),

    // Superfície de intenção do `/mcp` (eval da fronteira de tools). Desligada por padrão, e
    // `SuperficieDeIntencao` recusa subir com ela ligada em produção.
    MCP_SUPERFICIE_INTENCAO: z.enum(['', '0', '1', 'true', 'false']).default(''),

    // Asaas: cobrança B2B (#158) e assinatura PRO pela web (ADR 024). As três são
    // opcionais e a instância que não cobra ninguém não preenche nenhuma: sem elas
    // o provedor não nasce (`AsaasProvider.fromEnv` recusa) e o checkout responde
    // 503, sem mudar mais nada no app.
    //
    // A chave de PRODUÇÃO não vive no repositório nem no CI: o sandbox tem chave
    // própria, e o teste do adapter troca o `fetch` global — `fromEnv` recusa
    // rodar em `NODE_ENV=test` justamente para que ninguém precise de chave para
    // testar.
    ASAAS_BASE_URL: z.string().url().optional().or(z.literal('')),
    ASAAS_API_KEY: z.string().optional().or(z.literal('')),
    // Segredo compartilhado configurado no painel do Asaas e devolvido por ele no
    // header `asaas-access-token`. É a única autenticação do webhook, que é rota
    // pública por natureza.
    ASAAS_WEBHOOK_TOKEN: z.string().optional().or(z.literal('')),

    // Plano Free/PRO (ADR 024). `false` (padrão) = a IA hospedada vale para todo
    // mundo, que é o certo para instância auto-hospedada: quem roda o próprio
    // modelo não tem o que vender. A instância pública liga com `true`, e aí só
    // PRO (assinatura ou assento) usa chat, ditado e foto.
    AI_REQUIRES_PLAN: z
      .enum(['true', 'false', '1', '0', ''])
      .default('false')
      .transform((v) => v === 'true' || v === '1'),
    // Preço do PRO em centavos. Mudar aqui vale para checkouts novos; quem já
    // assina continua no valor da assinatura dele no Asaas. Nas lojas o preço é o
    // do produto cadastrado lá.
    BILLING_PRO_MONTHLY_CENTS: z.coerce.number().int().positive().default(1990),
    BILLING_PRO_YEARLY_CENTS: z.coerce.number().int().positive().default(17900),
    /** Teste grátis do PRO, em dias (#386). 0 desliga o teste na web. */
    BILLING_PRO_TRIAL_DAYS: z.coerce.number().int().min(0).max(30).default(7),
    // Preço de um assento de comunidade por mês (ADR 025). Vale para compras e
    // aumentos novos; o pool guarda o preço com que foi comprado.
    BILLING_SEAT_MONTHLY_CENTS: z.coerce.number().int().positive().default(1490),

    // RevenueCat (compra dentro do app, Apple e Google). Vazio = webhook recusa e
    // o app não oferece compra. `REVENUECAT_WEBHOOK_AUTH` é o valor do header
    // `Authorization` configurado no painel; `REVENUECAT_SECRET_KEY` (sk_…) lê o
    // assinante na REST, que é a fonte da verdade do estado.
    REVENUECAT_WEBHOOK_AUTH: z.string().optional().or(z.literal('')),
    REVENUECAT_SECRET_KEY: z.string().optional().or(z.literal('')),
    REVENUECAT_ENTITLEMENT_ID: z.string().min(1).default('pro'),
    REVENUECAT_BASE_URL: z.string().url().default('https://api.revenuecat.com'),

    // Mídia publicada pela comunidade (ADR 028): bucket S3 privado — Cloudflare R2
    // em produção, SeaweedFS no compose do dev. Vazio = o envio de imagem responde
    // 503 e o resto do produto segue. Prefixo próprio para não colidir com o
    // `S3_*` do backup offsite (`infra/backup.sh`).
    MEDIA_S3_ENDPOINT: z.string().url().optional().or(z.literal('')),
    MEDIA_S3_REGION: z.string().optional().or(z.literal('')),
    MEDIA_S3_BUCKET: z.string().optional().or(z.literal('')),
    MEDIA_S3_ACCESS_KEY_ID: z.string().optional().or(z.literal('')),
    MEDIA_S3_SECRET_ACCESS_KEY: z.string().optional().or(z.literal('')),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    // Em produção os segredos de link precisam ter entropia de verdade: quem descobre o do
    // descadastro (#398) descadastra qualquer pessoa; quem descobre o do convite (#401) refaz
    // o link de qualquer convite sem e-mail. Vazio desliga o recurso.
    for (const chave of ['EMAIL_UNSUBSCRIBE_SECRET', 'INVITE_LINK_SECRET'] as const) {
      const segredo = env[chave];
      if (!segredo) continue;
      const problema = weakUnsubscribeSecret(segredo);
      if (problema) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [chave],
          message: `${chave} ${problema}. Gere com \`openssl rand -hex 32\` ou deixe vazio.`,
        });
      }
    }
    // Segredos iguais: quem descobre um descobre o outro.
    if (env.INVITE_LINK_SECRET && env.INVITE_LINK_SECRET === env.EMAIL_UNSUBSCRIBE_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['INVITE_LINK_SECRET'],
        message:
          'INVITE_LINK_SECRET precisa ser diferente de EMAIL_UNSUBSCRIBE_SECRET. Gere outro com `openssl rand -hex 32`.',
      });
    }
  });

/**
 * Por que o segredo do descadastro é fraco, ou `null` se serve: pelo menos 32
 * bytes aleatórios em hex (64+ caracteres) ou base64/base64url (43+), sem
 * placeholder e sem repetição óbvia.
 */
export function weakUnsubscribeSecret(segredo: string): string | null {
  if (/troque|change_?me|placeholder|example|secret|segredo/i.test(segredo)) {
    return 'é o valor de exemplo';
  }
  const hex = /^[0-9a-f]+$/i.test(segredo);
  const b64 = /^[A-Za-z0-9+/_-]+={0,2}$/.test(segredo);
  if (!hex && !b64) return 'precisa ser hex ou base64 (32 bytes aleatórios)';
  const bytes = hex ? segredo.length / 2 : Math.floor((segredo.replace(/=+$/, '').length * 3) / 4);
  if (bytes < 32) return 'precisa de pelo menos 32 bytes';
  if (new Set(segredo).size < (hex ? 10 : 16)) return 'tem pouca variedade para ser aleatório';
  // Um bloco curto repetido ("abc…abc…") tem variedade mas não tem 32 bytes de acaso.
  if (/^(.{4,})\1+$/.test(segredo.replace(/=+$/, ''))) return 'é um bloco repetido';
  return null;
}

export type AppEnv = z.infer<typeof AppEnvSchema>;
