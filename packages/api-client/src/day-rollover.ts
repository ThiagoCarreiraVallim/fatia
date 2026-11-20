/**
 * A virada do dia nas abas que ficam montadas (Tabs). A tela que mostrava o
 * "hoje" de antes passa para o novo hoje; quem escolheu outro dia continua nele.
 */
export function followToday(selected: string, previousToday: string, today: string): string {
  return selected === previousToday ? today : selected;
}

/** Milissegundos até a próxima meia-noite local, mais um segundo de folga. */
export function msUntilNextDay(now: Date = new Date()): number {
  const amanha = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return amanha.getTime() - now.getTime() + 1000;
}
