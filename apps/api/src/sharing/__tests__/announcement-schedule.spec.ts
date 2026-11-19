import { AnnouncementRepeat } from '@fatia/db';
import { dueOccurrence, nextOccurrence } from '../announcement-schedule';

const SP = 'America/Sao_Paulo';
const NY = 'America/New_York';
const z = (iso: string) => new Date(iso);

/**
 * A agenda dos comunicados que repetem (#394): conta a partir do primeiro
 * horário (a âncora), no fuso da comunidade, e não do último disparo em UTC.
 */
describe('agenda dos comunicados', () => {
  it('todo mês volta ao dia da âncora: 31/jan → 28/fev → 31/mar', () => {
    const anchor = z('2027-01-31T13:00:00Z'); // 10h em São Paulo
    const fev = nextOccurrence(anchor, anchor, AnnouncementRepeat.MONTHLY, SP)!;
    expect(fev.toISOString()).toBe('2027-02-28T13:00:00.000Z');
    const mar = nextOccurrence(anchor, fev, AnnouncementRepeat.MONTHLY, SP)!;
    expect(mar.toISOString()).toBe('2027-03-31T13:00:00.000Z');
  });

  it('22h em São Paulo já é outro dia em UTC e não escorrega de dia', () => {
    const anchor = z('2027-05-01T01:00:00Z'); // 30/abr 22h em São Paulo
    expect(nextOccurrence(anchor, anchor, AnnouncementRepeat.MONTHLY, SP)!.toISOString()).toBe(
      '2027-05-31T01:00:00.000Z', // 30/mai 22h
    );
    expect(nextOccurrence(anchor, anchor, AnnouncementRepeat.DAILY, SP)!.toISOString()).toBe(
      '2027-05-02T01:00:00.000Z',
    );
  });

  it('todo dia e toda semana seguem a hora local quando o fuso muda de horário', () => {
    const anchor = z('2027-03-08T14:00:00Z'); // segunda 9h em Nova York (EST)
    expect(nextOccurrence(anchor, anchor, AnnouncementRepeat.WEEKLY, NY)!.toISOString()).toBe(
      '2027-03-15T13:00:00.000Z', // 9h EDT
    );
    const sab = z('2027-03-13T14:00:00Z');
    expect(nextOccurrence(anchor, sab, AnnouncementRepeat.DAILY, NY)!.toISOString()).toBe(
      '2027-03-14T13:00:00.000Z',
    );
  });

  it('sem repetir não há próximo', () => {
    const anchor = z('2027-01-31T13:00:00Z');
    expect(nextOccurrence(anchor, anchor, AnnouncementRepeat.NONE, SP)).toBeNull();
  });

  it('depois de ficar fora do ar, publica só o último atrasado e pula para o futuro', () => {
    const anchor = z('2027-01-10T12:00:00Z');
    const now = z('2027-01-13T18:00:00Z');
    const r = dueOccurrence(anchor, anchor, now, AnnouncementRepeat.DAILY, SP);
    expect(r.at.toISOString()).toBe('2027-01-13T12:00:00.000Z');
    expect(r.next!.toISOString()).toBe('2027-01-14T12:00:00.000Z');

    const unica = dueOccurrence(anchor, anchor, now, AnnouncementRepeat.NONE, SP);
    expect(unica).toEqual({ at: anchor, next: null });
  });
});
