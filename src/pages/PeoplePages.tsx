import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Building2, Mail, MoreVertical, Pencil, Phone, Plus, Rocket, Search, Trash2, UserPlus, UserRound, Users } from 'lucide-react';
import type { Client, Member } from '../../shared/types';
import { errorMessage } from '../lib/api';
import { initials, readableOn } from '../lib/color';
import { isOverdue, todayKey } from '../lib/dates';
import { useData } from '../store/data';
import { confirmAction, toast, usePrefs, useUi } from '../store/ui';
import { usePageHeader } from '../hooks/usePageHeader';
import { Avatar } from '../components/ui/Avatar';
import { EmptyState } from '../components/ui/EmptyState';
import { MenuItem, Popover } from '../components/ui/Popover';
import { SearchInput } from '../components/ui/SearchInput';

function useTaskStats() {
  const tasks = useData((s) => s.tasks);
  return useMemo(() => {
    const today = todayKey();
    const byClient = new Map<string, { open: number; late: number; done: number; total: number }>();
    const byMember = new Map<string, { open: number; late: number; done: number; participating: number }>();
    for (const t of tasks) {
      if (t.archived || t.scope !== 'team') continue;
      const late = isOverdue(t, today);
      if (t.clientId) {
        const c = byClient.get(t.clientId) ?? { open: 0, late: 0, done: 0, total: 0 };
        c.total += 1;
        if (t.status === 'done') c.done += 1;
        else c.open += 1;
        if (late) c.late += 1;
        byClient.set(t.clientId, c);
      }
      if (t.assigneeId) {
        const m = byMember.get(t.assigneeId) ?? { open: 0, late: 0, done: 0, participating: 0 };
        if (t.status === 'done') m.done += 1;
        else m.open += 1;
        if (late) m.late += 1;
        byMember.set(t.assigneeId, m);
      }
      for (const p of t.participantIds) {
        const m = byMember.get(p) ?? { open: 0, late: 0, done: 0, participating: 0 };
        if (t.status !== 'done') m.participating += 1;
        byMember.set(p, m);
      }
    }
    return { byClient, byMember };
  }, [tasks]);
}

const norm = (s: string) => s.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '');

