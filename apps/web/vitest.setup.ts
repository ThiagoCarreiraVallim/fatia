import '@testing-library/jest-dom/vitest';

// O jsdom não implementa a captura de ponteiro, e o vaul (folhas como a ConfirmSheet) a chama
// no pointerdown de qualquer coisa dentro da folha. Sem isto, clicar num botão da folha vira
// erro não tratado e derruba a execução.
if (typeof Element !== 'undefined' && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
}
