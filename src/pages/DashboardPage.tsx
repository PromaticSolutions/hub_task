import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, FilterX, LayoutGrid, Sunrise } from 'lucide-react';
import { todayKey } from '../lib/dates';
import { periodOf, shiftAnchor, type PeriodKind } from '../lib/period';
import { useData } from '../store/data';
import { usePageHeader } from '../hooks/usePageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectPicker, clientOptions, memberOptions, projectOptions } from '../components/ui/Pickers';
import { OverviewView } from '../components/dashboard/OverviewView';
import { PeriodView } from '../components/dashboard/PeriodView';

type View = PeriodKind | 'overview';

const VIEWS: { key: View; label: string; icon: ReactNode }[] = [
  { key: 'day', label: 'Dia', icon: <Sunrise size={15} /> },
  { key: 'week', label: 'Semana', icon: <CalendarRange size={15} /> },
  { key: 'month', label: 'Mês', icon: <CalendarDays size={15} /> },
  { key: 'overview', label: 'Geral', icon: <LayoutGrid size={15} /> },
];

const CURRENT_NAME: Record<PeriodKind, string> = { day: 'Hoje', week: 'Esta semana', month: 'Este mês' };

export function DashboardPage() {
  usePageHeader('Dashboard', { subtitle: 'Acompanhe o que a equipe está fazendo' });
  const tasks = useData((s) => s.tasks);
  const clients = useData((s) => s.clients);
  const projects = useData((s) => s.projects);
  const members = useData((s) => s.members);
  const [clientId, setClientId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);

  // The view and the period live in the URL, so a link opens the same analysis.
  const [params, setParams] = useSearchParams();
  const rawView = params.get('view');
  const view: View = VIEWS.some((v) => v.key === rawView) ? (rawView as View) : 'week';
  const rawDate = params.get('date');
  const anchor = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayKey();
  const period = useMemo(() => (view === 'overview' ? null : periodOf(view, anchor)), [view, anchor]);

  const go = (next: { view?: View; date?: string | null }) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next.view) p.set('view', next.view);
        if (next.date !== undefined) {
          if (next.date && next.date !== todayKey()) p.set('date', next.date);
          else p.delete('date');
        }
        return p;
      },
      { replace: true },
    );

  const scoped = useMemo(
    () =>
      tasks.filter(
        (t) =>
          !t.archived &&
          t.scope === 'team' &&
          (!clientId || t.clientId === clientId) &&
          (!projectId || t.projectId === projectId) &&
          (!assigneeId || t.assigneeId === assigneeId),
      ),
    [tasks, clientId, projectId, assigneeId],
  );

  /** Builds a link to "Todas as Tarefas" carrying the dashboard filters plus extra params. */
  const link = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (clientId) p.set('client', clientId);
    if (projectId) p.set('project', projectId);
    if (assigneeId) p.set('assignee', assigneeId);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    const qs = p.toString();
    return `/tasks${qs ? `?${qs}` : ''}`;
  };

  if (!tasks.some((t) => !t.archived && t.scope === 'team')) {
    return (
      <div className="page">
        <EmptyState
          icon={<BarChart3 size={26} />}
          title="Ainda não há dados para o dashboard"
          description="Crie tarefas para acompanhar o que é feito por dia, semana e mês, e a distribuição do trabalho por projeto, cliente e responsável."
          actions={
            <Link to="/tasks" className="btn btn-primary">
              Ir para as tarefas
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="page dashboard">
      <div className="dash-toolbar">
        <div className="segmented dash-views" role="tablist" aria-label="Visão do dashboard">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" role="tab" aria-selected={view === v.key} className={view === v.key ? 'active' : ''} onClick={() => go({ view: v.key })}>
              {v.icon}
              <span>{v.label}</span>
            </button>
          ))}
        </div>
        {period && (
          <div className="period-nav">
            <button type="button" className="icon-btn" onClick={() => go({ date: shiftAnchor(period.kind, anchor, -1) })} aria-label="Período anterior" title="Período anterior">
              <ChevronLeft size={18} />
            </button>
            <span className="period-label" aria-live="polite">
              {period.label}
              {period.isCurrent && <span className="badge period-now">{CURRENT_NAME[period.kind]}</span>}
            </span>
            <button type="button" className="icon-btn" onClick={() => go({ date: shiftAnchor(period.kind, anchor, 1) })} aria-label="Próximo período" title="Próximo período">
              <ChevronRight size={18} />
            </button>
            {!period.isCurrent && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => go({ date: null })}>
                Voltar para {CURRENT_NAME[period.kind].toLowerCase()}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="dash-filters" role="group" aria-label="Filtros do dashboard">
        <div className="dash-filter">
          <span className="field-label">Cliente</span>
          <SelectPicker value={clientId} onChange={setClientId} options={clientOptions(clients)} placeholder="Todos os clientes" nullable nullLabel="Todos os clientes" ariaLabel="Filtrar dashboard por cliente" />
        </div>
        {projects.length > 0 && (
          <div className="dash-filter">
            <span className="field-label">Projeto</span>
            <SelectPicker value={projectId} onChange={setProjectId} options={projectOptions(projects)} placeholder="Todos os projetos" nullable nullLabel="Todos os projetos" ariaLabel="Filtrar dashboard por projeto" />
          </div>
        )}
        <div className="dash-filter">
          <span className="field-label">Responsável</span>
          <SelectPicker value={assigneeId} onChange={setAssigneeId} options={memberOptions(members)} placeholder="Toda a equipe" nullable nullLabel="Toda a equipe" ariaLabel="Filtrar dashboard por responsável" />
        </div>
        {(clientId || projectId || assigneeId) && (
          <button type="button" className="btn btn-ghost" onClick={() => { setClientId(null); setProjectId(null); setAssigneeId(null); }}>
            <FilterX size={16} /> Limpar filtros
          </button>
        )}
      </div>

      {period ? (
        <PeriodView scoped={scoped} period={period} link={link} onDrill={(day) => go({ view: 'day', date: day })} />
      ) : (
        <OverviewView scoped={scoped} link={link} />
      )}
    </div>
  );
}
