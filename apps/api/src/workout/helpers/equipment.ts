/**
 * Os equipamentos do catálogo (`Exercise.equipment`), como o seed os grava.
 * É a lista que a academia marca no painel (Fase 7b) para o filtro "Na minha
 * academia". "peso corporal" não entra: está em toda academia, e o filtro o
 * inclui sempre. "outro" também não, porque não diz nada sobre o que a casa tem.
 */
export const GYM_EQUIPMENT = [
  'barra',
  'barra W',
  'halteres',
  'polia',
  'máquina',
  'kettlebell',
  'elástico',
  'bola medicinal',
  'bola suíça',
  'rolo de espuma',
] as const;

export const BODYWEIGHT = 'peso corporal';
