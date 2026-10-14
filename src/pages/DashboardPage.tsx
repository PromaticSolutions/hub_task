import { useMemo, useRef, useState, type FocusEvent as ReactFocusEvent, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addDays, format, startOfWeek } from 'date-fns';
import { AlertTriangle, BarChart3, CalendarClock, CheckCircle2, CircleDot, FilterX, Lock, Table2, Timer } from 'lucide-react';
import { STATUSES, type Status, type Task } from '../../shared/types';
import { STATUS_META } from '../lib/constants';
import { daysUntil, formatDueShort, isOverdue, ptBR, todayKey, addDaysKey } from '../lib/dates';
import { useData } from '../store/data';
import { useClientsById, useMembersById } from '../hooks/useLookups';
import { usePageHeader } from '../hooks/usePageHeader';
import { useTaskModal } from '../hooks/useTaskModal';
import { Avatar } from '../components/ui/Avatar';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectPicker, clientOptions, memberOptions } from '../components/ui/Pickers';

/* ---------- Tooltip (shared by every chart card) ---------- */

interface Tip {
  x: number;
  y: number;
  value: string;
  label: string;
  color?: string;
}

function useTooltip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const place = (clientX: number, clientY: number, data: Omit<Tip, 'x' | 'y'>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ ...data, x: clientX - box.left, y: clientY - box.top });
  };
  const handlers = (data: Omit<Tip, 'x' | 'y'>) => ({
    onPointerMove: (e: ReactPointerEvent) => place(e.clientX, e.clientY, data),
    onPointerLeave: () => setTip(null),
    onFocus: (e: ReactFocusEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      place(r.left + r.width / 2, r.top, data);
    },
    onBlur: () => setTip(null),
  });
  const node = tip ? (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="status">
      <strong>{tip.value}</strong>
      <span>
        {tip.color && <i className="chart-tip-key" style={{ background: tip.color }} />}
        {tip.label}
      </span>
    </div>
  ) : null;
  return { ref, handlers, node };
}

function ChartCard({
  title,
  subtitle,
  children,
  table,
  className,
  legend,
}: {
  title: string;
  subtitle?: string;
  children: (handlers: ReturnType<typeof useTooltip>['handlers']) => ReactNode;
  table?: ReactNode;
  className?: string;
  legend?: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  const tip = useTooltip();
  return (
    <section className={`dash-card card ${className ?? ''}`}>
      <header className="dash-card-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {table && (
          <button
            type="button"
            className="icon-btn sm"
            onClick={() => setAsTable((v) => !v)}
            aria-pressed={asTable}
            aria-label={asTable ? 'Ver como gráfico' : 'Ver como tabela'}
            title={asTable ? 'Ver como gráfico' : 'Ver como tabela'}
          >
            {asTable ? <BarChart3 size={16} /> : <Table2 size={16} />}
          </button>
        )}
      </header>
      {!asTable && legend}
      <div className="dash-card-body" ref={tip.ref}>
        {asTable ? table : children(tip.handlers)}
        {!asTable && tip.node}
      </div>
    </section>
  );
}

function StatTile({
  label,
  value,
  hint,
  icon,
  tone,
  to,
}: {
  label: string;
  value: number;
  hint: string;
  icon: ReactNode;
  tone?: 'danger' | 'good' | 'warn';
  to: string;
}) {
  return (
    <Link to={to} className={`stat-tile${tone ? ` tone-${tone}` : ''}`}>
      <span className="stat-icon">{icon}</span>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value.toLocaleString('pt-BR')}</span>
      <span className="stat-hint">{hint}</span>
    </Link>
  );
}

function Legend() {
  return (
    <ul className="chart-legend" aria-label="Legenda">
      {STATUSES.map((s) => (
        <li key={s}>
          <i style={{ background: STATUS_META[s].color }} />
          {STATUS_META[s].label}
        </li>
      ))}
    </ul>
  );
}

type Counts = Record<Status, number>;
const emptyCounts = (): Counts => ({ todo: 0, in_progress: 0, blocked: 0, review: 0, done: 0 });
const total = (c: Counts) => STATUSES.reduce((n, s) => n + c[s], 0);

interface StackRow {
  key: string;
  label: string;
  marker: ReactNode;
  counts: Counts;
  href: string;
  segmentHref: (status: Status) => string;
}

