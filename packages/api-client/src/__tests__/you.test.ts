import { describe, expect, it } from 'vitest';
import {
  BRAZIL_UNITS,
  distanceToMeters,
  formatDistanceIn,
  formatLoad,
  isBrazilDefault,
  loadFieldValue,
  metersToDistance,
  loadNumber,
  loadToKg,
  unitPrefsOf,
  unitsPreview,
  unitsSummary,
} from '../units';
import { TUTORIALS, searchTutorials, tutorialSubtitle } from '../tutorials';
import {
  avatarUploadNotice,
  avatarVisibilityText,
  communityName,
  formatWhatsapp,
  initialsOf,
  keepPhotosText,
  newsCountLabel,
  newsDate,
  objectiveSummary,
  stepHeight,
  youHeaderLine,
} from '../you';
import { DELETE_ACCOUNT_CONFIRMATION, isDeleteConfirmed } from '../users';

describe('unidades (Al-V10/V10b)', () => {
  it('o padrão do Brasil é kg e km', () => {
    expect(unitPrefsOf(null)).toEqual(BRAZIL_UNITS);
    expect(isBrazilDefault(unitPrefsOf({ loadUnit: 'KG' }))).toBe(true);
    expect(isBrazilDefault({ loadUnit: 'LB', distanceUnit: 'KM' })).toBe(false);
  });

  it('a prévia da prancha: supino e corrida nas duas versões', () => {
    expect(unitsPreview(BRAZIL_UNITS)).toEqual({
      bench: '52,5 kg × 10',
      run: '5,2 km',
      equivalence: '115,7 lb = 52,5 kg',
    });
    expect(unitsPreview({ loadUnit: 'LB', distanceUnit: 'MI' })).toEqual({
      bench: '115,7 lb × 10',
      run: '3,2 milhas',
      equivalence: '52,5 kg = 115,7 lb',
    });
    expect(unitsPreview({ loadUnit: 'KG', distanceUnit: 'M' }).run).toBe('5.200 m');
  });

  it('carga em lb ida e volta não muda o kg guardado além de gramas', () => {
    expect(loadNumber(100, 'LB')).toBe('220,5');
    expect(loadToKg(220.5, 'LB')).toBeCloseTo(100, 1);
    expect(loadToKg(82.5, 'KG')).toBe(82.5);
    expect(formatLoad(60, 'KG')).toBe('60 kg');
    expect(formatLoad(null, 'LB')).toBe('—');
  });

  it('distância digitada na unidade da pessoa volta em metros', () => {
    expect(distanceToMeters(5.2, 'KM')).toBe(5200);
    expect(distanceToMeters(1, 'MI')).toBe(1609);
    expect(distanceToMeters(400, 'M')).toBe(400);
    expect(formatDistanceIn(1609.344, 'MI')).toBe('1 milhas');
    expect(formatDistanceIn(10250, 'KM')).toBe('10,25 km');
  });

  it('o campo mostra na unidade da pessoa e volta para kg e metros', () => {
    expect(loadFieldValue(100, 'LB')).toBe(220.5);
    expect(loadFieldValue(82.5, 'KG')).toBe(82.5);
    expect(loadToKg(loadFieldValue(100, 'LB'), 'LB')).toBeCloseTo(100, 1);
    expect(metersToDistance(5200, 'KM')).toBe(5.2);
    expect(metersToDistance(5200, 'MI')).toBe(3.23);
    expect(metersToDistance(5200, 'M')).toBe(5200);
    expect(distanceToMeters(metersToDistance(5200, 'MI'), 'MI')).toBeCloseTo(5200, -1);
  });

  it('a linha "Unidades" de Você resume a escolha', () => {
    expect(unitsSummary(BRAZIL_UNITS)).toBe('kg · km');
    expect(unitsSummary({ loadUnit: 'LB', distanceUnit: 'MI' })).toBe('lb · milhas');
  });
});

