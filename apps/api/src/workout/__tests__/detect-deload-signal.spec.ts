import { DELOAD_WINDOW, detectDeloadSignal } from '../helpers/detect-deload-signal';

/** Pontos da MAIS RECENTE para a mais antiga, como o service entrega. */
const pontos = (...valores: Array<[number | null, number]>) =>
  valores.map(([avgRpe, topSetKg]) => ({ avgRpe, topSetKg }));

describe('detectDeloadSignal', () => {
  it('sinaliza quando o RPE sobe com a carga parada', () => {
    const sinal = detectDeloadSignal(pontos([9, 60], [8, 60], [7, 60]));

    expect(sinal).toEqual({ suggested: true, rpeDelta: 2, loadDeltaKg: 0 });
  });

  it('sinaliza quando o RPE sobe e a carga CAI', () => {
    const sinal = detectDeloadSignal(pontos([9, 55], [8, 57.5], [7.5, 60]));

    expect(sinal.suggested).toBe(true);
  });

  it('NÃO sinaliza quando o RPE sobe junto com a carga: isso é progresso', () => {
    // A condição dupla existe por causa deste caso. Com uma condição só, toda
    // dupla progressão bem-sucedida viraria motivo de deload.
    const sinal = detectDeloadSignal(pontos([9, 65], [8, 62.5], [7, 60]));

    expect(sinal).toEqual({ suggested: false, reason: 'load_rising' });
  });

  it('NÃO sinaliza com o RPE subindo menos de um ponto', () => {
    const sinal = detectDeloadSignal(pontos([8.5, 60], [8.2, 60], [8, 60]));

    expect(sinal).toEqual({ suggested: false, reason: 'rpe_not_rising' });
  });

  it('NÃO sinaliza com o RPE em queda', () => {
    const sinal = detectDeloadSignal(pontos([6, 60], [7, 60], [8, 60]));

    expect(sinal).toEqual({ suggested: false, reason: 'rpe_not_rising' });
  });

  it('exige a janela cheia de sessões', () => {
    const sinal = detectDeloadSignal(pontos([9, 60], [7, 60]));

    expect(sinal).toEqual({ suggested: false, reason: 'insufficient_history' });
  });

  it('ignora sessão sem RPE em vez de completar a janela com ela', () => {
    // Sessão sem RPE não é sessão com RPE baixo. Se a do meio entrasse valendo
    // zero, o delta seria inventado — e o deload viria de um número que ninguém
    // registrou.
    const sinal = detectDeloadSignal(pontos([9, 60], [null, 60], [7, 60]));

    expect(sinal).toEqual({ suggested: false, reason: 'insufficient_history' });
  });

  it('compara as pontas da janela, não a sessão anterior', () => {
    // Subida de 0,6 por sessão: nenhum par consecutivo chega a 1 ponto, mas as
    // pontas da janela chegam. Comparar só com a sessão anterior perderia a
    // fadiga que se acumula devagar, que é justamente a que interessa.
    const sinal = detectDeloadSignal(pontos([8.2, 60], [7.6, 60], [7, 60]));

    expect(sinal.suggested).toBe(true);
  });

  it('olha só as sessões da janela, mesmo recebendo mais', () => {
    // A quarta sessão tem RPE 5 e carga 40; se entrasse na conta, o delta mudaria.
    const sinal = detectDeloadSignal(pontos([9, 60], [8, 60], [7, 60], [5, 40]));

    expect(sinal).toEqual({ suggested: true, rpeDelta: 2, loadDeltaKg: 0 });
    expect(DELOAD_WINDOW).toBe(3);
  });
});
