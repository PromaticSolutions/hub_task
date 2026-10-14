import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Folder, FolderKanban, MoreVertical, Pause, Pencil, Play, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import type { Project, ProjectStatus } from '../../shared/types';
import { errorMessage } from '../lib/api';
import { PROJECT_STATUS_META } from '../lib/constants';
import { readableOn } from '../lib/color';
import { isOverdue, todayKey } from '../lib/dates';
import { useData } from '../store/data';
import { confirmAction, toast, useUi } from '../store/ui';
import { useClientsById } from '../hooks/useLookups';
import { usePageHeader } from '../hooks/usePageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { MenuItem, Popover } from '../components/ui/Popover';
import { SearchInput } from '../components/ui/SearchInput';

type Tab = 'open' | 'done' | 'all';

const TABS: { key: Tab; label: string }[] = [
  { key: 'open', label: 'Em aberto' },
  { key: 'done', label: 'Concluídos' },
  { key: 'all', label: 'Todos' },
];

const STATUS_RANK: Record<ProjectStatus, number> = { active: 0, paused: 1, done: 2 };

const norm = (s: string) => s.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '');

export function ProjectsPage() {
  usePageHeader('Projetos', { subtitle: 'Um quadro para cada projeto, com ou sem cliente' });
  const projects = useData((s) => s.projects);
  const tasks = useData((s) => s.tasks);
  const saveProject = useData((s) => s.saveProject);
  const deleteProject = useData((s) => s.deleteProject);
  const openProjectForm = useUi((s) => s.openProjectForm);
  const clientsById = useClientsById();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('open');

  const stats = useMemo(() => {
    const today = todayKey();
    const byProject = new Map<string, { open: number; late: number; done: number; total: number }>();
    for (const t of tasks) {
      if (t.archived || t.scope !== 'team' || !t.projectId) continue;
      const s = byProject.get(t.projectId) ?? { open: 0, late: 0, done: 0, total: 0 };
      s.total += 1;
      if (t.status === 'done') s.done += 1;
      else s.open += 1;
      if (isOverdue(t, today)) s.late += 1;
      byProject.set(t.projectId, s);
    }
    return byProject;
  }, [tasks]);

  const tabCounts: Record<Tab, number> = {
    open: projects.filter((p) => p.status !== 'done').length,
    done: projects.filter((p) => p.status === 'done').length,
    all: projects.length,
  };

  const shown = useMemo(
    () =>
      projects
        .filter((p) => (tab === 'all' ? true : tab === 'done' ? p.status === 'done' : p.status !== 'done'))
        .filter((p) => {
          if (!query) return true;
          const client = p.clientId ? clientsById.get(p.clientId)?.name ?? '' : '';
          return norm(`${p.name} ${p.description} ${client}`).includes(norm(query));
        })
        .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.name.localeCompare(b.name, 'pt-BR')),
    [projects, tab, query, clientsById],
  );

  const setStatus = async (project: Project, status: ProjectStatus) => {
    const { name, color, description, clientId } = project;
    try {
      await saveProject({ name, color, description, clientId, status }, project.id);
      toast.success(`"${project.name}" agora está ${PROJECT_STATUS_META[status].label.toLowerCase()}.`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = async (project: Project) => {
    const linked = tasks.filter((t) => t.projectId === project.id).length;
    const ok = await confirmAction({
      title: `Remover ${project.name}?`,
      message: linked
        ? `${linked} tarefa(s) deste projeto serão mantidas, mas ficarão sem projeto. Esta ação não pode ser desfeita.`
        : 'O projeto será removido. Esta ação não pode ser desfeita.',
      confirmLabel: 'Remover projeto',
    });
    if (!ok) return;
    try {
      await deleteProject(project.id);
      toast.success('Projeto removido.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="page">
      <div className="page-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar projeto" />
        {projects.length > 0 && (
          <div className="segmented" role="tablist" aria-label="Situação dos projetos">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
                {t.label}
                <span className="count-pill">{tabCounts[t.key]}</span>
              </button>
            ))}
          </div>
        )}
        <div className="toolbar-spacer" />
        <button type="button" className="btn btn-primary" onClick={() => openProjectForm()}>
          <Plus size={16} /> Novo projeto
        </button>
      </div>

      {!projects.length ? (
        <EmptyState
          icon={<FolderKanban size={26} />}
          title="Nenhum projeto ainda"
          description="Crie projetos para separar as tarefas em quadros próprios: por cliente, produto ou iniciativa interna."
          actions={
            <button type="button" className="btn btn-primary" onClick={() => openProjectForm()}>
              <Plus size={16} /> Criar projeto
            </button>
          }
        />
      ) : !shown.length ? (
        <EmptyState
          icon={<Search size={26} />}
          title="Nenhum projeto encontrado"
          description={query ? `Nada corresponde a "${query}".` : tab === 'done' ? 'Nenhum projeto concluído.' : 'Nenhum projeto em aberto.'}
          compact
        />
      ) : (
        <div className="entity-grid">
          {shown.map((p) => {
            const s = stats.get(p.id) ?? { open: 0, late: 0, done: 0, total: 0 };
            const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
            const client = p.clientId ? clientsById.get(p.clientId) : undefined;
            return (
              <article key={p.id} className={`entity-card project-card status-${p.status}`} style={{ ['--chip-color' as string]: p.color }}>
                <div className="entity-card-top">
                  <span className="entity-swatch" style={{ background: p.color, color: readableOn(p.color) }}>
                    <Folder size={19} />
                  </span>
                  <div className="entity-title">
                    <Link to={`/projects/${p.id}`} className="entity-name truncate" title={p.name}>
                      {p.name}
                    </Link>
                    <span className="muted truncate project-card-client">
                      {client ? (
                        <>
                          <span className="client-dot" style={{ background: client.color }} />
                          {client.name}
                        </>
                      ) : (
                        'Sem cliente'
                      )}
                    </span>
                  </div>
                  {p.status !== 'active' && <span className={`badge project-status ${p.status}`}>{PROJECT_STATUS_META[p.status].label}</span>}
                  <Popover
                    align="end"
                    width={210}
                    trigger={({ toggle, ref }) => (
                      <button type="button" ref={ref} className="icon-btn sm" onClick={toggle} aria-label={`Ações de ${p.name}`}>
                        <MoreVertical size={16} />
                      </button>
                    )}
                  >
                    {(close) => (
                      <div className="menu">
                        <MenuItem icon={<Pencil size={15} />} onClick={() => { close(); openProjectForm(p); }}>
                          Editar
                        </MenuItem>
                        {p.status === 'active' && (
                          <MenuItem icon={<Pause size={15} />} onClick={() => { close(); void setStatus(p, 'paused'); }}>
                            Pausar
                          </MenuItem>
                        )}
                        {p.status === 'paused' && (
                          <MenuItem icon={<Play size={15} />} onClick={() => { close(); void setStatus(p, 'active'); }}>
                            Retomar
                          </MenuItem>
                        )}
                        {p.status !== 'done' ? (
                          <MenuItem icon={<CheckCircle2 size={15} />} onClick={() => { close(); void setStatus(p, 'done'); }}>
                            Marcar como concluído
                          </MenuItem>
                        ) : (
                          <MenuItem icon={<RotateCcw size={15} />} onClick={() => { close(); void setStatus(p, 'active'); }}>
                            Reabrir projeto
                          </MenuItem>
                        )}
                        <div className="menu-sep" />
                        <MenuItem icon={<Trash2 size={15} />} danger onClick={() => { close(); void remove(p); }}>
                          Remover
                        </MenuItem>
                      </div>
                    )}
                  </Popover>
                </div>
                {p.description && <p className="project-card-desc">{p.description}</p>}
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
                    <div className="progress-bar" style={{ width: `${pct}%`, background: p.color }} />
                  </div>
                  <span className="muted">{pct}%</span>
                </div>
                <Link to={`/projects/${p.id}`} className="entity-link">
                  Abrir quadro <ArrowRight size={14} />
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
