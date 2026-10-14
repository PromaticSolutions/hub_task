import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Archive,
  Building2,
  ClipboardList,
  Database,
  Inbox,
  Mail,
  Pencil,
  Phone,
  Plus,
  Rocket,
  UserPlus,
  UserRound,
  UserRoundCheck,
} from 'lucide-react';
import type { Task } from '../../shared/types';
import { errorMessage } from '../lib/api';
import { isOverdue, todayKey } from '../lib/dates';
import { useData } from '../store/data';
import { toast, usePrefs, useUi } from '../store/ui';
import { useCurrentUser } from '../hooks/useLookups';
import { usePageHeader } from '../hooks/usePageHeader';
import { useTaskModal } from '../hooks/useTaskModal';
import { TasksWorkspace } from '../components/tasks/TasksWorkspace';
import { EmptyState } from '../components/ui/EmptyState';
import { IdentityPicker } from '../components/IdentityPicker';

function NewTaskButton({ label = 'Nova tarefa' }: { label?: string }) {
  const { openNewTask } = useTaskModal();
  return (
    <button type="button" className="btn btn-primary" onClick={() => openNewTask(useUi.getState().pageTaskDefaults)}>
      <Plus size={16} /> {label}
    </button>
  );
}

function Welcome() {
  const members = useData((s) => s.members);
  const clients = useData((s) => s.clients);
  const tasks = useData((s) => s.tasks);
  const loadSampleData = useData((s) => s.loadSampleData);
  const openMemberForm = useUi((s) => s.openMemberForm);
  const openClientForm = useUi((s) => s.openClientForm);
  const me = useCurrentUser();
  const { openNewTask } = useTaskModal();
  const [loading, setLoading] = useState(false);
  const systemEmpty = !members.length && !clients.length && !tasks.length;

  const steps = [
    { done: members.length > 0, title: 'Cadastre a equipe', text: 'Membros podem ser responsáveis, participantes e mencionados.', action: () => openMemberForm(), label: 'Novo membro', icon: <UserPlus size={15} /> },
    { done: !!me, title: 'Diga quem é você', text: 'Assim "Minhas Tarefas", pessoais e menções funcionam neste navegador.', to: '/settings#identidade', label: 'Escolher', icon: <UserRoundCheck size={15} /> },
    { done: clients.length > 0, title: 'Cadastre os clientes', text: 'Cada cliente tem uma cor e um quadro próprio.', action: () => openClientForm(), label: 'Novo cliente', icon: <Building2 size={15} /> },
    { done: tasks.length > 0, title: 'Crie a primeira tarefa', text: 'Organize no Kanban, na lista ou no calendário.', action: () => openNewTask({}), label: 'Nova tarefa', icon: <Plus size={15} /> },
  ];

  const loadSample = async () => {
    setLoading(true);
    try {
      await loadSampleData();
      toast.success('Dados de exemplo carregados. Escolha quem é você para explorar "Minhas Tarefas".');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="welcome">
      <div className="welcome-hero">
        <div className="welcome-icon">
          <ClipboardList size={26} />
        </div>
        <h2>Bem-vindo ao Hub Task Timely</h2>
        <p className="muted">Siga os passos abaixo para colocar o quadro da equipe em funcionamento.</p>
      </div>
      <ol className="welcome-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={s.done ? 'done' : ''}>
            <span className="welcome-num">{s.done ? '✓' : i + 1}</span>
            <div>
              <strong>{s.title}</strong>
              <p className="muted">{s.text}</p>
            </div>
            {!s.done &&
              (s.to ? (
                <Link to={s.to} className="btn btn-secondary btn-sm">
                  {s.icon} {s.label}
                </Link>
              ) : (
                <button type="button" className="btn btn-secondary btn-sm" onClick={s.action}>
                  {s.icon} {s.label}
                </button>
              ))}
          </li>
        ))}
      </ol>
      {systemEmpty && (
        <div className="welcome-sample">
          <Database size={18} />
          <span>Quer explorar antes? Carregue uma equipe, clientes e tarefas fictícias.</span>
          <button type="button" className="btn btn-soft btn-sm" onClick={loadSample} disabled={loading}>
            {loading && <span className="spinner" />} Carregar dados de exemplo
          </button>
        </div>
      )}
    </div>
  );
}

const active = (t: Task) => !t.archived;

export function AllTasksPage() {
  usePageHeader('Todas as Tarefas', { subtitle: 'Quadro geral da equipe' });
  const tasks = useData((s) => s.tasks);
  const scoped = useMemo(() => tasks.filter((t) => active(t) && t.scope === 'team'), [tasks]);
  return <TasksWorkspace pageKey="all" tasks={scoped} emptyState={<Welcome />} />;
}

function NeedIdentity({ title, text }: { title: string; text: string }) {
  return (
    <div className="need-identity">
      <EmptyState icon={<UserRound size={26} />} title={title} description={text} />
      <IdentityPicker />
    </div>
  );
}

