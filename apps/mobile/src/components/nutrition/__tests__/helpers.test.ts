import { describe, expect, it } from 'vitest';
import { ApiError, type Food } from '@fatia/api-client';
import {
  MENSAGEM_DE_CONFLITO,
  alturaDaBarra,
  caminhoDeBarra,
  deslocarDia,
  formatarDiaCurto,
  inicialDoDia,
  mensagemDeErro,
  parseNaoNegativo,
  parsePositivo,
  percentualDaMeta,
  previaDoAlimento,
  resumoDoItem,
  totalKcal,
} from '../helpers';

const arroz: Food = {
  id: 1,
  name: 'Arroz branco cozido',
  source: 'TACO',
  groupId: null,
  kcalPer100g: 128,
  proteinPer100g: 2.5,
  carbsPer100g: 28.1,
  fatPer100g: 0.2,
  createdByUserId: null,
};

describe('deslocarDia', () => {
  it('anda para frente e para trás mantendo o formato ISO', () => {
    expect(deslocarDia('2026-05-19', 1)).toBe('2026-05-20');
    expect(deslocarDia('2026-05-19', -1)).toBe('2026-05-18');
  });

  it('atravessa a virada de mês e de ano', () => {
    expect(deslocarDia('2026-01-31', 1)).toBe('2026-02-01');
    expect(deslocarDia('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('atravessa a virada de horário de verão sem pular um dia', () => {
    // 2026-10-18 é uma data típica de mudança de fuso no hemisfério sul; com
    // meia-noite como referência, somar 1 dia pode cair no mesmo dia.
    expect(deslocarDia('2026-10-17', 1)).toBe('2026-10-18');
    expect(deslocarDia('2026-10-18', 1)).toBe('2026-10-19');
  });
});

describe('formatarDiaCurto e inicialDoDia', () => {
  it('mostra dia da semana abreviado em português', () => {
    // 2026-05-19 é uma terça-feira.
    expect(formatarDiaCurto('2026-05-19')).toBe('ter, 19/05');
  });

  it('devolve a inicial do dia da semana', () => {
    expect(inicialDoDia('2026-05-17')).toBe('D'); // domingo
    expect(inicialDoDia('2026-05-19')).toBe('T'); // terça
  });
});

describe('parsePositivo', () => {
  it('aceita número maior que zero', () => {
    expect(parsePositivo('150')).toBe(150);
    expect(parsePositivo('0.5')).toBe(0.5);
  });

  it('recusa zero, negativo e texto', () => {
    expect(parsePositivo('0')).toBeNull();
    expect(parsePositivo('-3')).toBeNull();
    expect(parsePositivo('abc')).toBeNull();
    expect(parsePositivo('')).toBeNull();
  });
});

describe('parseNaoNegativo', () => {
  it('trata campo vazio como ausente, não como zero', () => {
    expect(parseNaoNegativo('')).toBeUndefined();
    expect(parseNaoNegativo('   ')).toBeUndefined();
    expect(parseNaoNegativo('0')).toBe(0);
  });

  it('descarta valor inválido ou negativo', () => {
    expect(parseNaoNegativo('-1')).toBeUndefined();
    expect(parseNaoNegativo('abc')).toBeUndefined();
  });
});

describe('previaDoAlimento', () => {
  it('escala os macros pela quantidade em gramas', () => {
    expect(previaDoAlimento(arroz, '200')).toEqual({
      kcal: 256,
      proteinG: 5,
      carbsG: 56,
      fatG: 0,
    });
  });

  it('não calcula prévia com quantidade inválida', () => {
    expect(previaDoAlimento(arroz, '')).toBeNull();
    expect(previaDoAlimento(arroz, '0')).toBeNull();
  });
});

describe('totalKcal e resumoDoItem', () => {
  it('soma as calorias dos itens', () => {
    expect(totalKcal([{ kcal: 128.4 }, { kcal: 71.6 }])).toBe(200);
    expect(totalKcal([])).toBe(0);
  });

  it('monta o resumo do item com macros arredondados', () => {
    expect(resumoDoItem({ grams: 120, kcal: 209.7, proteinG: 8.4, carbsG: 20.2, fatG: 2.6 })).toBe(
      '120g · 210 kcal · P8 C20 G3',
    );
  });
});

describe('mensagemDeErro', () => {
  it('traduz 409 para a mensagem de refeição duplicada', () => {
    const erro = new ApiError('Conflict', 409, {});
    expect(mensagemDeErro(erro)).toBe(MENSAGEM_DE_CONFLITO);
  });

  it('permite uma mensagem de conflito específica do contexto', () => {
    const erro = new ApiError('Conflict', 409, {});
    expect(mensagemDeErro(erro, { conflito: 'Item repetido' })).toBe('Item repetido');
  });

  it('mantém a mensagem da API nos demais status', () => {
    expect(mensagemDeErro(new ApiError('Gramas inválidas', 400, {}))).toBe('Gramas inválidas');
  });

  it('cai na alternativa quando o erro não tem mensagem', () => {
    expect(mensagemDeErro({}, { alternativa: 'Falhou' })).toBe('Falhou');
  });
});

describe('percentualDaMeta e alturaDaBarra', () => {
  it('limita o percentual a 100', () => {
    expect(percentualDaMeta(50, 200)).toBe(25);
    expect(percentualDaMeta(400, 200)).toBe(100);
  });

  it('devolve zero quando não há meta', () => {
    expect(percentualDaMeta(50, 0)).toBe(0);
  });

  it('garante altura mínima visível para o dia sem registro', () => {
    expect(alturaDaBarra(0, 2000, 80)).toBe(4);
    expect(alturaDaBarra(1000, 2000, 80)).toBe(40);
    expect(alturaDaBarra(10, 0, 80)).toBe(4);
  });
});

describe('caminhoDeBarra', () => {
  it('fecha o caminho na linha de base', () => {
    const d = caminhoDeBarra(0, 20, 24, 60);
    expect(d.startsWith('M0,80')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('não arredonda mais do que a barra comporta', () => {
    expect(caminhoDeBarra(0, 76, 24, 4)).toContain('Q0,76 4,76');
  });
});
