import { useEffect, useMemo, useState, type FocusEvent, type MouseEvent, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Archive,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
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
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { isOverdue, todayKey } from '../../lib/dates';
import { Avatar } from '../ui/Avatar';
import { ProjectIcon } from '../ui/Badges';

/** Matches the CSS breakpoint where the sidebar turns into a drawer. */
export const DESKTOP_QUERY = '(min-width: 1025px)';

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
      {/* Animated with grid rows; collapsed bodies are hidden from focus and screen readers by CSS visibility. */}
      <div className="nav-group-body">
        <div className="nav-group-inner">{children}</div>
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
    <NavLink
      to={to}
      end={end}
      viewTransition
      onClick={() => close(false)}
      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
      data-tip={alert ? `${label} · ${alert} atrasada${alert === 1 ? '' : 's'}` : label}
    >
      {({ isActive }) => (
        <>
          {/* One pill exists at a time; the browser's view transition slides it to the new item. */}
          {isActive && <span className="nav-pill" aria-hidden />}
          <span className="nav-icon">{icon}</span>
          <span className="nav-label truncate">{label}</span>
          {!!alert && (
            <span className="nav-alert" title={`${alert} atrasada(s)`}>
              {alert}
            </span>
          )}
          {count !== undefined && <span className="nav-count">{count}</span>}
        </>
      )}
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

function GroupAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="nav-group-action" onClick={onClick} aria-label={label} title={label}>
      <Plus size={15} />
    </button>
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
  const collapsed = usePrefs((s) => s.sidebarCollapsed);
  const toggleSidebar = usePrefs((s) => s.toggleSidebar);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const rail = collapsed && isDesktop;
  const location = useLocation();
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);

  // The mobile drawer closes on any navigation, including links outside the menu.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, setOpen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (!rail) setTip(null);
  }, [rail]);

  /** Opens a form and closes the mobile drawer so the form isn't hidden behind it. */
  const create = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  // In the icon rail, labels are hidden, so hovering or focusing an item shows its name beside it.
  const showTip = (e: MouseEvent | FocusEvent) => {
    if (!rail) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    if (!el) {
      setTip(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setTip({ label: el.dataset.tip ?? '', top: r.top + r.height / 2 });
  };

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
      <aside
        className={`sidebar${open ? ' open' : ''}${rail ? ' rail' : ''}`}
        aria-label="Menu principal"
        onMouseOver={showTip}
        onMouseLeave={() => setTip(null)}
        onFocus={showTip}
        onBlur={() => setTip(null)}
      >
        <div className="sidebar-brand">
          {rail ? (
            <button type="button" className="brand-mark brand-expand" onClick={toggleSidebar} aria-label="Expandir menu" data-tip="Expandir menu ( [ )">
              <span />
              <span />
              <span />
              <ChevronsRight size={16} className="brand-expand-icon" />
            </button>
          ) : (
            <div className="brand-mark" aria-hidden>
              <span />
              <span />
              <span />
            </div>
          )}
          <div className="brand-text">
            <strong>Hub Task</strong>
            <span>Timely</span>
          </div>
          {!rail && (
            <button type="button" className="icon-btn sidebar-collapse" onClick={toggleSidebar} aria-label="Recolher menu" title="Recolher menu ( [ )">
              <ChevronsLeft size={17} />
            </button>
          )}
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

          <Group id="projects" label="Projetos" action={<GroupAction label="Novo projeto" onClick={create(() => openProjectForm())} />}>
            <EntityNavList
              items={projectLinks}
              noun="projeto"
              emptyLabel={projects.length ? 'Novo projeto' : 'Criar primeiro projeto'}
              onCreate={create(() => openProjectForm())}
            />
            <NavItem to="/projects" end icon={<FolderKanban size={17} />} label="Gerenciar projetos" />
          </Group>

          <Group id="clients" label="Clientes" action={<GroupAction label="Novo cliente" onClick={create(() => openClientForm())} />}>
            <EntityNavList items={clientLinks} noun="cliente" emptyLabel="Cadastrar primeiro cliente" onCreate={create(() => openClientForm())} />
            <NavItem to="/clients" end icon={<Building2 size={17} />} label="Gerenciar clientes" />
          </Group>

          <Group id="team" label="Equipe" action={<GroupAction label="Novo membro" onClick={create(() => openMemberForm())} />}>
            <NavItem to="/team" icon={<Users size={17} />} label="Membros" count={members.length} />
          </Group>
        </nav>

        <div className="sidebar-footer">
          <NavItem to="/settings" icon={<Settings size={17} />} label="Configurações" />
          <NavLink
            to="/settings#identidade"
            className={`sidebar-user${!me ? ' warn' : ''}`}
            onClick={() => setOpen(false)}
            data-tip={me ? `${me.name} · você` : 'Quem é você?'}
          >
            {me ? <Avatar member={me} size="md" /> : <span className="avatar md empty"><ClipboardList size={14} /></span>}
            <span className="sidebar-user-text">
              <strong className="truncate">{me ? me.name : 'Quem é você?'}</strong>
              <span className="truncate">{me ? me.role || 'Membro da equipe' : 'Selecione seu usuário'}</span>
            </span>
          </NavLink>
        </div>

        {rail && tip && (
          <div className="rail-tip" style={{ top: tip.top }} role="tooltip">
            {tip.label}
          </div>
        )}
      </aside>
    </>
  );
}
