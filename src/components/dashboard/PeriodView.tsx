import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Copy,
  Folder,
  MessageSquare,
  PlusCircle,
  Target,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { PRIORITY_META, STATUS_META } from '../../lib/constants';
import type { HistoryType, Task } from '../../../shared/types';
import { addDaysKey, formatDay, formatDueShort, fromDayKey, isOverdue, todayKey } from '../../lib/dates';
import { dayOf, within, type Period } from '../../lib/period';
import { useClientsById, useMembersById, useProjectsById } from '../../hooks/useLookups';
import { useTaskModal } from '../../hooks/useTaskModal';
import { Avatar } from '../ui/Avatar';
import { ChartCard, StatTile, type TipHandlers } from './charts';

type LinkFn = (extra: Record<string, string>) => string;

interface Bucket {
  key: string;
  label: string;
  short: string;
  /** Minor labels are dropped on narrow screens so they never collide. */
  minor: boolean;
  completed: number;
  created: number;
  /** Day to open when the bucket is clicked (week and month views). */
  drill?: string;
  isToday?: boolean;
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const isDone = (t: Task) => t.status === 'done' && !!t.completedAt;
const pad = (n: number) => String(n).padStart(2, '0');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Open work first (most urgent on top), finished work last. */
function sortAgenda(list: Task[]) {
  return [...list].sort(
    (a, b) =>
      Number(a.status === 'done') - Number(b.status === 'done') ||
      PRIORITY_META[b.priority].weight - PRIORITY_META[a.priority].weight ||
      a.order - b.order,
  );
}

function usePeriodStats(scoped: Task[], period: Period) {
  return useMemo(() => {
    const today = todayKey();
    const completed = scoped.filter((t) => isDone(t) && within(dayOf(t.completedAt!), period));
    const created = scoped.filter((t) => within(dayOf(t.createdAt), period));
    const due = scoped.filter((t) => t.dueDate && within(t.dueDate, period));
    const prevCompleted = scoped.filter((t) => isDone(t) && within(dayOf(t.completedAt!), period.previous)).length;
    const prevCreated = scoped.filter((t) => within(dayOf(t.createdAt), period.previous)).length;
    const withDue = completed.filter((t) => t.dueDate);
    const onTime = withDue.filter((t) => dayOf(t.completedAt!) <= t.dueDate!).length;
    const overdueNow = scoped.filter((t) => isOverdue(t, today));

    let buckets: Bucket[];
    if (period.kind === 'day') {
      buckets = Array.from({ length: 24 }, (_, h) => ({
        key: String(h),
        label: `Das ${pad(h)}h às ${pad((h + 1) % 24)}h`,
        short: h % 3 === 0 ? `${pad(h)}h` : '',
        minor: h % 6 !== 0,
        completed: 0,
        created: 0,
      }));
      for (const t of completed) buckets[new Date(t.completedAt!).getHours()].completed += 1;
      for (const t of created) buckets[new Date(t.createdAt).getHours()].created += 1;
    } else {
      const index = new Map(period.days.map((d, i) => [d, i]));
      buckets = period.days.map((d) => {
        const date = fromDayKey(d);
        const n = date.getDate();
        const isLast = d === period.end;
        return {
          key: d,
          label: formatDay(d, "EEEE, d 'de' MMM"),
          short: period.kind === 'week' ? `${WEEKDAYS[date.getDay()]} ${n}` : n === 1 || n % 5 === 0 || isLast ? String(n) : '',
          minor: period.kind === 'month' && n !== 1 && n % 10 !== 0,
          completed: 0,
          created: 0,
          drill: d,
          isToday: d === today,
        };
      });
      for (const t of completed) buckets[index.get(dayOf(t.completedAt!))!].completed += 1;
      for (const t of created) buckets[index.get(dayOf(t.createdAt))!].created += 1;
    }
    return { completed, created, due, prevCompleted, prevCreated, withDue, onTime, overdueNow, buckets };
  }, [scoped, period]);
}

/* ---------- Rhythm chart: completed (accent) vs created (context gray) ---------- */

function FlowChart({ buckets, handlers, onDrill }: { buckets: Bucket[]; handlers: TipHandlers; onDrill: (day: string) => void }) {
  const max = Math.max(...buckets.flatMap((b) => [b.completed, b.created]));
  const yMax = Math.max(2, Math.ceil(max / 2) * 2);
  const peakValue = Math.max(...buckets.map((b) => b.completed));
  const peak = peakValue > 0 ? buckets.findIndex((b) => b.completed === peakValue) : -1;
  const pct = (n: number) => `${(n / yMax) * 100}%`;
  return (
    <div className="flow-chart">
      <div className="columns-grid" aria-hidden>
        {[yMax, yMax / 2, 0].map((v) => (
          <div key={v} className="grid-line">
            <span>{v}</span>
          </div>
        ))}
      </div>
      <div className="flow-cols">
        {buckets.map((b, i) => {
          const tip = handlers({
            value: `${plural(b.completed, 'concluída', 'concluídas')} · ${plural(b.created, 'criada', 'criadas')}`,
            label: b.label,
            color: 'var(--st-done)',
          });
          const bars = (
            <>
              <span className="flow-bar done" style={{ height: pct(b.completed) }}>
                {i === peak && <span className="flow-value">{b.completed}</span>}
              </span>
              <span className="flow-bar created" style={{ height: pct(b.created) }} />
            </>
          );
          return (
            <div key={b.key} className={`flow-slot${b.isToday ? ' today' : ''}`}>
              {b.drill ? (
                <button
                  type="button"
                  className="flow-hit"
                  onClick={() => onDrill(b.drill!)}
                  aria-label={`${b.label}: ${b.completed} concluídas e ${b.created} criadas. Ver o dia`}
                  {...tip}
                >
                  {bars}
                </button>
              ) : (
                <div className="flow-hit" tabIndex={0} role="img" aria-label={`${b.label}: ${b.completed} concluídas e ${b.created} criadas`} {...tip}>
                  {bars}
                </div>
              )}
              <span className={`flow-label${b.minor ? ' minor' : ''}`}>{b.short}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Agenda ---------- */

function AgendaTask({ task, compact, showDue }: { task: Task; compact?: boolean; showDue?: boolean }) {
  const clientsById = useClientsById();
  const projectsById = useProjectsById();
  const membersById = useMembersById();
  const { openTask } = useTaskModal();
  const client = task.clientId ? clientsById.get(task.clientId) : undefined;
  const project = task.projectId ? projectsById.get(task.projectId) : undefined;
  const assignee = task.assigneeId ? membersById.get(task.assigneeId) : undefined;
  const late = isOverdue(task);
  const where = project?.name ?? client?.name;
  return (
    <button
      type="button"
      className={`agenda-task${compact ? ' compact' : ''}${task.status === 'done' ? ' done' : ''}${late ? ' late' : ''}`}
      onClick={() => openTask(task.id)}
      title={task.title}
    >
      <span className="agenda-stripe" style={{ background: task.color ?? client?.color ?? 'var(--border-strong)' }} />
      <span className="agenda-task-main">
        <span className="agenda-task-title">
          {task.status === 'done' && <CheckCircle2 size={13} className="agenda-done-icon" />}
          <span className="truncate">{task.title}</span>
        </span>
        <span className="agenda-task-meta">
          <i className="agenda-dot" style={{ background: STATUS_META[task.status].color }} />
          <span className="truncate">
            {STATUS_META[task.status].short}
            {!compact && where ? ` · ${where}` : ''}
            {showDue && task.dueDate ? ` · ${formatDueShort(task.dueDate)}` : ''}
          </span>
        </span>
      </span>
      <Avatar member={assignee} size="sm" />
    </button>
  );
}

function AgendaList({ tasks, empty, showDue }: { tasks: Task[]; empty: string; showDue?: boolean }) {
  if (!tasks.length) return <p className="agenda-empty muted">{empty}</p>;
  return (
    <div className="agenda-list">
      {tasks.map((t) => (
        <AgendaTask key={t.id} task={t} showDue={showDue} />
      ))}
    </div>
  );
}

function DayAgenda({ period, scoped }: { period: Period; scoped: Task[] }) {
  const day = period.start;
  const today = todayKey();
  const isToday = day === today;
  const due = sortAgenda(scoped.filter((t) => t.dueDate === day));
  const carried = isToday ? scoped.filter((t) => isOverdue(t, today)).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)) : [];
  const done = scoped.filter((t) => isDone(t) && dayOf(t.completedAt!) === day).sort((a, b) => b.completedAt!.localeCompare(a.completedAt!));
  const when = isToday ? 'hoje' : 'neste dia';
  return (
    <>
      <section className="dash-card card">
        <header className="dash-card-head">
          <div>
            <h2>Para entregar</h2>
            <p className="muted">{plural(due.length, `tarefa com prazo ${when}`, `tarefas com prazo ${when}`)}</p>
          </div>
        </header>
        <AgendaList tasks={due} empty={`Nada com prazo ${when}.`} />
        {carried.length > 0 && (
          <>
            <h3 className="agenda-subhead">
              <AlertTriangle size={14} /> Atrasadas de dias anteriores ({carried.length})
            </h3>
            <AgendaList tasks={carried} empty="" showDue />
          </>
        )}
      </section>
      <section className="dash-card card">
        <header className="dash-card-head">
          <div>
            <h2>Concluídas</h2>
            <p className="muted">{plural(done.length, `tarefa finalizada ${when}`, `tarefas finalizadas ${when}`)}</p>
          </div>
        </header>
        <AgendaList tasks={done} empty={`Nenhuma tarefa finalizada ${when} ainda.`} />
      </section>
    </>
  );
}

function WeekAgenda({ period, scoped, onDrill }: { period: Period; scoped: Task[]; onDrill: (day: string) => void }) {
  const today = todayKey();
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of scoped) if (t.dueDate && within(t.dueDate, period)) map.set(t.dueDate, [...(map.get(t.dueDate) ?? []), t]);
    return map;
  }, [scoped, period]);
  return (
    <section className="dash-card card span-2">
      <header className="dash-card-head">
        <div>
          <h2>Agenda da semana</h2>
          <p className="muted">Tarefas com prazo em cada dia · clique no dia para ver os detalhes</p>
        </div>
      </header>
      <div className="week-agenda">
        {period.days.map((d) => {
          const items = sortAgenda(byDay.get(d) ?? []);
          const pending = items.filter((t) => t.status !== 'done').length;
          return (
            <div key={d} className={`week-col${d === today ? ' today' : ''}${d < today ? ' past' : ''}`}>
              <button type="button" className="week-col-head" onClick={() => onDrill(d)} aria-label={`Ver ${formatDay(d, "EEEE, d 'de' MMMM")}`}>
                <span className="week-col-day">{WEEKDAYS[fromDayKey(d).getDay()]}</span>
                <span className="week-col-num">{fromDayKey(d).getDate()}</span>
                {items.length > 0 && (
                  <span className="week-col-count" title={`${pending} pendente(s) de ${items.length}`}>
                    {pending}/{items.length}
                  </span>
                )}
              </button>
              <div className="week-col-body">
                {items.slice(0, 6).map((t) => (
                  <AgendaTask key={t.id} task={t} compact />
                ))}
                {items.length > 6 && (
                  <button type="button" className="week-col-more" onClick={() => onDrill(d)}>
                    +{items.length - 6} tarefas
                  </button>
                )}
                {!items.length && <span className="week-col-empty">Livre</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MonthCalendar({ period, scoped, onDrill }: { period: Period; scoped: Task[]; onDrill: (day: string) => void }) {
  const today = todayKey();
  const days = useMemo(() => {
    const map = new Map<string, { due: number; done: number; late: number }>();
    for (const t of scoped) {
      if (!t.dueDate || !within(t.dueDate, period)) continue;
      const c = map.get(t.dueDate) ?? { due: 0, done: 0, late: 0 };
      c.due += 1;
      if (t.status === 'done') c.done += 1;
      else if (t.dueDate < today) c.late += 1;
      map.set(t.dueDate, c);
    }
    return map;
  }, [scoped, period, today]);
  const lead = fromDayKey(period.start).getDay();
  // Sequential scale with fixed steps (1, 2, 3–4, 5+), so a quiet month doesn't look busy.
  const level = (n: number) => (n <= 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4);
  return (
    <section className="dash-card card span-2">
      <header className="dash-card-head">
        <div>
          <h2>Calendário de entregas</h2>
          <p className="muted">Tarefas com prazo em cada dia · clique no dia para ver os detalhes</p>
        </div>
        <div className="heat-legend" aria-hidden>
          <span>Menos</span>
          {[1, 2, 3, 4].map((l) => (
            <i key={l} className={`lvl-${l}`} />
          ))}
          <span>Mais</span>
        </div>
      </header>
      <div className="month-cal">
        {WEEKDAYS.map((w) => (
          <span key={w} className="month-weekday">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`blank-${i}`} className="month-blank" />
        ))}
        {period.days.map((d) => {
          const c = days.get(d) ?? { due: 0, done: 0, late: 0 };
          return (
            <button
              key={d}
              type="button"
              className={`month-cell lvl-${level(c.due)}${d === today ? ' today' : ''}${d < today ? ' past' : ''}`}
              onClick={() => onDrill(d)}
              aria-label={`${formatDay(d, "EEEE, d 'de' MMMM")}: ${plural(c.due, 'entrega', 'entregas')}, ${c.done} concluída(s), ${c.late} atrasada(s)`}
            >
              <span className="month-cell-num">{fromDayKey(d).getDate()}</span>
              {c.due > 0 && (
                <span className="month-cell-count">
                  <strong>{c.due}</strong> <span className="hide-sm">{c.due === 1 ? 'entrega' : 'entregas'}</span>
                </span>
              )}
              <span className="month-cell-flags">
                {c.done > 0 && (
                  <span className="month-cell-done" title={`${c.done} concluída(s)`}>
                    <CheckCircle2 size={11} /> {c.done}
                  </span>
                )}
                {c.late > 0 && (
                  <span className="month-cell-late" title={`${c.late} atrasada(s)`}>
                    <AlertTriangle size={11} /> {c.late}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- People ---------- */

function PeopleCard({ scoped, stats, period, link }: { scoped: Task[]; stats: ReturnType<typeof usePeriodStats>; period: Period; link: LinkFn }) {
  const membersById = useMembersById();
  const rows = useMemo(() => {
    const map = new Map<string, { done: number; due: number; open: number; late: number }>();
    const row = (id: string | null) => {
      const key = id ?? 'none';
      const r = map.get(key) ?? { done: 0, due: 0, open: 0, late: 0 };
      map.set(key, r);
      return r;
    };
    for (const t of stats.completed) row(t.assigneeId).done += 1;
    for (const t of stats.due) row(t.assigneeId).due += 1;
    for (const t of scoped) if (t.status !== 'done') row(t.assigneeId).open += 1;
    for (const t of stats.overdueNow) row(t.assigneeId).late += 1;
    return [...map.entries()].sort((a, b) => b[1].done - a[1].done || b[1].open - a[1].open);
  }, [scoped, stats]);
  const maxDone = Math.max(1, ...rows.map(([, r]) => r.done));
  return (
    <section className="dash-card card">
      <header className="dash-card-head">
        <div>
          <h2>Por responsável</h2>
          <p className="muted">Entregas {period.isCurrent ? period.name.toLowerCase() : 'no período'} e carga atual</p>
        </div>
      </header>
      {!rows.length ? (
        <p className="agenda-empty muted">Sem tarefas para mostrar.</p>
      ) : (
        <div className="dash-table-wrap">
          <table className="dash-table people-table">
            <thead>
              <tr>
                <th>Responsável</th>
                <th>Concluídas</th>
                <th title="Com prazo no período">Previstas</th>
                <th title="Em aberto agora">Abertas</th>
                <th title="Atrasadas agora">Atrasadas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([key, r]) => {
                const member = membersById.get(key);
                return (
                  <tr key={key}>
                    <td>
                      <Link to={link({ assignee: member ? member.id : 'none' })} className="people-name">
                        <Avatar member={member} size="sm" />
                        <span className="truncate">{member?.name ?? 'Sem responsável'}</span>
                      </Link>
                    </td>
                    <td>
                      <span className="people-done">
                        <span className="people-bar" style={{ width: `${(r.done / maxDone) * 100}%` }} />
                        <strong>{r.done}</strong>
                      </span>
                    </td>
                    <td>{r.due}</td>
                    <td>{r.open}</td>
                    <td className={r.late ? 'late' : ''}>{r.late}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ---------- Activity ---------- */

type ActivityKind = HistoryType | 'comment';

interface ActivityEntry {
  id: string;
  at: string;
  actorId: string | null;
  task: Task;
  kind: ActivityKind;
  from: string | null;
  to: string | null;
}

const ACTIVITY_ICON: Record<ActivityKind, LucideIcon> = {
  created: PlusCircle,
  duplicated: Copy,
  status: ArrowRight,
  assignee: UserRound,
  participants: Users,
  project: Folder,
  dueDate: CalendarClock,
  archived: Archive,
  restored: ArchiveRestore,
  comment: MessageSquare,
};

function ActivityCard({ scoped, period }: { scoped: Task[]; period: Period }) {
  const membersById = useMembersById();
  const projectsById = useProjectsById();
  const { openTask } = useTaskModal();
  const [limit, setLimit] = useState(12);

  const entries = useMemo(() => {
    const list: ActivityEntry[] = [];
    for (const task of scoped) {
      for (const h of task.history) {
        if (within(dayOf(h.at), period)) list.push({ id: h.id, at: h.at, actorId: h.actorId, task, kind: h.type, from: h.from, to: h.to });
      }
      for (const c of task.comments) {
        if (within(dayOf(c.createdAt), period)) list.push({ id: c.id, at: c.createdAt, actorId: c.authorId, task, kind: 'comment', from: null, to: null });
      }
    }
    return list.sort((a, b) => b.at.localeCompare(a.at));
  }, [scoped, period]);

  const name = (id: string | null) => (id ? membersById.get(id)?.name ?? 'membro removido' : 'ninguém');
  const verb = (e: ActivityEntry): ReactNode => {
    switch (e.kind) {
      case 'created':
        return 'criou';
      case 'duplicated':
        return `duplicou a #${e.from} em`;
      case 'status':
        return e.to === 'done' ? 'concluiu' : <>moveu para {STATUS_META[e.to as Task['status']]?.label ?? e.to}</>;
      case 'assignee':
        return e.to ? `atribuiu a ${name(e.to)}` : 'tirou o responsável de';
      case 'participants':
        return 'atualizou os participantes de';
      case 'project':
        return e.to ? `colocou no projeto ${projectsById.get(e.to)?.name ?? 'removido'}` : 'tirou do projeto';
      case 'dueDate':
        return e.to ? `mudou o prazo para ${formatDay(e.to)}` : 'removeu o prazo de';
      case 'archived':
        return 'arquivou';
      case 'restored':
        return 'restaurou';
      case 'comment':
        return 'comentou em';
    }
  };

  const today = todayKey();
  const dayTitle = (key: string) =>
    key === today ? 'Hoje' : key === addDaysKey(today, -1) ? 'Ontem' : formatDay(key, "EEEE, d 'de' MMM");
  const shown = entries.slice(0, limit);

  return (
    <section className="dash-card card">
      <header className="dash-card-head">
        <div>
          <h2>Atividade</h2>
          <p className="muted">{plural(entries.length, 'movimentação', 'movimentações')} da equipe {period.isCurrent ? period.name.toLowerCase() : 'no período'}</p>
        </div>
      </header>
      {!entries.length ? (
        <p className="agenda-empty muted">Nenhuma movimentação neste período.</p>
      ) : (
        <ol className="activity-feed">
          {shown.map((e, i) => {
            const day = dayOf(e.at);
            const Icon = e.kind === 'status' && e.to === 'done' ? CheckCircle2 : ACTIVITY_ICON[e.kind];
            const actor = e.actorId ? membersById.get(e.actorId) : undefined;
            return (
              <li key={e.id}>
                {period.kind !== 'day' && (i === 0 || dayOf(shown[i - 1].at) !== day) && <h3 className="activity-day">{dayTitle(day)}</h3>}
                <div className={`activity-item${e.kind === 'status' && e.to === 'done' ? ' is-done' : ''}`}>
                  <span className="activity-icon">
                    <Icon size={13} />
                  </span>
                  <p className="activity-text">
                    <strong>{actor?.name ?? (e.actorId ? 'Membro removido' : 'Alguém')}</strong> {verb(e)}{' '}
                    <button type="button" className="activity-task" onClick={() => openTask(e.task.id)}>
                      {e.task.title}
                    </button>
                  </p>
                  <time className="activity-time" dateTime={e.at}>
                    {format(new Date(e.at), 'HH:mm')}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {entries.length > limit && (
        <button type="button" className="btn btn-ghost btn-sm activity-more" onClick={() => setLimit((n) => n + 20)}>
          Mostrar mais ({entries.length - limit})
        </button>
      )}
    </section>
  );
}

/* ---------- View ---------- */

const TITLES = {
  day: ['Ritmo do dia', 'Concluídas e criadas por hora'],
  week: ['Ritmo da semana', 'Concluídas e criadas por dia · clique em um dia para detalhar'],
  month: ['Ritmo do mês', 'Concluídas e criadas por dia · clique em um dia para detalhar'],
} as const;

/** The Dia / Semana / Mês tabs: what got done, what is due and who did what in the chosen period. */
export function PeriodView({ scoped, period, link, onDrill }: { scoped: Task[]; period: Period; link: LinkFn; onDrill: (day: string) => void }) {
  const stats = usePeriodStats(scoped, period);
  const dueDone = stats.due.filter((t) => t.status === 'done').length;
  const onTimePct = stats.withDue.length ? Math.round((stats.onTime / stats.withDue.length) * 100) : null;
  const [title, subtitle] = TITLES[period.kind];

  return (
    <>
      <div className="kpi-row">
        <StatTile
          label="Concluídas"
          value={stats.completed.length}
          delta={{ value: stats.completed.length, previous: stats.prevCompleted, against: period.against, upIsGood: true }}
          hint=""
          icon={<CheckCircle2 size={18} />}
          tone="good"
          to={link({ status: 'done' })}
        />
        <StatTile
          label="Criadas"
          value={stats.created.length}
          delta={{ value: stats.created.length, previous: stats.prevCreated, against: period.against, upIsGood: null }}
          hint=""
          icon={<PlusCircle size={18} />}
          to={link({ sort: 'created', dir: 'desc' })}
        />
        <StatTile
          label="Entregas previstas"
          value={stats.due.length}
          hint={`${dueDone} feita${dueDone === 1 ? '' : 's'} · ${stats.due.length - dueDone} pendente${stats.due.length - dueDone === 1 ? '' : 's'}`}
          icon={<CalendarClock size={18} />}
          to={link({ due: 'custom', from: period.start, to: period.end })}
        />
        <StatTile
          label="No prazo"
          value={onTimePct === null ? '—' : `${onTimePct}%`}
          hint={stats.withDue.length ? `${stats.onTime} de ${plural(stats.withDue.length, 'entrega com prazo', 'entregas com prazo')}` : 'nenhuma entrega com prazo concluída'}
          icon={<Target size={18} />}
          tone={onTimePct !== null && onTimePct >= 80 ? 'good' : undefined}
        />
        <StatTile
          label="Atrasadas agora"
          value={stats.overdueNow.length}
          hint="prazo vencido e não finalizadas"
          icon={<AlertTriangle size={18} />}
          tone={stats.overdueNow.length ? 'danger' : undefined}
          to={link({ overdue: '1' })}
        />
      </div>

      <div className="dash-grid">
        <ChartCard
          title={title}
          subtitle={subtitle}
          className="span-2"
          legend={
            <ul className="chart-legend" aria-label="Legenda">
              <li>
                <i style={{ background: 'var(--st-done)' }} />
                Concluídas
              </li>
              <li>
                <i style={{ background: 'var(--chart-context)' }} />
                Criadas
              </li>
            </ul>
          }
          table={
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>{period.kind === 'day' ? 'Horário' : 'Dia'}</th>
                    <th>Concluídas</th>
                    <th>Criadas</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.buckets
                    .filter((b) => period.kind !== 'day' || b.completed || b.created)
                    .map((b) => (
                      <tr key={b.key}>
                        <td>{b.label}</td>
                        <td>{b.completed}</td>
                        <td>{b.created}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          }
        >
          {(handlers) => <FlowChart buckets={stats.buckets} handlers={handlers} onDrill={onDrill} />}
        </ChartCard>

        {period.kind === 'day' ? (
          <DayAgenda period={period} scoped={scoped} />
        ) : period.kind === 'week' ? (
          <WeekAgenda period={period} scoped={scoped} onDrill={onDrill} />
        ) : (
          <MonthCalendar period={period} scoped={scoped} onDrill={onDrill} />
        )}

        <PeopleCard scoped={scoped} stats={stats} period={period} link={link} />
        <ActivityCard key={`${period.start}-${period.end}`} scoped={scoped} period={period} />
      </div>
    </>
  );
}
