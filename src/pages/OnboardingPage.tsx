import { useMemo } from 'react';
import { CalendarClock, CheckCircle2, Rocket } from 'lucide-react';
import { useData } from '../store/data';
import { useUi } from '../store/ui';
import { usePageHeader } from '../hooks/usePageHeader';
import { useFilters } from '../hooks/useFilters';
import { useMembersById } from '../hooks/useLookups';
import { formatDueShort, isOverdue, todayKey } from '../lib/dates';
import { TasksWorkspace } from '../components/tasks/TasksWorkspace';
import { EmptyState } from '../components/ui/EmptyState';
import { AvatarStack } from '../components/ui/Avatar';

export function OnboardingPage() {
  usePageHeader('Onboarding', { subtitle: 'Implantação de novos clientes' });
  const tasks = useData((s) => s.tasks);
  const clients = useData((s) => s.clients);
  const openOnboardingForm = useUi((s) => s.openOnboardingForm);
  const membersById = useMembersById();
  const { filters, update } = useFilters();

  const scoped = useMemo(() => tasks.filter((t) => !t.archived && t.onboarding && t.scope === 'team'), [tasks]);

  const progress = useMemo(() => {
    const today = todayKey();
    return clients
      .map((client) => {
        const list = scoped.filter((t) => t.clientId === client.id);
        if (!list.length) return null;
        const done = list.filter((t) => t.status === 'done').length;
        const pending = list.filter((t) => t.status !== 'done').sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
        const people = [...new Set(list.map((t) => t.assigneeId).filter((id): id is string => !!id))]
          .map((id) => membersById.get(id))
          .filter((m): m is NonNullable<typeof m> => !!m);
        return {
          client,
          total: list.length,
          done,
          late: list.filter((t) => isOverdue(t, today)).length,
          next: pending[0],
          people,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => a.done / a.total - b.done / b.total);
  }, [clients, scoped, membersById]);

  const header = (
    <div className="onb-header">
      <div className="onb-header-row">
        <div>
          <h2>Clientes em onboarding</h2>
          <p className="muted">Clique em um cliente para filtrar as etapas abaixo.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openOnboardingForm(null)} disabled={!clients.length}>
          <Rocket size={16} /> Iniciar onboarding
        </button>
      </div>
      {progress.length > 0 && (
        <div className="onb-cards">
          {progress.map(({ client, total, done, late, next, people }) => {
            const pct = Math.round((done / total) * 100);
            const selected = filters.clients.length === 1 && filters.clients[0] === client.id;
            return (
              <button
                key={client.id}
                type="button"
                className={`onb-card${selected ? ' selected' : ''}${pct === 100 ? ' complete' : ''}`}
                style={{ ['--chip-color' as string]: client.color }}
                onClick={() => update({ clients: selected ? [] : [client.id] })}
                aria-pressed={selected}
              >
                <div className="onb-card-top">
                  <span className="client-dot" style={{ background: client.color }} />
                  <strong className="truncate">{client.name}</strong>
                  <span className="onb-pct">{pct}%</span>
                </div>
                <div className="progress">
                  <div className="progress-bar" style={{ width: `${pct}%`, background: client.color }} />
                </div>
                <div className="onb-card-meta">
                  <span>
                    {done}/{total} etapas
                  </span>
                  {late > 0 && <span className="late">{late} atrasada{late > 1 ? 's' : ''}</span>}
                  <AvatarStack members={people} max={3} size="sm" />
                </div>
                <div className="onb-next">
                  {next ? (
                    <>
                      <CalendarClock size={13} />
                      <span className="truncate">
                        Próxima: {next.title}
                        {next.dueDate ? ` · ${formatDueShort(next.dueDate)}` : ''}
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={13} /> Onboarding concluído
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <TasksWorkspace
      pageKey="onboarding"
      tasks={scoped}
      defaults={{ onboarding: true }}
      header={header}
      emptyState={
        <EmptyState
          icon={<Rocket size={26} />}
          title="Nenhum onboarding em andamento"
          description={
            clients.length
              ? 'Inicie o onboarding de um cliente para gerar automaticamente as etapas do modelo (editável em Configurações).'
              : 'Cadastre um cliente e depois inicie o onboarding dele com as etapas padrão.'
          }
          actions={
            clients.length ? (
              <button type="button" className="btn btn-primary" onClick={() => openOnboardingForm(null)}>
                <Rocket size={16} /> Iniciar onboarding
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => useUi.getState().openClientForm()}>
                Cadastrar cliente
              </button>
            )
          }
        />
      }
    />
  );
}
