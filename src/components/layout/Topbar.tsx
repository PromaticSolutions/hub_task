import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AtSign, Bell, Building2, CheckCheck, Menu, Moon, Plus, Settings, Sun, UserPlus } from 'lucide-react';
import { useData } from '../../store/data';
import { usePrefs, useUi } from '../../store/ui';
import { useCurrentUser, useMembersById } from '../../hooks/useLookups';
import { useTaskModal } from '../../hooks/useTaskModal';
import { timeAgo } from '../../lib/dates';
import { Avatar } from '../ui/Avatar';
import { MenuItem, Popover } from '../ui/Popover';
import { MentionText } from '../ui/Mentions';

function ThemeToggle() {
  const theme = usePrefs((s) => s.theme);
  const setTheme = usePrefs((s) => s.setTheme);
  const resolved =
    theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  const next = resolved === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="icon-btn topbar-icon"
      onClick={() => setTheme(next)}
      aria-label={next === 'dark' ? 'Ativar tema escuro' : 'Ativar tema claro'}
      title={next === 'dark' ? 'Tema escuro' : 'Tema claro'}
    >
      {resolved === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function MentionsBell() {
  const me = useCurrentUser();
  const tasks = useData((s) => s.tasks);
  const members = useData((s) => s.members);
  const membersById = useMembersById();
  const seenAt = usePrefs((s) => s.mentionsSeenAt);
  const markSeen = usePrefs((s) => s.markMentionsSeen);
  const { openTask } = useTaskModal();

  const mentions = useMemo(() => {
    if (!me) return [];
    return tasks
      .flatMap((t) =>
        t.comments.filter((c) => c.mentions.includes(me.id) && c.authorId !== me.id).map((c) => ({ task: t, comment: c })),
      )
      .sort((a, b) => b.comment.createdAt.localeCompare(a.comment.createdAt))
      .slice(0, 30);
  }, [tasks, me]);

  const unread = mentions.filter((m) => !seenAt || m.comment.createdAt > seenAt).length;

  return (
    <Popover
      align="end"
      width={360}
      onOpenChange={(open) => {
        if (!open && unread) markSeen();
      }}
      trigger={({ toggle, ref, open }) => (
        <button
          type="button"
          ref={ref}
          className={`icon-btn topbar-icon${open ? ' active' : ''}`}
          onClick={toggle}
          aria-label={unread ? `Menções: ${unread} não lidas` : 'Menções'}
          title="Menções"
        >
          <Bell size={18} />
          {unread > 0 && <span className="bell-dot">{unread > 9 ? '9+' : unread}</span>}
        </button>
      )}
    >
      {(close) => (
        <div className="mentions-panel">
          <div className="mentions-head">
            <strong>Menções</strong>
            {unread > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => markSeen()}>
                <CheckCheck size={14} /> Marcar como lidas
              </button>
            )}
          </div>
          {!me && (
            <div className="mentions-empty">
              <AtSign size={20} />
              <p>
                Selecione quem é você em <Link to="/settings#identidade" onClick={close}>Configurações</Link> para ver as menções.
              </p>
            </div>
          )}
          {me && !mentions.length && (
            <div className="mentions-empty">
              <AtSign size={20} />
              <p>Ninguém mencionou você ainda. Use @nome nos comentários para chamar alguém.</p>
            </div>
          )}
          <div className="mentions-list">
            {mentions.map(({ task, comment }) => {
              const author = comment.authorId ? membersById.get(comment.authorId) : null;
              const isNew = !seenAt || comment.createdAt > seenAt;
              return (
                <button
                  key={comment.id}
                  type="button"
                  className={`mention-item${isNew ? ' unread' : ''}`}
                  onClick={() => {
                    openTask(task.id);
                    close();
                  }}
                >
                  <Avatar member={author} size="sm" />
                  <span className="mention-item-body">
                    <span className="mention-item-title truncate">
                      <strong>{author?.name ?? 'Alguém'}</strong> em <em>{task.title}</em>
                    </span>
                    <span className="mention-item-text">
                      <MentionText text={comment.body} members={members} meId={me?.id} />
                    </span>
                    <span className="mention-item-time">{timeAgo(comment.createdAt)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Popover>
  );
}

function UserMenu() {
  const me = useCurrentUser();
  const members = useData((s) => s.members);
  const setCurrentUser = usePrefs((s) => s.setCurrentUser);
  return (
    <Popover
      align="end"
      width={260}
      trigger={({ toggle, ref }) => (
        <button
          type="button"
          ref={ref}
          className={`user-trigger${!me ? ' warn' : ''}`}
          onClick={toggle}
          aria-label={me ? `Usuário atual: ${me.name}` : 'Selecionar usuário'}
          title={me ? `Você está usando como ${me.name}` : 'Selecione quem é você'}
        >
          <Avatar member={me} size="md" title={me?.name ?? 'Selecione quem é você'} />
        </button>
      )}
    >
      {(close) => (
        <div className="menu">
          <div className="menu-title">Você está usando como</div>
          {members.length === 0 && <p className="menu-empty">Cadastre membros da equipe para escolher seu usuário.</p>}
          <div className="menu-scroll">
            {[...members]
              .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
              .map((m) => (
                <MenuItem
                  key={m.id}
                  icon={<Avatar member={m} size="sm" />}
                  active={m.id === me?.id}
                  onClick={() => {
                    setCurrentUser(m.id);
                    close();
                  }}
                >
                  {m.name}
                </MenuItem>
              ))}
          </div>
          <div className="menu-sep" />
          <Link to="/settings" className="menu-item" onClick={close}>
            <Settings size={15} />
            <span>Configurações</span>
          </Link>
        </div>
      )}
    </Popover>
  );
}

export function Topbar() {
  const header = useUi((s) => s.header);
  const setSidebarOpen = useUi((s) => s.setSidebarOpen);
  const openClientForm = useUi((s) => s.openClientForm);
  const openMemberForm = useUi((s) => s.openMemberForm);
  const { openNewTask } = useTaskModal();

  return (
    <header className="topbar">
      <button type="button" className="icon-btn menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu">
        <Menu size={20} />
      </button>
      <div className="topbar-title">
        {header.color && <span className="title-dot" style={{ background: header.color }} />}
        <div className="truncate">
          <h1 className="truncate">{header.title}</h1>
          {header.subtitle && <p className="topbar-subtitle truncate">{header.subtitle}</p>}
        </div>
      </div>
      <div className="topbar-actions">
        <button type="button" className="btn btn-secondary hide-sm" onClick={() => openClientForm()} title="Novo cliente">
          <Building2 size={16} />
          <span className="hide-md">Novo cliente</span>
        </button>
        <button type="button" className="btn btn-secondary hide-sm" onClick={() => openMemberForm()} title="Novo membro">
          <UserPlus size={16} />
          <span className="hide-md">Novo membro</span>
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => openNewTask(useUi.getState().pageTaskDefaults)}
          title="Nova tarefa (N)"
        >
          <Plus size={17} strokeWidth={2.4} />
          <span className="hide-xs">Nova tarefa</span>
        </button>
        <span className="topbar-sep" />
        <MentionsBell />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
