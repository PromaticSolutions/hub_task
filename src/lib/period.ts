import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import { fromDayKey, ptBR, toDayKey, todayKey } from './dates';

export type PeriodKind = 'day' | 'week' | 'month';

export interface Period {
  kind: PeriodKind;
  /** First and last day (inclusive), as YYYY-MM-DD keys. */
  start: string;
  end: string;
  days: string[];
  previous: { start: string; end: string };
  label: string;
  isCurrent: boolean;
  /** "Hoje", "Esta semana", "Este mês" — or the label itself when it's another period. */
  name: string;
  /** Used in "vs ..." comparisons. */
  against: string;
}

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1);

function bounds(kind: PeriodKind, anchor: Date): [Date, Date] {
  if (kind === 'day') return [anchor, anchor];
  if (kind === 'week') return [startOfWeek(anchor, { weekStartsOn: 0 }), endOfWeek(anchor, { weekStartsOn: 0 })];
  return [startOfMonth(anchor), endOfMonth(anchor)];
}

function weekLabel(start: Date, end: Date) {
  const sameYear = start.getFullYear() === end.getFullYear();
  const thisYear = end.getFullYear() === new Date().getFullYear();
  if (start.getMonth() === end.getMonth()) {
    return `${format(start, 'd')} – ${format(end, thisYear ? "d 'de' MMMM" : "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`;
  }
  const left = format(start, sameYear ? "d 'de' MMM" : "d 'de' MMM 'de' yyyy", { locale: ptBR });
  const right = format(end, thisYear && sameYear ? "d 'de' MMM" : "d 'de' MMM 'de' yyyy", { locale: ptBR });
  return `${left} – ${right}`;
}

export function shiftAnchor(kind: PeriodKind, anchor: string, step: number): string {
  const d = fromDayKey(anchor);
  const next = kind === 'day' ? addDays(d, step) : kind === 'week' ? addWeeks(d, step) : addMonths(d, step);
  return toDayKey(next);
}

export function periodOf(kind: PeriodKind, anchorKey: string): Period {
  const anchor = fromDayKey(anchorKey);
  const [start, end] = bounds(kind, anchor);
  const [prevStart, prevEnd] = bounds(kind, fromDayKey(shiftAnchor(kind, anchorKey, -1)));
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(toDayKey(d));
  const today = todayKey();
  const isCurrent = days[0] <= today && today <= days[days.length - 1];
  const thisYear = anchor.getFullYear() === new Date().getFullYear();
  const label =
    kind === 'day'
      ? capitalize(format(anchor, thisYear ? "EEEE, d 'de' MMMM" : "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR }))
      : kind === 'week'
        ? weekLabel(start, end)
        : capitalize(format(anchor, "MMMM 'de' yyyy", { locale: ptBR }));
  const names = { day: 'Hoje', week: 'Esta semana', month: 'Este mês' };
  const against = { day: anchorKey === today ? 'ontem' : 'dia anterior', week: 'semana anterior', month: 'mês anterior' };
  return {
    kind,
    start: days[0],
    end: days[days.length - 1],
    days,
    previous: { start: toDayKey(prevStart), end: toDayKey(prevEnd) },
    label,
    isCurrent,
    name: isCurrent ? names[kind] : label,
    against: against[kind],
  };
}

/** Local calendar day of an ISO timestamp. */
export const dayOf = (iso: string) => toDayKey(new Date(iso));

export const within = (key: string, range: { start: string; end: string }) => key >= range.start && key <= range.end;
