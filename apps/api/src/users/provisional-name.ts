/**
 * Nome que ninguém escolheu: o que o provisionamento inventa quando a conta
 * chega sem perfil (o `sub`, o pedaço do e-mail antes do @ ou "User"). Não pode
 * aparecer no mural nem no ranking, e o ID token pode trocá-lo pelo nome real
 * (ADR 050).
 */
export function isProvisionalName(user: {
  name: string;
  email: string;
  logtoSub: string;
}): boolean {
  const name = user.name.trim();
  if (!name || name === 'User' || name === user.logtoSub) return true;
  // O que o provisionamento grava é `email.split('@')[0]`, na caixa do e-mail de
  // então (que o ID token depois normaliza). Igual com a mesma caixa é
  // provisório; com outra caixa, só se tiver cara de usuário de e-mail
  // ("Ana.Souza"), porque "Thiago" digitado por thiago@… é nome de verdade.
  const local = user.email.split('@')[0] ?? '';
  if (name === local) return true;
  return /[.\-_+0-9]/.test(name) && name.toLowerCase() === local.toLowerCase();
}