describe('ajuda e tutoriais (Al-V12/V12b)', () => {
  it('ids únicos e no formato que a API aceita', () => {
    const ids = TUTORIALS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{2,60}$/);
  });

  it('sem internet o vídeo fica indisponível e o texto continua', () => {
    const comVideo = { ...TUTORIALS[0]!, videoUrl: 'https://v', videoSeconds: 45 };
    expect(tutorialSubtitle(comVideo, true)).toBe('vídeo · 0:45');
    expect(tutorialSubtitle(comVideo, false)).toBe('texto · vídeo indisponível');
    expect(tutorialSubtitle({ ...comVideo, videoUrl: null }, true)).toBe('texto');
  });

  it('a busca ignora acento e caixa', () => {
    const r = searchTutorials('CODIGO');
    expect(r.flatMap((a) => a.items.map((t) => t.id))).toEqual(['codigo-de-barras']);
    expect(searchTutorials('').length).toBeGreaterThan(1);
  });
});

describe('Você (Al-V1, V8, V9, V11)', () => {
  const me = { name: 'Ana Demo', email: 'ana@email.com', nickname: null };

  it('cabeçalho: e-mail e o nome nas comunidades', () => {
    expect(youHeaderLine(me)).toBe('ana@email.com · nas comunidades: Ana');
    expect(communityName({ ...me, nickname: 'Aninha' })).toBe('Aninha');
    expect(initialsOf('Ana Demo')).toBe('AD');
    expect(initialsOf('')).toBe('?');
  });

  it('apagar só habilita com APAGAR (caixa e espaço não importam)', () => {
    expect(DELETE_ACCOUNT_CONFIRMATION).toBe('APAGAR');
    expect(isDeleteConfirmed(' apagar ')).toBe(true);
    expect(isDeleteConfirmed('APAGA')).toBe(false);
  });

  it('textos de visibilidade, fotos e WhatsApp', () => {
    expect(avatarVisibilityText('TEAM_ONLY')).toMatch(/só a equipe vê a foto/);
    expect(keepPhotosText(false).subtitle).toBe('A foto é usada e descartada');
    expect(formatWhatsapp('5565998123456')).toBe('(65) 99812-3456');
    expect(formatWhatsapp('556532123456')).toBe('(65) 3212-3456');
    expect(formatWhatsapp(null)).toBe('');
  });

  it('novidades: data curta e contador', () => {
    expect(newsDate('2026-11-10')).toBe('10 nov');
    expect(newsCountLabel(3)).toBe('3 novidades');
    expect(newsCountLabel(1)).toBe('1 novidade');
    expect(newsCountLabel(0)).toBe('Tudo lido');
    expect(newsCountLabel(2, '2026-11-09T10:00:00Z')).toBe('salvo em 9 nov');
  });

  it('objetivo e rotina em uma linha', () => {
    expect(
      objectiveSummary(
        { objective: 'LOSE', activityLevel: 'LIGHT', sex: 'FEMALE', birthDate: '1994-03-01' },
        new Date('2026-11-14T12:00:00Z'),
      ),
    ).toBe('Perder · leve · feminino, 32 anos');
    expect(
      objectiveSummary({ objective: null, activityLevel: null, sex: null, birthDate: null }),
    ).toBeNull();
  });

  it('estatura anda de 1 em 1 e fica entre 100 e 250', () => {
    expect(stepHeight(168, 1)).toBe(169);
    expect(stepHeight(100, -1)).toBe(100);
    expect(stepHeight(250, 1)).toBe(250);
  });
});

describe('avatarUploadNotice', () => {
  it('sem envio de mídia no servidor, explica por que a foto não troca', () => {
    expect(avatarUploadNotice({ mediaUploadEnabled: false })).toMatch(/não está disponível/);
  });

  it('com envio disponível (ou API de antes, sem o campo), não diz nada', () => {
    expect(avatarUploadNotice({ mediaUploadEnabled: true })).toBeNull();
    expect(avatarUploadNotice({})).toBeNull();
  });
});
