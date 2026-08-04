import { readFileSync } from 'node:fs';
import { CHALLENGE_METRICS } from '../challenge-metric';
import { RAIZ_SOCIAL, fontesDeSocial } from './fontes';

/**
 * A proteção de produto da #161 virando teste.
 *
 * Comparar peso, medida ou alimentação entre pessoas é gatilho conhecido em app
 * de fitness. A issue pede que a escolha segura seja o **padrão**; aqui ela é a
 * única — e a diferença entre "padrão" e "única" é este arquivo. Regra que mora
 * na tela é sugestão: some no primeiro formulário novo. Regra que quebra o CI
 * obriga quem quiser mudá-la a decidir de propósito, na revisão.
 */

describe('nenhuma comparação corporal no social', () => {
  it('as métricas de desafio são exatamente as quatro de atividade', () => {
    // Lista literal, e não `toContain`: acrescentar `WEIGHT_LOSS` tem de falhar
    // aqui. Com `toContain`, o valor novo entraria calado.
    expect([...CHALLENGE_METRICS]).toEqual([
      'WORKOUT_SESSIONS',
      'STEPS',
      'WATER_ML',
      'ACTIVE_DAYS',
    ]);
  });

  it('nenhum nome de métrica fala de corpo, peso ou dieta', () => {
    // Guarda de forma, para a métrica que passar pela revisão com outro nome:
    // `BODY_FAT_DROP` não está na lista literal acima, mas cair aqui explica
    // *por quê* está proibida, em vez de só dizer "a lista mudou".
    const proibidos = /WEIGHT|BODY|FAT|BMI|MEASURE|WAIST|CALORIE|KCAL|MEAL|DIET/;
    for (const metrica of CHALLENGE_METRICS) {
      expect(metrica).not.toMatch(proibidos);
    }
  });

  it('nenhuma fonte de social/ toca em dado corporal ou de nutrição', () => {
    const fontes = fontesDeSocial();

    // Sem esta linha o teste passaria com a pasta vazia — e passaria também se
    // um `readdirSync` errado devolvesse nada, que é o jeito silencioso de um
    // guarda de varredura morrer.
    expect(fontes.length).toBeGreaterThanOrEqual(2);
    expect(fontes.map((f) => f.replace(`${RAIZ_SOCIAL}/`, ''))).toContain('scoreboard.service.ts');

    const proibidos = [
      /\bweightLog\b/,
      /\bweightKg\b/,
      /\bheightCm\b/,
      /\bbodyFat\b/,
      /\bmeal\b/i,
      /\bmealItem\b/,
      /\bnutrientTarget\b/,
    ];

    for (const arquivo of fontes) {
      const conteudo = readFileSync(arquivo, 'utf8');
      for (const proibido of proibidos) {
        expect({ arquivo, casou: proibido.test(conteudo) }).toEqual({ arquivo, casou: false });
      }
    }
  });
});
