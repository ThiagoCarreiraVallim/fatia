/**
 * Imprime os blocos de tokens (escuro e claro) em HSL, para colar nos três CSS
 * depois de mudar `src/tokens.ts`. Rode `pnpm --filter @fatia/design css`
 * (constrói o dist antes). O teste `css-parity.test.ts` confere o resultado.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { cssVariables, SOFT_TOKENS, hexToHslTriplet } = require('../dist');

for (const theme of ['dark', 'light']) {
  console.log(`/* ---- ${theme} ---- */`);
  console.log(cssVariables(theme));
  for (const [name, values] of Object.entries(SOFT_TOKENS)) {
    const [hex, alpha] = values[theme];
    console.log(`--${name}: ${hexToHslTriplet(hex)} / ${alpha};`);
  }
}
