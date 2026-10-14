import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addDays, format, startOfWeek } from 'date-fns';
import { AlertTriangle, CalendarClock, CheckCircle2, CircleDot, Lock, Timer } from 'lucide-react';
import { STATUSES, type Status, type Task } from '../../../shared/types';
import { STATUS_META } from '../../lib/constants';
import { daysUntil, formatDueShort, isOverdue, ptBR, todayKey, addDaysKey } from '../../lib/dates';
import { useData } from '../../store/data';
import { useClientsById, useMembersById, useProjectsById } from '../../hooks/useLookups';
import { useTaskModal } from '../../hooks/useTaskModal';
import { Avatar } from '../ui/Avatar';
import { ProjectIcon } from '../ui/Badges';
import { ChartCard, CountsTable, Legend, StackedRows, StatTile, emptyCounts, total, type Counts, type StackRow } from './charts';

/** The "Geral" tab: how things stand right now (status, distribution, late and upcoming work). */
export function OverviewView({ scoped, link }: { scoped: Task[]; link: (extra: Record<string, string>) => string }) {
  const projects = useData((s) => s.projects);
  const clientsById = useClientsById();
  const projectsById = useProjectsById();
  const membersById = useMembersById();
  const { openTask } = useTaskModal();
  const navigate = useNavigate();

  const data = useMemo(() => {
    const today = todayKey();
    const byStatus = emptyCounts();
    const byClient = new Map<string, Counts>();
    const byProject = new Map<string, Counts>();
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
      const pk = t.projectId ?? 'none';
      const pc = byProject.get(pk) ?? emptyCounts();
      pc[t.status] += 1;
      byProject.set(pk, pc);
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
    return { byStatus, byClient, byProject, byMember, overdue, upcoming, done30, weeks };
  }, [scoped]);

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

  const projectRows: StackRow[] = [...data.byProject.entries()]
    .map(([key, counts]) => {
      const project = projectsById.get(key);
      const projectParam = project ? project.id : 'none';
      return {
        key,
        label: project?.name ?? 'Sem projeto',
        marker: project ? <ProjectIcon color={project.color} /> : <span className="client-dot" style={{ background: 'var(--border-strong)' }} />,
        counts,
        href: project ? `/projects/${project.id}` : link({ project: 'none' }),
        segmentHref: (status: Status) => link({ project: projectParam, status }),
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
    <>
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

        {projects.length > 0 && (
          <ChartCard
            title="Distribuição por projeto"
            subtitle="Tarefas ativas por status"
            className="span-2"
            legend={<Legend />}
            table={<CountsTable rows={projectRows} firstCol="Projeto" />}
          >
            {(handlers) => <StackedRows rows={projectRows} handlers={handlers} />}
          </ChartCard>
        )}

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
    </>
  );
}