export function ClientsPage() {
  usePageHeader('Clientes', { subtitle: 'Cadastro e acompanhamento por cliente' });
  const clients = useData((s) => s.clients);
  const projects = useData((s) => s.projects);
  const tasks = useData((s) => s.tasks);
  const deleteClient = useData((s) => s.deleteClient);
  const openClientForm = useUi((s) => s.openClientForm);
  const openOnboardingForm = useUi((s) => s.openOnboardingForm);
  const { byClient } = useTaskStats();
  const [query, setQuery] = useState('');

  const shown = useMemo(
    () => [...clients].filter((c) => !query || norm(`${c.name} ${c.contactName} ${c.email}`).includes(norm(query))).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [clients, query],
  );

  const remove = async (client: Client) => {
    const linked = tasks.filter((t) => t.clientId === client.id).length;
    const linkedProjects = projects.filter((p) => p.clientId === client.id).length;
    const details = [
      linked && `${linked} tarefa(s) vinculada(s) a este cliente serão mantidas, mas ficarão sem cliente (mantendo a cor atual)`,
      linkedProjects && `${linkedProjects} projeto(s) dele continuarão existindo, sem cliente`,
    ]
      .filter(Boolean)
      .join('; ');
    const ok = await confirmAction({
      title: `Remover ${client.name}?`,
      message: details ? `${details}. Esta ação não pode ser desfeita.` : 'O cliente será removido. Esta ação não pode ser desfeita.',
      confirmLabel: 'Remover cliente',
    });
    if (!ok) return;
    try {
      await deleteClient(client.id);
      toast.success('Cliente removido.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="page">
      <div className="page-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar cliente" />
        <div className="toolbar-spacer" />
        <button type="button" className="btn btn-secondary" onClick={() => openOnboardingForm(null)} disabled={!clients.length}>
          <Rocket size={16} /> <span className="hide-sm">Iniciar onboarding</span>
        </button>
        <button type="button" className="btn btn-primary" onClick={() => openClientForm()}>
          <Plus size={16} /> Novo cliente
        </button>
      </div>

      {!clients.length ? (
        <EmptyState
          icon={<Building2 size={26} />}
          title="Nenhum cliente cadastrado"
          description="Cadastre clientes para separar as tarefas por conta, com cores próprias e acesso rápido no menu."
          actions={
            <button type="button" className="btn btn-primary" onClick={() => openClientForm()}>
              <Plus size={16} /> Cadastrar cliente
            </button>
          }
        />
      ) : !shown.length ? (
        <EmptyState icon={<Search size={26} />} title="Nenhum cliente encontrado" description={`Nada corresponde a "${query}".`} compact />
      ) : (
        <div className="entity-grid">
          {shown.map((c) => {
            const s = byClient.get(c.id) ?? { open: 0, late: 0, done: 0, total: 0 };
            const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
            return (
              <article key={c.id} className="entity-card" style={{ ['--chip-color' as string]: c.color }}>
                <div className="entity-card-top">
                  <span className="entity-swatch" style={{ background: c.color, color: readableOn(c.color) }}>
                    {initials(c.name)}
                  </span>
                  <div className="entity-title">
                    <Link to={`/clients/${c.id}`} className="entity-name truncate">
                      {c.name}
                    </Link>
                    <span className="muted truncate">{c.contactName || 'Sem contato cadastrado'}</span>
                  </div>
                  <Popover
                    align="end"
                    width={200}
                    trigger={({ toggle, ref }) => (
                      <button type="button" ref={ref} className="icon-btn sm" onClick={toggle} aria-label={`Ações de ${c.name}`}>
                        <MoreVertical size={16} />
                      </button>
                    )}
                  >
                    {(close) => (
                      <div className="menu">
                        <MenuItem icon={<Pencil size={15} />} onClick={() => { close(); openClientForm(c); }}>
                          Editar
                        </MenuItem>
                        <MenuItem icon={<Rocket size={15} />} onClick={() => { close(); openOnboardingForm(c.id); }}>
                          Iniciar onboarding
                        </MenuItem>
                        <div className="menu-sep" />
                        <MenuItem icon={<Trash2 size={15} />} danger onClick={() => { close(); void remove(c); }}>
                          Remover
                        </MenuItem>
                      </div>
                    )}
                  </Popover>
                </div>
                {(c.email || c.phone) && (
                  <div className="entity-contact">
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="truncate">
                        <Mail size={13} /> {c.email}
                      </a>
                    )}
                    {c.phone && (
                      <span className="truncate">
                        <Phone size={13} /> {c.phone}
                      </span>
                    )}
                  </div>
                )}
                <div className="entity-stats">
                  <div>
                    <strong>{s.open}</strong>
                    <span>em aberto</span>
                  </div>
                  <div className={s.late ? 'late' : ''}>
                    <strong>{s.late}</strong>
                    <span>atrasadas</span>
                  </div>
                  <div>
                    <strong>{s.done}</strong>
                    <span>finalizadas</span>
                  </div>
                </div>
                <div className="entity-progress" title={`${pct}% concluído`}>
                  <div className="progress">
                    <div className="progress-bar" style={{ width: `${pct}%`, background: c.color }} />
                  </div>
                  <span className="muted">{pct}%</span>
                </div>
                <Link to={`/clients/${c.id}`} className="entity-link">
                  Ver tarefas <ArrowRight size={14} />
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TeamPage() {
  usePageHeader('Equipe', { subtitle: 'Membros, funções e carga de trabalho' });
  const members = useData((s) => s.members);
  const tasks = useData((s) => s.tasks);
  const deleteMember = useData((s) => s.deleteMember);
  const openMemberForm = useUi((s) => s.openMemberForm);
  const currentUserId = usePrefs((s) => s.currentUserId);
  const setCurrentUser = usePrefs((s) => s.setCurrentUser);
  const { byMember } = useTaskStats();
  const [query, setQuery] = useState('');

  const shown = useMemo(
    () => [...members].filter((m) => !query || norm(`${m.name} ${m.role} ${m.email}`).includes(norm(query))).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [members, query],
  );
  const maxLoad = Math.max(1, ...members.map((m) => byMember.get(m.id)?.open ?? 0));

  const remove = async (member: Member) => {
    const assigned = tasks.filter((t) => t.assigneeId === member.id).length;
    const personal = tasks.filter((t) => t.scope === 'personal' && t.ownerId === member.id).length;
    const details = [
      assigned && `${assigned} tarefa(s) ficarão sem responsável`,
      personal && `${personal} tarefa(s) pessoal(is) passarão para o quadro da equipe`,
    ]
      .filter(Boolean)
      .join('; ');
    const ok = await confirmAction({
      title: `Remover ${member.name}?`,
      message: `${details ? details + '. ' : ''}Comentários e histórico são mantidos. Esta ação não pode ser desfeita.`,
      confirmLabel: 'Remover membro',
    });
    if (!ok) return;
    try {
      await deleteMember(member.id);
      if (member.id === currentUserId) setCurrentUser(null);
      toast.success(`${member.name} foi removido(a) da equipe.`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="page">
      <div className="page-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar membro" />
        <div className="toolbar-spacer" />
        <button type="button" className="btn btn-primary" onClick={() => openMemberForm()}>
          <UserPlus size={16} /> Novo membro
        </button>
      </div>

      {!members.length ? (
        <EmptyState
          icon={<Users size={26} />}
          title="Nenhum membro na equipe"
          description="Cadastre as pessoas da equipe para atribuir tarefas, adicionar participantes e usar @menções."
          actions={
            <button type="button" className="btn btn-primary" onClick={() => openMemberForm()}>
              <UserPlus size={16} /> Adicionar membro
            </button>
          }
        />
      ) : !shown.length ? (
        <EmptyState icon={<Search size={26} />} title="Nenhum membro encontrado" description={`Nada corresponde a "${query}".`} compact />
      ) : (
        <div className="entity-grid">
          {shown.map((m) => {
            const s = byMember.get(m.id) ?? { open: 0, late: 0, done: 0, participating: 0 };
            const isMe = m.id === currentUserId;
            return (
              <article key={m.id} className={`entity-card member-card${isMe ? ' is-me' : ''}`}>
                <div className="entity-card-top">
                  <Avatar member={m} size="lg" />
                  <div className="entity-title">
                    <span className="entity-name truncate">
                      {m.name} {isMe && <span className="badge me-badge">Você</span>}
                    </span>
                    <span className="muted truncate">{m.role || 'Membro da equipe'}</span>
                  </div>
                  <Popover
                    align="end"
                    width={210}
                    trigger={({ toggle, ref }) => (
                      <button type="button" ref={ref} className="icon-btn sm" onClick={toggle} aria-label={`Ações de ${m.name}`}>
                        <MoreVertical size={16} />
                      </button>
                    )}
                  >
                    {(close) => (
                      <div className="menu">
                        <MenuItem icon={<Pencil size={15} />} onClick={() => { close(); openMemberForm(m); }}>
                          Editar
                        </MenuItem>
                        {!isMe && (
                          <MenuItem icon={<UserRound size={15} />} onClick={() => { close(); setCurrentUser(m.id); toast.success(`Agora você está usando como ${m.name}.`); }}>
                            Sou eu
                          </MenuItem>
                        )}
                        <div className="menu-sep" />
                        <MenuItem icon={<Trash2 size={15} />} danger onClick={() => { close(); void remove(m); }}>
                          Remover
                        </MenuItem>
                      </div>
                    )}
                  </Popover>
                </div>
                {m.email && (
                  <div className="entity-contact">
                    <a href={`mailto:${m.email}`} className="truncate">
                      <Mail size={13} /> {m.email}
                    </a>
                  </div>
                )}
                <div className="entity-stats">
                  <div>
                    <strong>{s.open}</strong>
                    <span>responsável</span>
                  </div>
                  <div>
                    <strong>{s.participating}</strong>
                    <span>participa</span>
                  </div>
                  <div className={s.late ? 'late' : ''}>
                    <strong>
                      {s.late > 0 && <AlertTriangle size={13} />} {s.late}
                    </strong>
                    <span>atrasadas</span>
                  </div>
                </div>
                <div className="entity-progress" title={`Carga: ${s.open} tarefa(s) em aberto`}>
                  <div className="progress">
                    <div className="progress-bar" style={{ width: `${Math.round((s.open / maxLoad) * 100)}%`, background: m.color }} />
                  </div>
                  <span className="muted">carga</span>
                </div>
                <Link to={`/tasks?assignee=${m.id}`} className="entity-link">
                  Ver tarefas de {m.name.split(' ')[0]} <ArrowRight size={14} />
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

