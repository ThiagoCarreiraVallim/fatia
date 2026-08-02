import { redirect } from 'next/navigation';

/**
 * Rota antiga da tela "Conectar com Claude" (issue #164).
 *
 * O fluxo guiado vive em `/profile/connect`. Este arquivo continua existindo só para não quebrar
 * link salvo ou aberto em outra aba — manter a tela antiga viva ao lado da nova é garantir que a
 * errada continue sendo encontrada, e ela mandava colar um endereço de exemplo que nunca
 * funcionou.
 */
export default function TokensPage() {
  redirect('/profile/connect');
}
