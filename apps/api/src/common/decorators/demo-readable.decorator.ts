import { SetMetadata } from '@nestjs/common';

export const DEMO_READABLE_KEY = 'fatia:demoReadable';

/**
 * Leitura que a sessão de demonstração (#412, "Abrir no app como Ana Exemplo")
 * pode fazer. Só vale em `GET` e só nas leituras do Hoje do aluno, sempre da
 * conta de quem chamou (`@CurrentUser`): a sessão é da aluna fictícia, então
 * nunca alcança dado de outra pessoa. Toda outra rota recusa o token de demo
 * com 403, e a lista inteira é conferida por `demo-session.spec.ts`.
 */
export const DemoReadable = () => SetMetadata(DEMO_READABLE_KEY, true);
