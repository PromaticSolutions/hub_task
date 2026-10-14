import type { Priority, ProjectStatus, Status } from '../../shared/types';

export const STATUS_META: Record<Status, { label: string; short: string; color: string }> = {
  todo: { label: 'A Fazer', short: 'A Fazer', color: 'var(--st-todo)' },
  in_progress: { label: 'Em Andamento', short: 'Andamento', color: 'var(--st-progress)' },
  blocked: { label: 'Bloqueado', short: 'Bloqueado', color: 'var(--st-blocked)' },
  review: { label: 'Homologação', short: 'Homologação', color: 'var(--st-review)' },
  done: { label: 'Finalizado', short: 'Finalizado', color: 'var(--st-done)' },
};

export const PRIORITY_META: Record<Priority, { label: string; weight: number }> = {
  low: { label: 'Baixa', weight: 1 },
  medium: { label: 'Média', weight: 2 },
  high: { label: 'Alta', weight: 3 },
  urgent: { label: 'Urgente', weight: 4 },
};

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string }> = {
  active: { label: 'Ativo' },
  paused: { label: 'Pausado' },
  done: { label: 'Concluído' },
};

/** Identification colors offered for clients, members and tasks. All work with white or dark text. */
export const PALETTE = [
  '#166534',
  '#15803d',
  '#0d9488',
  '#0891b2',
  '#0369a1',
  '#2563eb',
  '#4f46e5',
  '#7c3aed',
  '#a21caf',
  '#be185d',
  '#dc2626',
  '#c2410c',
  '#d97706',
  '#a16207',
  '#4d7c0f',
  '#475569',
];

export const SORT_LABELS = {
  manual: 'Manual',
  due: 'Prazo',
  priority: 'Prioridade',
  created: 'Data de criação',
} as const;

export type SortKey = keyof typeof SORT_LABELS;

export const VIEW_LABELS = {
  kanban: 'Kanban',
  list: 'Lista',
  calendar: 'Calendário',
} as const;

export type ViewMode = keyof typeof VIEW_LABELS;
export const VIEW_ORDER: ViewMode[] = ['kanban', 'list', 'calendar'];