export function MyTasksPage() {
  const me = useCurrentUser();
  usePageHeader('Minhas Tarefas', { subtitle: me ? `Onde ${me.name} é responsável ou participante` : undefined });
  const tasks = useData((s) => s.tasks);
  const scoped = useMemo(
    () => (me ? tasks.filter((t) => active(t) && t.scope === 'team' && (t.assigneeId === me.id || t.participantIds.includes(me.id))) : []),
    [tasks, me],
  );
  if (!me) return <NeedIdentity title="Quem é você?" text='Escolha seu usuário para ver as tarefas em que você é responsável ou participante.' />;
  return (
    <TasksWorkspace
      pageKey="mine"
      tasks={scoped}
      defaults={{ assigneeId: me.id }}
      emptyState={
        <EmptyState
          icon={<Inbox size={26} />}
          title="Nada atribuído a você"
          description="Quando você for responsável ou participante de uma tarefa, ela aparece aqui."
          actions={<NewTaskButton label="Criar tarefa para mim" />}
        />
      }
    />
  );
}

export function PersonalPage() {
  const me = useCurrentUser();
  usePageHeader('Pessoais', { subtitle: 'Tarefas visíveis só no seu painel pessoal' });
  const tasks = useData((s) => s.tasks);
  const scoped = useMemo(() => (me ? tasks.filter((t) => active(t) && t.scope === 'personal' && t.ownerId === me.id) : []), [tasks, me]);
  if (!me) return <NeedIdentity title="Selecione seu usuário" text="As tarefas pessoais pertencem a um membro. Escolha quem é você para vê-las." />;
  return (
    <TasksWorkspace
      pageKey="personal"
      tasks={scoped}
      defaults={{ scope: 'personal', assigneeId: me.id }}
      emptyState={
        <EmptyState
          icon={<UserRound size={26} />}
          title="Nenhuma tarefa pessoal"
          description="Use para lembretes e afazeres seus que não precisam aparecer no quadro da equipe."
          actions={<NewTaskButton label="Nova tarefa pessoal" />}
        />
      }
    />
  );
}

export function ArchivedPage() {
  usePageHeader('Arquivadas', { subtitle: 'Tarefas fora dos quadros — restaure ou exclua' });
  const tasks = useData((s) => s.tasks);
  const meId = usePrefs((s) => s.currentUserId);
  const scoped = useMemo(() => tasks.filter((t) => t.archived && (t.scope === 'team' || t.ownerId === meId)), [tasks, meId]);
  return (
    <TasksWorkspace
      pageKey="archived"
      tasks={scoped}
      archivedMode
      views={['list']}
      emptyState={<EmptyState icon={<Archive size={26} />} title="Nenhuma tarefa arquivada" description="Tarefas arquivadas saem dos quadros, mas continuam guardadas aqui." />}
    />
  );
}

export function ClientTasksPage() {
  const { clientId } = useParams();
  const client = useData((s) => s.clients.find((c) => c.id === clientId));
  const tasks = useData((s) => s.tasks);
  const openClientForm = useUi((s) => s.openClientForm);
  const openOnboardingForm = useUi((s) => s.openOnboardingForm);
  usePageHeader(client?.name ?? 'Cliente', { subtitle: client ? 'Tarefas do cliente' : undefined, color: client?.color });

  const scoped = useMemo(() => tasks.filter((t) => active(t) && t.scope === 'team' && t.clientId === clientId), [tasks, clientId]);
  const stats = useMemo(() => {
    const today = todayKey();
    return {
      open: scoped.filter((t) => t.status !== 'done').length,
      late: scoped.filter((t) => isOverdue(t, today)).length,
      done: scoped.filter((t) => t.status === 'done').length,
      blocked: scoped.filter((t) => t.status === 'blocked').length,
    };
  }, [scoped]);

  if (!client) {
    return (
      <EmptyState
        icon={<Building2 size={26} />}
        title="Cliente não encontrado"
        description="Ele pode ter sido removido."
        actions={
          <Link to="/clients" className="btn btn-secondary">
            Ver clientes
          </Link>
        }
      />
    );
  }

  const header = (
    <div className="client-strip" style={{ ['--chip-color' as string]: client.color }}>
      <div className="client-strip-info">
        {client.contactName && (
          <span>
            <UserRound size={14} /> {client.contactName}
          </span>
        )}
        {client.email && (
          <a href={`mailto:${client.email}`} className="text-link">
            <Mail size={14} /> {client.email}
          </a>
        )}
        {client.phone && (
          <span>
            <Phone size={14} /> {client.phone}
          </span>
        )}
      </div>
      <div className="client-strip-stats">
        <span><strong>{stats.open}</strong> em aberto</span>
        <span className={stats.late ? 'late' : ''}><strong>{stats.late}</strong> atrasada{stats.late === 1 ? '' : 's'}</span>
        <span><strong>{stats.blocked}</strong> bloqueada{stats.blocked === 1 ? '' : 's'}</span>
        <span><strong>{stats.done}</strong> finalizada{stats.done === 1 ? '' : 's'}</span>
      </div>
      <div className="client-strip-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openOnboardingForm(client.id)}>
          <Rocket size={14} /> Onboarding
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openClientForm(client)}>
          <Pencil size={14} /> Editar
        </button>
      </div>
    </div>
  );

  return (
    <TasksWorkspace
      pageKey="client"
      tasks={scoped}
      defaults={{ clientId: client.id }}
      hideClientFilter
      header={header}
      emptyState={
        <EmptyState
          icon={<ClipboardList size={26} />}
          title={`Nenhuma tarefa para ${client.name}`}
          description="Crie a primeira tarefa ou inicie o onboarding com as etapas padrão."
          actions={
            <>
              <NewTaskButton />
              <button type="button" className="btn btn-secondary" onClick={() => openOnboardingForm(client.id)}>
                <Rocket size={16} /> Iniciar onboarding
              </button>
            </>
          }
        />
      }
    />
  );
}
