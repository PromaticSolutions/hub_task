import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';
import { PRIORITIES, STATUSES, type Priority, type Status, type Task } from '../../shared/types';
import { PRIORITY_META, type SortKey } from './constants';
import { addDaysKey, isOverdue, toDayKey, todayKey } from './dates';

export const NONE = 'none';

export const DUE_PRESETS = {
  today: 'Hoje',
  week: 'Esta semana',
  next7: 'Próximos 7 dias',
  month: 'Este mês',
  none: 'Sem prazo',
  custom: 'Personalizado',
} as const;

export type DuePreset = keyof typeof DUE_PRESETS;

export interface Filters {
  q: string;
  clients: string[];
  assignees: string[];
  statuses: Status[];
  priorities: Priority[];
  due: DuePreset | null;
  from: string | null;
  to: string | null;
  overdue: boolean;
  sort: SortKey;
  dir: 'asc' | 'desc';
}

export const EMPTY_FILTERS: Filters = {
  q: '',
  clients: [],
  assignees: [],
  statuses: [],
  priorities: [],
  due: null,
  from: null,
  to: null,
  overdue: false,
  sort: 'manual',
  dir: 'asc',
};

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);
const isDay = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function filtersFromParams(params: URLSearchParams): Filters {
  const sort = params.get('sort') as SortKey | null;
  const due = params.get('due') as DuePreset | null;
  return {
    q: params.get('q') ?? '',
    clients: list(params.get('client')),
    assignees: list(params.get('assignee')),
    statuses: list(params.get('status')).filter((s): s is Status => (STATUSES as readonly string[]).includes(s)),
    priorities: list(params.get('priority')).filter((p): p is Priority => (PRIORITIES as readonly string[]).includes(p)),
    due: due && due in DUE_PRESETS ? due : null,
    from: isDay(params.get('from')),
    to: isDay(params.get('to')),
    overdue: params.get('overdue') === '1',
    sort: sort && ['manual', 'due', 'priority', 'created'].includes(sort) ? sort : 'manual',
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
  };
}

/** Writes filters into the URL, keeping unrelated params such as the open task. */
export function writeFilters(params: URLSearchParams, f: Filters): URLSearchParams {
  const next = new URLSearchParams(params);
  const put = (key: string, value: string | null | undefined) => {
    if (value) next.set(key, value);
    else next.delete(key);
  };
  put('q', f.q.trim() ? f.q : null);
  put('client', f.clients.join(','));
  put('assignee', f.assignees.join(','));
  put('status', f.statuses.join(','));
  put('priority', f.priorities.join(','));
  put('due', f.due);
  put('from', f.due === 'custom' ? f.from : null);
  put('to', f.due === 'custom' ? f.to : null);
  put('overdue', f.overdue ? '1' : null);
  put('sort', f.sort === 'manual' ? null : f.sort);
  put('dir', f.sort !== 'manual' && f.dir === 'desc' ? 'desc' : null);
  return next;
}

export function countActiveFilters(f: Filters): number {
  return (
    (f.clients.length ? 1 : 0) +
    (f.assignees.length ? 1 : 0) +
    (f.statuses.length ? 1 : 0) +
    (f.priorities.length ? 1 : 0) +
    (f.due ? 1 : 0) +
    (f.overdue ? 1 : 0)
  );
}

export function hasAnyFilter(f: Filters): boolean {
  return countActiveFilters(f) > 0 || f.q.trim() !== '' || f.sort !== 'manual';
}

function dueRange(f: Filters): [string | null, string | null] | 'none' | null {
  const now = new Date();
  const today = todayKey();
  switch (f.due) {
    case 'today':
      return [today, today];
    case 'week':
      return [
        toDayKey(startOfWeek(now, { weekStartsOn: 0 })),
        toDayKey(endOfWeek(now, { weekStartsOn: 0 })),
      ];
    case 'next7':
      return [today, addDaysKey(today, 7)];
    case 'month':
      return [toDayKey(startOfMonth(now)), toDayKey(endOfMonth(now))];
    case 'none':
      return 'none';
    case 'custom':
      return f.from || f.to ? [f.from, f.to] : null;
    default:
      return null;
  }
}

function normalizeText(s: string) {
  return s
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function applyFilters(tasks: Task[], f: Filters): Task[] {
  const q = normalizeText(f.q.trim());
  const range = dueRange(f);
  const today = todayKey();
  return tasks.filter((t) => {
    if (q) {
      const hay = normalizeText(`${t.title} ${t.description} #${t.number}`);
      if (!hay.includes(q)) return false;
    }
    if (f.clients.length && !f.clients.includes(t.clientId ?? NONE)) return false;
    if (f.assignees.length) {
      const people = [t.assigneeId ?? NONE];
      if (!f.assignees.some((a) => people.includes(a))) return false;
    }
    if (f.statuses.length && !f.statuses.includes(t.status)) return false;
    if (f.priorities.length && !f.priorities.includes(t.priority)) return false;
    if (f.overdue && !isOverdue(t, today)) return false;
    if (range === 'none') {
      if (t.dueDate) return false;
    } else if (range) {
      if (!t.dueDate) return false;
      if (range[0] && t.dueDate < range[0]) return false;
      if (range[1] && t.dueDate > range[1]) return false;
    }
    return true;
  });
}

export function sortTasks(tasks: Task[], sort: SortKey, dir: 'asc' | 'desc'): Task[] {
  const sign = dir === 'desc' ? -1 : 1;
  const copy = [...tasks];
  switch (sort) {
    case 'due':
      // Tasks without a due date always go last.
      return copy.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return a.order - b.order;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return sign * a.dueDate.localeCompare(b.dueDate) || a.order - b.order;
      });
    case 'priority':
      return copy.sort(
        (a, b) => sign * (PRIORITY_META[b.priority].weight - PRIORITY_META[a.priority].weight) || a.order - b.order,
      );
    case 'created':
      return copy.sort((a, b) => sign * a.createdAt.localeCompare(b.createdAt));
    default:
      return copy.sort((a, b) => a.order - b.order);
  }
}
