import { useMemo, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Archive,
  ChevronDown,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Plus,
  Rocket,
  Search,
  Settings,
  Building2,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useData } from '../../store/data';
import { usePrefs, useUi } from '../../store/ui';
import { useCurrentUser } from '../../hooks/useLookups';
import { isOverdue, todayKey } from '../../lib/dates';
import { Avatar } from '../ui/Avatar';

function Group({ id, label, children, action }: { id: string; label: string; children: ReactNode; action?: ReactNode }) {
  const collapsed = usePrefs((s) => !!s.collapsed[id]);
  const toggle = usePrefs((s) => s.toggleGroup);
  return (
    <div className={`nav-group${collapsed ? ' collapsed' : ''}`}>
      <div className="nav-group-head">
        <button type="button" className="nav-group-toggle" onClick={() => toggle(id)} aria-expanded={!collapsed}>
          <ChevronDown size={14} className="nav-caret" />
          <span>{label}</span>
        </button>
        {action}
      </div>
      <div className="nav-group-body" hidden={collapsed}>
        {children}
      </div>
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
  count,
  alert,
  end,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  count?: number;
  alert?: number;
  end?: boolean;
}) {
  const close = useUi((s) => s.setSidebarOpen);
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} onClick={() => close(false)}>
      <span className="nav-icon">{icon}</span>
      <span className="nav-label truncate">{label}</span>
      {!!alert && (
        <span className="nav-alert" title={`${alert} atrasada(s)`}>
          {alert}
        </span>
      )}
      {count !== undefined && <span className="nav-count">{count}</span>}
    </NavLink>
  );
}

export function Sidebar() {
  const tasks = useData((s) => s.tasks);
  const clients = useData((s) => s.clients);
  const members = useData((s) => s.members);
  const me = useCurrentUser();
  const open = useUi((s) => s.sidebarOpen);
  const setOpen = useUi((s) => s.setSidebarOpen);
  const openClientForm = useUi((s) => s.openClientForm);
  const openMemberForm = useUi((s) => s.openMemberForm);
  const [clientQuery, setClientQuery] = useState('');

  const counts = useMemo(() => {
    const today = todayKey();
    const active = tasks.filter((t) => !t.archived);
    const team = active.filter((t) => t.scope === 'team');
    const perClient = new Map<string, { open: number; late: number }>();
    for (const t of team) {
      if (!t.clientId) continue;
      const c = perClient.get(t.clientId) ?? { open: 0, late: 0 };
      if (t.status !== 'done') c.open += 1;
      if (isOverdue(t, today)) c.late += 1;
      perClient.set(t.clientId, c);
    }
    const mine = me ? team.filter((t) => t.assigneeId === me.id || t.participantIds.includes(me.id)) : [];
    const personal = me ? active.filter((t) => t.scope === 'personal' && t.ownerId === me.id) : [];
    const openOnly = (list: typeof tasks) => list.filter((t) => t.status !== 'done').length;
    return {
      all: openOnly(team),
      allLate: team.filter((t) => isOverdue(t, today)).length,
      mine: openOnly(mine),
      mineLate: mine.filter((t) => isOverdue(t, today)).length,
      personal: openOnly(personal),
      archived: tasks.filter((t) => t.archived).length,
      onboarding: openOnly(active.filter((t) => t.onboarding)),
      perClient,
    };
  }, [tasks, me]);

  const sortedClients = useMemo(() => {
    const q = clientQuery.trim().toLocaleLowerCase('pt-BR');
    return [...clients]
      .filter((c) => !q || c.name.toLocaleLowerCase('pt-BR').includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [clients, clientQuery]);

  return (
    <>
      <div className={`sidebar-backdrop${open ? ' show' : ''}`} onClick={() => setOpen(false)} aria-hidden />
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Menu principal">
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <div className="brand-text">
            <strong>Hub Task</strong>
            <span>Timely</span>
          </div>
          <button type="button" className="icon-btn sidebar-close" onClick={() => setOpen(false)} aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <Group id="tasks" label="Tarefas">
            <NavItem to="/tasks" icon={<ListTodo size={17} />} label="Todas as Tarefas" count={counts.all} alert={counts.allLate} />
            <NavItem to="/my-tasks" icon={<Inbox size={17} />} label="Minhas Tarefas" count={me ? counts.mine : undefined} alert={counts.mineLate} />
            <NavItem to="/personal" icon={<UserRound size={17} />} label="Pessoais" count={me ? counts.personal : undefined} />
            <NavItem to="/archived" icon={<Archive size={17} />} label="Arquivadas" count={counts.archived} />
          </Group>

          <Group id="overview" label="Visão geral">
            <NavItem to="/dashboard" icon={<LayoutDashboard size={17} />} label="Dashboard" />
            <NavItem to="/onboarding" icon={<Rocket size={17} />} label="Onboarding" count={counts.onboarding} />
          </Group>

          <Group
            id="clients"
            label="Clientes"
            action={
              <button type="button" className="nav-group-action" onClick={() => openClientForm()} aria-label="Novo cliente" title="Novo cliente">
                <Plus size={15} />
              </button>
            }
          >
            {clients.length > 6 && (
              <div className="nav-search">
                <Search size={13} />
                <input value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} placeholder="Filtrar clientes" aria-label="Filtrar clientes" />
              </div>
            )}
            <div className="nav-clients">
              {sortedClients.map((c) => {
                const info = counts.perClient.get(c.id);
                return (
                  <NavItem
                    key={c.id}
                    to={`/clients/${c.id}`}
                    icon={<span className="client-dot" style={{ background: c.color }} />}
                    label={c.name}
                    count={info?.open ?? 0}
                    alert={info?.late}
                  />
                );
              })}
              {!clients.length && (
                <button type="button" className="nav-empty" onClick={() => openClientForm()}>
                  <Plus size={14} /> Cadastrar primeiro cliente
                </button>
              )}
              {clients.length > 0 && !sortedClients.length && <p className="nav-empty-text">Nenhum cliente encontrado</p>}
            </div>
            <NavItem to="/clients" end icon={<Building2 size={17} />} label="Gerenciar clientes" />
          </Group>

          <Group
            id="team"
            label="Equipe"
            action={
              <button type="button" className="nav-group-action" onClick={() => openMemberForm()} aria-label="Novo membro" title="Novo membro">
                <Plus size={15} />
              </button>
            }
          >
            <NavItem to="/team" icon={<Users size={17} />} label="Membros" count={members.length} />
          </Group>
        </nav>

        <div className="sidebar-footer">
          <NavItem to="/settings" icon={<Settings size={17} />} label="Configurações" />
          <NavLink
            to="/settings#identidade"
            className={`sidebar-user${!me ? ' warn' : ''}`}
            onClick={() => setOpen(false)}
          >
            {me ? <Avatar member={me} size="md" /> : <span className="avatar md empty"><ClipboardList size={14} /></span>}
            <span className="sidebar-user-text">
              <strong className="truncate">{me ? me.name : 'Quem é você?'}</strong>
              <span className="truncate">{me ? me.role || 'Membro da equipe' : 'Selecione seu usuário'}</span>
            </span>
          </NavLink>
        </div>
      </aside>
    </>
  );
}
