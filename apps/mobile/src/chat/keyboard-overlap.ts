/**
 * Quanto o teclado invade uma área da tela, as duas em coordenadas da janela. No Android
 * edge-to-edge a janela não encolhe com o teclado (o `adjustResize` não vale mais), e o
 * `KeyboardAvoidingView` sem `behavior` não faz nada: quem tem campo embaixo empurra sozinho.
 */
export function keyboardOverlap(
  area: { y: number; height: number },
  keyboardTop: number | null,
): number {
  if (keyboardTop == null) return 0;
  return Math.max(0, Math.round(area.y + area.height - keyboardTop));
}
