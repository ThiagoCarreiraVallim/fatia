import { z } from 'zod';
import { ShareScope } from '@fatia/db';

/**
 * Os dois campos do consentimento dado à equipe da comunidade (ADR 026), com a
 * mesma descrição em toda tool que os aceita: `join_group`,
 * `accept_group_invite` e `set_group_sharing`.
 */
export const groupConsentSchema = {
  scopes: z
    .array(z.nativeEnum(ShareScope))
    .describe(
      'Categorias que a equipe da comunidade (dono, profissionais e criadores) pode ver: ' +
        'WORKOUT (treino), NUTRITION (alimentação), BODY (peso e medidas), HABITS (água e ' +
        'passos), GOALS (metas). Lista vazia não compartilha nada',
    ),
  statsOptIn: z
    .boolean()
    .describe(
      'Entrar nas estatísticas agregadas e anônimas da comunidade (nunca individuais, e só ' +
        'com amostra mínima)',
    ),
} as const;
