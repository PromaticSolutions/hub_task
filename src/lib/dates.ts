import { differenceInCalendarDays, format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Task } from '../../shared/types';

/** Local calendar day as YYYY-MM-DD. */
export function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayKey(): string {
  return toDayKey(new Date());
}

/** Parses a YYYY-MM-DD key as a local date (no timezone shift). */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isOverdue(task: Pick<Task, 'dueDate' | 'status'>, today = todayKey()): boolean {
  return !!task.dueDate && task.status !== 'done' && task.dueDate < today;
}

export function daysUntil(dayKey: string): number {
  return differenceInCalendarDays(fromDayKey(dayKey), new Date());
}

export function formatDay(key: string, pattern = "d 'de' MMM"): string {
  return format(fromDayKey(key), pattern, { locale: ptBR });
}

export function formatDueShort(key: string): string {
  const diff = daysUntil(key);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  const date = fromDayKey(key);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return format(date, sameYear ? 'd MMM' : 'd MMM yyyy', { locale: ptBR });
}

export function formatDateTime(iso: string): string {
  return format(parseISO(iso), "d 'de' MMM 'de' yyyy, HH:mm", { locale: ptBR });
}

export function formatDate(iso: string): string {
  return format(parseISO(iso), "d 'de' MMM 'de' yyyy", { locale: ptBR });
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - parseISO(iso).getTime();
  if (diff < 45_000) return 'agora mesmo';
  return `há ${formatDistanceToNowStrict(parseISO(iso), { locale: ptBR })}`;
}

export function addDaysKey(key: string, days: number): string {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + days);
  return toDayKey(d);
}

export { ptBR };
