import { AlertTriangle, CalendarClock, CheckCircle2, ChevronsUp, Equal, ChevronUp, ChevronDown } from 'lucide-react';
import type { Client, Priority, Status, Task } from '../../../shared/types';
import { PRIORITY_META, STATUS_META } from '../../lib/constants';
import { daysUntil, formatDay, formatDueShort, isOverdue } from '../../lib/dates';

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`badge status-${status}`}>
      <span className="badge-dot" />
      {STATUS_META[status].label}
    </span>
  );
}

const PRIORITY_ICON = {
  low: ChevronDown,
  medium: Equal,
  high: ChevronUp,
  urgent: ChevronsUp,
};

export function PriorityBadge({ priority, compact }: { priority: Priority; compact?: boolean }) {
  const Icon = PRIORITY_ICON[priority];
  return (
    <span className={`badge prio-${priority}`} title={`Prioridade ${PRIORITY_META[priority].label.toLowerCase()}`}>
      <Icon size={13} strokeWidth={2.5} />
      {!compact && PRIORITY_META[priority].label}
    </span>
  );
}

export function ClientChip({ client }: { client: Client | null | undefined }) {
  if (!client) return null;
  return (
    <span className="chip" style={{ ['--chip-color' as string]: client.color }} title={client.name}>
      <span className="chip-dot" />
      <span className="truncate">{client.name}</span>
    </span>
  );
}

export function DueChip({ task }: { task: Pick<Task, 'dueDate' | 'status'> }) {
  if (!task.dueDate) return null;
  const overdue = isOverdue(task);
  const done = task.status === 'done';
  const today = !done && daysUntil(task.dueDate) === 0;
  const cls = done ? 'done' : overdue ? 'overdue' : today ? 'today' : '';
  const Icon = done ? CheckCircle2 : overdue ? AlertTriangle : CalendarClock;
  const label = overdue ? `Atrasada · ${formatDueShort(task.dueDate)}` : formatDueShort(task.dueDate);
  return (
    <span className={`due ${cls}`} title={`Previsão de entrega: ${formatDay(task.dueDate, "d 'de' MMMM 'de' yyyy")}`}>
      <Icon size={12} strokeWidth={2.4} />
      {label}
    </span>
  );
}
