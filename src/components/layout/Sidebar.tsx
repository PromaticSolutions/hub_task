import { useMemo, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Archive,
  ChevronDown,
  ClipboardList,
  FolderKanban,
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
import { ProjectIcon } from '../ui/Badges';

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

interface EntityLink {
  id: string;
  name: string;
  to: string;
  icon: ReactNode;
  count: number;
  late?: number;
}

/** Links to client or project boards, with a filter box once the list gets long. */
function EntityNavList({ items, noun, emptyLabel, onCreate }: { items: EntityLink[]; noun: string; emptyLabel: string; onCreate: () => void }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    return items.filter((i) => !q || i.name.toLocaleLowerCase('pt-BR').includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [items, query]);
  return (
    <>
      {items.length > 6 && (
        <div className="nav-search">
          <Search size={13} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Filtrar ${noun}s`} aria-label={`Filtrar ${noun}s`} />
        </div>
      )}
      <div className="nav-entities">
        {shown.map((i) => (
          <NavItem key={i.id} to={i.to} icon={i.icon} label={i.name} count={i.count} alert={i.late} />
        ))}
        {!items.length && (
          <button type="button" className="nav-empty" onClick={onCreate}>
            <Plus size={14} /> {emptyLabel}
          </button>
        )}
        {items.length > 0 && !shown.length && <p className="nav-empty-text">Nenhum {noun} encontrado</p>}
      </div>
    </>
  );
}

export function Sidebar() {
  const tasks = useData((s) => s.tasks);
  const clients = useData((s) => s.clients);
  const projects = useData((s) => s.projects);
  const members = useData((s) => s.members);
  const me = useCurrentUser();
  const open = useUi((s) => s.sidebarOpen);
  const setOpen = useUi((s) => s.setSidebarOpen);
  const openClientForm = useUi((s) => s.openClientForm);
  const openMemberForm = useUi((s) => s.openMemberForm);
  const openProjectForm = useUi((s) => s.openProjectForm);

  const counts = useMemo(() => {
    const today = todayKey();
    const active = tasks.filter((t) => !t.archived);
    const team = active.filter((t) => t.scope === 'team');
    const perClient = new Map<string, { open: number; late: number }>();
    const perProject = new Map<string, { open: number; late: number }>();
    const tally = (map: typeof perClient, key: string, t: (typeof tasks)[number]) => {
      const c = map.get(key) ?? { open: 0, late: 0 };
      if (t.status !== 'done') c.open += 1;
      if (isOverdue(t, today)) c.late += 1;
      map.set(key, c);
    };
    for (const t of team) {
      if (t.clientId) tally(perClient, t.clientId, t);
      if (t.projectId) tally(perProject, t.projectId, t);
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
      perProject,
    };
  }, [tasks, me]);

  const clientLinks = useMemo<EntityLink[]>(
    () =>
      clients.map((c) => ({
        id: c.id,
        name: c.name,
        to: `/clients/${c.id}`,
        icon: <span className="client-dot" style={{ background: c.color }} />,
        count: counts.perClient.get(c.id)?.open ?? 0,
        late: counts.perClient.get(c.id)?.late,
      })),
    [clients, counts],
  );

  // Finished projects leave the menu; they stay listed on the Projects page.
  const projectLinks = useMemo<EntityLink[]>(
    () =>
      projects
        .filter((p) => p.status !== 'done')
        .map((p) => ({
          id: p.id,
          name: p.name,
          to: `/projects/${p.id}`,
          icon: <ProjectIcon color={p.color} size={15} />,
          count: counts.perProject.get(p.id)?.open ?? 0,
          late: counts.perProject.get(p.id)?.late,
        })),
    [projects, counts],
  );

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
            id="projects"
            label="Projetos"
            action={
              <button type="button" className="nav-group-action" onClick={() => openProjectForm()} aria-label="Novo projeto" title="Novo projeto">
                <Plus size={15} />
              </button>
            }
          >
            <EntityNavList
              items={projectLinks}
              noun="projeto"
              emptyLabel={projects.length ? 'Novo projeto' : 'Criar primeiro projeto'}
              onCreate={() => openProjectForm()}
            />
            <NavItem to="/projects" end icon={<FolderKanban size={17} />} label="Gerenciar projetos" />
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
            <EntityNavList items={clientLinks} noun="cliente" emptyLabel="Cadastrar primeiro cliente" onCreate={() => openClientForm()} />
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