function StackedRows({ rows, handlers }: { rows: StackRow[]; handlers: ReturnType<typeof useTooltip>['handlers'] }) {
  const navigate = useNavigate();
  const max = Math.max(1, ...rows.map((r) => total(r.counts)));
  return (
    <ul className="stack-rows">
      {rows.map((r) => {
        const t = total(r.counts);
        const present = STATUSES.filter((s) => r.counts[s] > 0);
        return (
          <li key={r.key} className="stack-row">
            <Link to={r.href} className="stack-label" title={r.label}>
              {r.marker}
              <span className="truncate">{r.label}</span>
            </Link>
            <div className="stack-track">
              <div className="stack-bar" style={{ width: `${(t / max) * 100}%` }}>
                {present.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="stack-seg"
                    style={{ flexGrow: r.counts[s], background: STATUS_META[s].color }}
                    onClick={() => navigate(r.segmentHref(s))}
                    aria-label={`${r.label}: ${r.counts[s]} ${STATUS_META[s].label}`}
                    {...handlers({ value: `${r.counts[s]} tarefa${r.counts[s] === 1 ? '' : 's'}`, label: `${r.label} · ${STATUS_META[s].label}`, color: STATUS_META[s].color })}
                  />
                ))}
              </div>
              <span className="stack-total">{t}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CountsTable({ rows, firstCol }: { rows: { key: string; label: string; counts: Counts }[]; firstCol: string }) {
  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead>
          <tr>
            <th>{firstCol}</th>
            {STATUSES.map((s) => (
              <th key={s}>{STATUS_META[s].short}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td>
              {STATUSES.map((s) => (
                <td key={s}>{r.counts[s]}</td>
              ))}
              <td>
                <strong>{total(r.counts)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DashboardPage() {
  usePageHeader('Dashboard', { subtitle: 'Visão geral do trabalho da equipe' });
  const tasks = useData((s) => s.tasks);
  const clients = useData((s) => s.clients);
  const members = useData((s) => s.members);
  const clientsById = useClientsById();
  const membersById = useMembersById();
  const { openTask } = useTaskModal();
  const navigate = useNavigate();
  const [clientId, setClientId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);

  const scoped = useMemo(
    () =>
      tasks.filter(
        (t) => !t.archived && t.scope === 'team' && (!clientId || t.clientId === clientId) && (!assigneeId || t.assigneeId === assigneeId),
      ),
    [tasks, clientId, assigneeId],
  );

  /** Builds a link to "Todas as Tarefas" carrying the dashboard filters plus extra params. */
  const link = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (clientId) p.set('client', clientId);
    if (assigneeId) p.set('assignee', assigneeId);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    const qs = p.toString();
    return `/tasks${qs ? `?${qs}` : ''}`;
  };

  const data = useMemo(() => {
    const today = todayKey();
    const byStatus = emptyCounts();
    const byClient = new Map<string, Counts>();
    const byMember = new Map<string, Counts>();
    const overdue: Task[] = [];
    const upcoming: Task[] = [];
    const limit = addDaysKey(today, 7);
    const since30 = Date.now() - 30 * 86_400_000;
    let done30 = 0;
    for (const t of scoped) {
      byStatus[t.status] += 1;
      const ck = t.clientId ?? 'none';
      const c = byClient.get(ck) ?? emptyCounts();
      c[t.status] += 1;
      byClient.set(ck, c);
      const mk = t.assigneeId ?? 'none';
      const m = byMember.get(mk) ?? emptyCounts();
      m[t.status] += 1;
      byMember.set(mk, m);
      if (isOverdue(t, today)) overdue.push(t);
      else if (t.dueDate && t.status !== 'done' && t.dueDate >= today && t.dueDate <= limit) upcoming.push(t);
      if (t.completedAt && new Date(t.completedAt).getTime() >= since30) done30 += 1;
    }
    overdue.sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
    upcoming.sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));

    // Completions per week, last 8 weeks (weeks start on Sunday).
    const thisWeek = startOfWeek(new Date(), { weekStartsOn: 0 });
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const start = addDays(thisWeek, (i - 7) * 7);
      return { start, end: addDays(start, 7), count: 0 };
    });
    for (const t of scoped) {
      if (!t.completedAt) continue;
      const at = new Date(t.completedAt);
      const w = weeks.find((wk) => at >= wk.start && at < wk.end);
      if (w) w.count += 1;
    }
    return { byStatus, byClient, byMember, overdue, upcoming, done30, weeks };
  }, [scoped]);

  if (!tasks.some((t) => !t.archived && t.scope === 'team')) {
    return (
      <div className="page">
        <EmptyState
          icon={<BarChart3 size={26} />}
          title="Ainda não há dados para o dashboard"
          description="Crie tarefas para acompanhar status, prazos e a distribuição do trabalho por cliente e responsável."
          actions={
            <Link to="/tasks" className="btn btn-primary">
              Ir para as tarefas
            </Link>
          }
        />
      </div>
    );
  }

  const open = scoped.length - data.byStatus.done;
  const statusMax = Math.max(1, ...STATUSES.map((s) => data.byStatus[s]));

  const clientRows: StackRow[] = [...data.byClient.entries()]
    .map(([key, counts]) => {
      const client = clientsById.get(key);
      const clientParam = client ? client.id : 'none';
      return {
        key,
        label: client?.name ?? 'Sem cliente',
        marker: <span className="client-dot" style={{ background: client?.color ?? 'var(--border-strong)' }} />,
        counts,
        href: client ? `/clients/${client.id}` : link({ client: 'none' }),
        segmentHref: (status: Status) => link({ client: clientParam, status }),
      };
    })
    .sort((a, b) => total(b.counts) - total(a.counts));

  const memberRows: StackRow[] = [...data.byMember.entries()]
    .map(([key, counts]) => {
      const member = membersById.get(key);
      const assigneeParam = member ? member.id : 'none';
      return {
        key,
        label: member?.name ?? 'Sem responsável',
        marker: <Avatar member={member} size="sm" />,
        counts,
        href: link({ assignee: assigneeParam }),
        segmentHref: (status: Status) => link({ assignee: assigneeParam, status }),
      };
    })
    .sort((a, b) => total(b.counts) - total(a.counts));

  const weekMax = Math.max(...data.weeks.map((w) => w.count));
  const yMax = Math.max(2, Math.ceil(weekMax / 2) * 2);
  const peakIndex = data.weeks.findIndex((w) => w.count === weekMax && weekMax > 0);

  return (
    <div className="page dashboard">
      <div className="dash-filters" role="group" aria-label="Filtros do dashboard">
        <div className="dash-filter">
          <span className="field-label">Cliente</span>
          <SelectPicker value={clientId} onChange={setClientId} options={clientOptions(clients)} placeholder="Todos os clientes" nullable nullLabel="Todos os clientes" ariaLabel="Filtrar dashboard por cliente" />
        </div>
        <div className="dash-filter">
          <span className="field-label">Responsável</span>
          <SelectPicker value={assigneeId} onChange={setAssigneeId} options={memberOptions(members)} placeholder="Toda a equipe" nullable nullLabel="Toda a equipe" ariaLabel="Filtrar dashboard por responsável" />
        </div>
        {(clientId || assigneeId) && (
          <button type="button" className="btn btn-ghost" onClick={() => { setClientId(null); setAssigneeId(null); }}>
            <FilterX size={16} /> Limpar filtros
          </button>
        )}
      </div>

      <div className="kpi-row">
        <StatTile label="Em aberto" value={open} hint={`de ${scoped.length} tarefas ativas`} icon={<CircleDot size={18} />} to={link({ status: 'todo,in_progress,blocked,review' })} />
        <StatTile label="Em andamento" value={data.byStatus.in_progress} hint="sendo executadas agora" icon={<Timer size={18} />} to={link({ status: 'in_progress' })} />
        <StatTile label="Bloqueadas" value={data.byStatus.blocked} hint="precisam de destravamento" icon={<Lock size={18} />} tone={data.byStatus.blocked ? 'warn' : undefined} to={link({ status: 'blocked' })} />
        <StatTile label="Atrasadas" value={data.overdue.length} hint="prazo vencido e não finalizadas" icon={<AlertTriangle size={18} />} tone={data.overdue.length ? 'danger' : undefined} to={link({ overdue: '1' })} />
        <StatTile label="Concluídas" value={data.done30} hint="nos últimos 30 dias" icon={<CheckCircle2 size={18} />} tone="good" to={link({ status: 'done' })} />
      </div>

      <div className="dash-grid">
        <ChartCard
          title="Tarefas por status"
          subtitle={`${scoped.length} tarefas ativas`}
          table={<CountsTable rows={[{ key: 'all', label: 'Tarefas', counts: data.byStatus }]} firstCol="" />}
        >
          {(handlers) => (
            <ul className="hbars">
              {STATUSES.map((s) => (
                <li key={s}>
                  <span className="hbar-label">
                    <i className="hbar-key" style={{ background: STATUS_META[s].color }} />
                    {STATUS_META[s].label}
                  </span>
                  <div className="hbar-track">
                    <button
                      type="button"
                      className="hbar"
                      style={{ width: `${(data.byStatus[s] / statusMax) * 100}%`, background: STATUS_META[s].color }}
                      onClick={() => navigate(link({ status: s }))}
                      aria-label={`${STATUS_META[s].label}: ${data.byStatus[s]} tarefas. Ver tarefas`}
                      {...handlers({ value: `${data.byStatus[s]} tarefa${data.byStatus[s] === 1 ? '' : 's'}`, label: STATUS_META[s].label, color: STATUS_META[s].color })}
                    />
                    <span className="hbar-value">{data.byStatus[s]}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>

        <ChartCard
          title="Concluídas por semana"
          subtitle="Últimas 8 semanas"
          table={
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Semana de</th>
                    <th>Concluídas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.weeks.map((w) => (
                    <tr key={w.start.toISOString()}>
                      <td>{format(w.start, "d 'de' MMM", { locale: ptBR })}</td>
                      <td>{w.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        >
          {(handlers) => (
            <div className="columns-chart">
              <div className="columns-grid" aria-hidden>
                {[yMax, yMax / 2, 0].map((v) => (
                  <div key={v} className="grid-line">
                    <span>{v}</span>
                  </div>
                ))}
              </div>
              <div className="columns">
                {data.weeks.map((w, i) => {
                  const label = format(w.start, 'dd/MM');
                  const showValue = w.count > 0 && (i === peakIndex || i === data.weeks.length - 1);
                  return (
                    <div key={label} className="column-slot">
                      <div className="column-area">
                        <div
                          className={`column${i === data.weeks.length - 1 ? ' current' : ''}`}
                          style={{ height: `${(w.count / yMax) * 100}%` }}
                          tabIndex={0}
                          role="img"
                          aria-label={`Semana de ${label}: ${w.count} concluídas`}
                          {...handlers({ value: `${w.count} concluída${w.count === 1 ? '' : 's'}`, label: `Semana de ${format(w.start, "d 'de' MMM", { locale: ptBR })}`, color: 'var(--st-done)' })}
                        >
                          {showValue && <span className="column-value">{w.count}</span>}
                        </div>
                      </div>
                      <span className="column-label">{i === data.weeks.length - 1 ? 'Atual' : label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Distribuição por cliente"
          subtitle="Tarefas ativas por status"
          className="span-2"
          legend={<Legend />}
          table={<CountsTable rows={clientRows} firstCol="Cliente" />}
        >
          {(handlers) => <StackedRows rows={clientRows} handlers={handlers} />}
        </ChartCard>

        <ChartCard
          title="Distribuição por responsável"
          subtitle="Tarefas ativas por status"
          className="span-2"
          legend={<Legend />}
          table={<CountsTable rows={memberRows} firstCol="Responsável" />}
        >
          {(handlers) => <StackedRows rows={memberRows} handlers={handlers} />}
        </ChartCard>

        <section className="dash-card card">
          <header className="dash-card-head">
            <div>
              <h2>Atrasadas</h2>
              <p className="muted">{data.overdue.length ? `${data.overdue.length} tarefa(s) com prazo vencido` : 'Nenhuma tarefa atrasada'}</p>
            </div>
            {data.overdue.length > 0 && (
              <Link to={link({ overdue: '1' })} className="btn btn-ghost btn-sm">
                Ver todas
              </Link>
            )}
          </header>
          {data.overdue.length ? (
            <ul className="dash-list">
              {data.overdue.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => openTask(t.id)}>
                    <span className="dash-list-stripe" style={{ background: t.color ?? clientsById.get(t.clientId ?? '')?.color ?? 'var(--border-strong)' }} />
                    <span className="dash-list-text">
                      <strong className="truncate">{t.title}</strong>
                      <span className="muted truncate">{clientsById.get(t.clientId ?? '')?.name ?? 'Sem cliente'}</span>
                    </span>
                    <span className="due overdue">
                      <AlertTriangle size={12} /> {Math.abs(daysUntil(t.dueDate!))}d
                    </span>
                    <Avatar member={t.assigneeId ? membersById.get(t.assigneeId) : null} size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="dash-ok">
              <CheckCircle2 size={22} /> Tudo em dia!
            </div>
          )}
        </section>

        <section className="dash-card card">
          <header className="dash-card-head">
            <div>
              <h2>Próximas entregas</h2>
              <p className="muted">Nos próximos 7 dias</p>
            </div>
            {data.upcoming.length > 0 && (
              <Link to={link({ due: 'next7' })} className="btn btn-ghost btn-sm">
                Ver todas
              </Link>
            )}
          </header>
          {data.upcoming.length ? (
            <ul className="dash-list">
              {data.upcoming.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => openTask(t.id)}>
                    <span className="dash-list-stripe" style={{ background: t.color ?? clientsById.get(t.clientId ?? '')?.color ?? 'var(--border-strong)' }} />
                    <span className="dash-list-text">
                      <strong className="truncate">{t.title}</strong>
                      <span className="muted truncate">{clientsById.get(t.clientId ?? '')?.name ?? 'Sem cliente'}</span>
                    </span>
                    <span className={`due${daysUntil(t.dueDate!) === 0 ? ' today' : ''}`}>
                      <CalendarClock size={12} /> {formatDueShort(t.dueDate!)}
                    </span>
                    <Avatar member={t.assigneeId ? membersById.get(t.assigneeId) : null} size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="dash-ok muted">
              <CalendarClock size={22} /> Nenhuma entrega prevista para a próxima semana.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
