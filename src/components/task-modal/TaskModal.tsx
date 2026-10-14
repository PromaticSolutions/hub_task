import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Archive,
  ArchiveRestore,
  Check,
  Copy,
  FileQuestion,
  Lock,
  MoreHorizontal,
  Pencil,
  Rocket,
  Trash2,
  UserRound,
  Users,
  X,
  AlignLeft,
  CalendarClock,
  Building2,
  Flag,
  Palette,
  Eye,
} from 'lucide-react';
import { PRIORITIES, type Priority, type Status, type Task, type TaskInput, type TaskScope } from '../../../shared/types';
import { PRIORITY_META } from '../../lib/constants';
import { errorMessage } from '../../lib/api';
import { addDaysKey, formatDateTime, isOverdue, todayKey } from '../../lib/dates';
import { useData } from '../../store/data';
import { confirmAction, toast, useUi } from '../../store/ui';
import { useClientsById, useCurrentUser, useMembersById } from '../../hooks/useLookups';
import { useTaskActions } from '../../hooks/useTaskActions';
import { useTaskModal } from '../../hooks/useTaskModal';
import { Avatar } from '../ui/Avatar';
import { ColorPicker } from '../ui/ColorPicker';
import { EmptyState } from '../ui/EmptyState';
import { MentionText, MentionTextarea } from '../ui/Mentions';
import { Modal } from '../ui/Modal';
import { MenuItem, Popover } from '../ui/Popover';
import { MultiPicker, SelectPicker, clientOptions, memberOptions, noAssigneeIcon } from '../ui/Pickers';
import { StatusMenu } from '../tasks/StatusMenu';
import { PendingAttachments, TaskAttachments } from './Attachments';
import { TaskActivity } from './Activity';

interface Draft {
  title: string;
  description: string;
  clientId: string | null;
  color: string | null;
  assigneeId: string | null;
  participantIds: string[];
  priority: Priority;
  status: Status;
  dueDate: string | null;
  scope: TaskScope;
  onboarding: boolean;
}

const DRAFT_KEYS: (keyof Draft)[] = [
  'title',
  'description',
  'clientId',
  'color',
  'assigneeId',
  'participantIds',
  'priority',
  'status',
  'dueDate',
  'scope',
  'onboarding',
];

function draftFromTask(t: Task): Draft {
  return {
    title: t.title,
    description: t.description,
    clientId: t.clientId,
    color: t.color,
    assigneeId: t.assigneeId,
    participantIds: t.participantIds,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate,
    scope: t.scope,
    onboarding: t.onboarding,
  };
}

function draftFromDefaults(d: Partial<TaskInput>): Draft {
  return {
    title: d.title ?? '',
    description: d.description ?? '',
    clientId: d.clientId ?? null,
    color: d.color ?? null,
    assigneeId: d.assigneeId ?? null,
    participantIds: d.participantIds ?? [],
    priority: d.priority ?? 'medium',
    status: d.status ?? 'todo',
    dueDate: d.dueDate ?? null,
    scope: d.scope ?? 'team',
    onboarding: d.onboarding ?? false,
  };
}

const same = (a: unknown, b: unknown) =>
  Array.isArray(a) && Array.isArray(b) ? [...a].sort().join(',') === [...b].sort().join(',') : a === b;

function Prop({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="tm-prop">
      <div className="tm-prop-label">
        {icon}
        {label}
      </div>
      <div className="tm-prop-value">{children}</div>
    </div>
  );
}

export function TaskModalHost() {
  const { openId, closeTask } = useTaskModal();
  const status = useData((s) => s.status);
  if (!openId || status !== 'ready') return null;
  return <TaskModal key={openId} id={openId} onClose={closeTask} />;
}

function TaskModal({ id, onClose }: { id: string; onClose: () => void }) {
  const isNew = id === 'new';
  const task = useData((s) => (isNew ? undefined : s.tasks.find((t) => t.id === id)));
  const members = useData((s) => s.members);
  const clients = useData((s) => s.clients);
  const createTask = useData((s) => s.createTask);
  const updateTask = useData((s) => s.updateTask);
  const uploadAttachments = useData((s) => s.uploadAttachments);
  const membersById = useMembersById();
  const clientsById = useClientsById();
  const me = useCurrentUser();
  const { openTask } = useTaskModal();
  const { duplicate, setArchived, remove } = useTaskActions();

  // New tasks start from the defaults of the page that opened them.
  const [newBase] = useState(() => draftFromDefaults(useUi.getState().newTaskDefaults));
  const base = task ? draftFromTask(task) : newBase;
  const [edits, setEdits] = useState<Partial<Draft>>({});
  const draft: Draft = { ...base, ...edits };
  const changedKeys = DRAFT_KEYS.filter((k) => k in edits && !same(edits[k], base[k]));
  const dirty = changedKeys.length > 0;

  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [editingDesc, setEditingDesc] = useState(isNew);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setEdits((e) => {
      const next = { ...e, [key]: value };
      // The responsible person cannot also be listed as a participant.
      if (key === 'assigneeId' && value) {
        const parts = (next.participantIds ?? base.participantIds).filter((p) => p !== value);
        if (parts.length !== (next.participantIds ?? base.participantIds).length) next.participantIds = parts;
      }
      return next;
    });
    if (key === 'title') setTitleError(null);
  };

  // Auto-grow title field.
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft.title]);

  const requestClose = async () => {
    if (dirty || (isNew && pendingFiles.length)) {
      const ok = await confirmAction({
        title: 'Descartar alterações?',
        message: isNew ? 'A nova tarefa ainda não foi criada. O que você preencheu será perdido.' : 'Você tem alterações não salvas nesta tarefa.',
        confirmLabel: 'Descartar',
      });
      if (!ok) return;
    }
    onClose();
  };

  const save = async () => {
    if (saving) return;
    if (!draft.title.trim()) {
      setTitleError('Informe um título para a tarefa.');
      titleRef.current?.focus();
      return;
    }
    if (draft.scope === 'personal' && !me && (isNew || base.scope !== 'personal')) {
      toast.error('Para tarefas pessoais, selecione quem você é em Configurações.');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await createTask({ ...draft, title: draft.title.trim(), ownerId: draft.scope === 'personal' ? me?.id ?? null : null });
        if (pendingFiles.length) {
          try {
            await uploadAttachments(created.id, pendingFiles);
          } catch (err) {
            toast.error(`Tarefa criada, mas os anexos falharam: ${errorMessage(err)}`);
          }
        }
        toast.success(`Tarefa #${created.number} criada.`, { label: 'Abrir', run: () => openTask(created.id) });
        onClose();
        return;
      }
      if (!task || !dirty) return;
      const patch: Record<string, unknown> = {};
      for (const k of changedKeys) patch[k] = k === 'title' ? draft.title.trim() : draft[k];
      if (patch.scope === 'personal') patch.ownerId = me?.id ?? null;
      await updateTask(task.id, patch);
      setEdits({});
      setEditingDesc(false);
      toast.success('Alterações salvas.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Ctrl/Cmd+S saves.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const memberOpts = useMemo(() => memberOptions(members), [members]);
  const clientOpts = useMemo(() => clientOptions(clients), [clients]);

  if (!isNew && !task) {
    return (
      <Modal open onClose={onClose} size="sm" title="Tarefa não encontrada">
        <EmptyState
          icon={<FileQuestion size={26} />}
          title="Esta tarefa não existe mais"
          description="Ela pode ter sido excluída por outra pessoa ou o link está incorreto."
          actions={
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Fechar
            </button>
          }
          compact
        />
      </Modal>
    );
  }

  const client = draft.clientId ? clientsById.get(draft.clientId) : undefined;
  const color = draft.color ?? client?.color ?? null;
  const creator = task?.createdBy ? membersById.get(task.createdBy) : null;
  const overdue = isOverdue(draft);
  const participants = draft.participantIds.map((pid) => membersById.get(pid)).filter((m): m is NonNullable<typeof m> => !!m);
  const participantOptions = memberOpts.filter((o) => o.value !== draft.assigneeId);

  const footer = isNew ? (
    <div className="tm-footer">
      <span className="muted tm-footer-hint hide-sm">Ctrl+S para criar</span>
      <button type="button" className="btn btn-secondary" onClick={requestClose}>
        Cancelar
      </button>
      <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? <span className="spinner" /> : <Check size={16} />}
        Criar tarefa
      </button>
    </div>
  ) : (
    <div className={`tm-footer${dirty ? ' dirty' : ''}`}>
      {dirty ? (
        <>
          <span className="tm-unsaved">
            <span className="dot" /> Alterações não salvas
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => setEdits({})} disabled={saving}>
            Descartar
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <span className="spinner" /> : <Check size={16} />}
            Salvar alterações
          </button>
        </>
      ) : (
        <>
          <span className="tm-saved muted">
            <Check size={15} /> Tudo salvo
          </span>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </>
      )}
    </div>
  );

  return (
    <Modal open onClose={requestClose} size="xl" hideHeader className="task-modal" footer={footer}>
      <div className={`tm${draft.status === 'blocked' ? ' is-blocked' : ''}${draft.status === 'done' ? ' is-done' : ''}`} style={color ? { ['--task-color' as string]: color } : undefined}>
        <div className="tm-header">
          <div className="tm-head-row">
            <span className="tm-number">{isNew ? 'Nova tarefa' : `#${task!.number}`}</span>
            {client && (
              <span className="chip" style={{ ['--chip-color' as string]: client.color }}>
                <span className="chip-dot" />
                {client.name}
              </span>
            )}
            {draft.scope === 'personal' && <span className="badge tm-tag">Pessoal</span>}
            {draft.onboarding && (
              <span className="badge tm-tag">
                <Rocket size={12} /> Onboarding
              </span>
            )}
            {overdue && <span className="badge tm-tag danger">Atrasada</span>}
            <div className="toolbar-spacer" />
            {!isNew && task && (
              <Popover
                align="end"
                width={200}
                trigger={({ toggle, ref }) => (
                  <button type="button" ref={ref} className="icon-btn" onClick={toggle} aria-label="Mais ações">
                    <MoreHorizontal size={18} />
                  </button>
                )}
              >
                {(close) => (
                  <div className="menu">
                    <MenuItem icon={<Copy size={15} />} onClick={() => { close(); void duplicate(task); }}>
                      Duplicar tarefa
                    </MenuItem>
                    <MenuItem
                      icon={task.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                      onClick={() => {
                        close();
                        void setArchived(task, !task.archived);
                      }}
                    >
                      {task.archived ? 'Restaurar tarefa' : 'Arquivar tarefa'}
                    </MenuItem>
                    <div className="menu-sep" />
                    <MenuItem
                      icon={<Trash2 size={15} />}
                      danger
                      onClick={async () => {
                        close();
                        if (await remove(task)) onClose();
                      }}
                    >
                      Excluir tarefa
                    </MenuItem>
                  </div>
                )}
              </Popover>
            )}
            <button type="button" className="icon-btn" onClick={requestClose} aria-label="Fechar">
              <X size={18} />
            </button>
          </div>
          <textarea
            ref={titleRef}
            className={`tm-title${titleError ? ' invalid' : ''}`}
            value={draft.title}
            onChange={(e) => set('title', e.target.value.replace(/\n/g, ' '))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (isNew || e.ctrlKey || e.metaKey) void save();
              }
            }}
            placeholder="Título da tarefa"
            aria-label="Título da tarefa"
            aria-invalid={!!titleError}
            rows={1}
            maxLength={200}
            data-autofocus={isNew ? '' : undefined}
          />
          {titleError && <p className="field-error">{titleError}</p>}
        </div>

        {task?.archived && (
          <div className="tm-banner">
            <Archive size={16} />
            <span>Esta tarefa está arquivada e não aparece nos quadros.</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setArchived(task, false)}>
              <ArchiveRestore size={14} /> Restaurar
            </button>
          </div>
        )}
        {draft.status === 'blocked' && (
          <div className="tm-banner danger">
            <Lock size={16} />
            <span>Tarefa bloqueada. Registre nos comentários o que está impedindo o andamento.</span>
          </div>
        )}

        <div className="tm-body">
          <div className="tm-main">
            <section className="tm-section">
              <div className="tm-section-head">
                <AlignLeft size={16} />
                <h3>Descrição</h3>
                {!editingDesc && (
                  <button type="button" className="btn btn-ghost btn-sm tm-edit-desc" onClick={() => setEditingDesc(true)}>
                    <Pencil size={13} /> Editar
                  </button>
                )}
              </div>
              {editingDesc ? (
                <MentionTextarea
                  value={draft.description}
                  onChange={(v) => set('description', v)}
                  members={members}
                  rows={5}
                  placeholder="Detalhes, contexto, links... Use @ para mencionar alguém da equipe."
                  ariaLabel="Descrição da tarefa"
                  autoFocus={!isNew}
                />
              ) : draft.description.trim() ? (
                <div className="tm-desc" onDoubleClick={() => setEditingDesc(true)} title="Clique duas vezes para editar">
                  <MentionText text={draft.description} members={members} meId={me?.id} />
                </div>
              ) : (
                <button type="button" className="tm-desc-empty" onClick={() => setEditingDesc(true)}>
                  Adicionar uma descrição mais detalhada...
                </button>
              )}
            </section>

            {isNew ? <PendingAttachments files={pendingFiles} onChange={setPendingFiles} /> : task && <TaskAttachments task={task} />}
            {!isNew && task && <TaskActivity task={task} />}
          </div>

          <aside className="tm-side">
            <Prop icon={<span className="tm-status-icon" />} label="Status">
              <StatusMenu value={draft.status} onChange={(s) => set('status', s)} block />
            </Prop>

            <Prop icon={<Flag size={14} />} label="Prioridade">
              <div className="prio-picker" role="radiogroup" aria-label="Prioridade">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={draft.priority === p}
                    className={`prio-option prio-${p}${draft.priority === p ? ' selected' : ''}`}
                    onClick={() => set('priority', p)}
                  >
                    {PRIORITY_META[p].label}
                  </button>
                ))}
              </div>
            </Prop>

            <Prop icon={<Building2 size={14} />} label="Cliente">
              <SelectPicker
                value={draft.clientId}
                onChange={(v) => set('clientId', v)}
                options={clientOpts}
                placeholder="Sem cliente"
                nullable
                nullLabel="Sem cliente"
                ariaLabel="Cliente"
              />
            </Prop>

            <Prop icon={<UserRound size={14} />} label="Responsável">
              <SelectPicker
                value={draft.assigneeId}
                onChange={(v) => set('assigneeId', v)}
                options={memberOpts}
                placeholder="Sem responsável"
                nullable
                nullLabel="Sem responsável"
                ariaLabel="Responsável"
                renderValue={(o) =>
                  o ? (
                    <>
                      {o.icon}
                      <span className="truncate">{o.label}</span>
                    </>
                  ) : (
                    <>
                      {noAssigneeIcon}
                      <span className="picker-placeholder">Sem responsável</span>
                    </>
                  )
                }
              />
              {me && draft.assigneeId !== me.id && (
                <button type="button" className="text-link tm-assign-me" onClick={() => set('assigneeId', me.id)}>
                  Atribuir a mim
                </button>
              )}
            </Prop>

            <Prop icon={<Users size={14} />} label="Participantes">
              <MultiPicker
                values={draft.participantIds}
                onChange={(v) => set('participantIds', v)}
                options={participantOptions}
                label="Participantes"
                ariaLabel="Participantes"
                emptyText="Cadastre membros na Equipe"
                renderTrigger={({ toggle, ref, open }) => (
                  <button type="button" ref={ref} className={`picker-trigger${open ? ' open' : ''}`} onClick={toggle} aria-label="Editar participantes">
                    <span className="picker-value">
                      {participants.length ? (
                        <span className="tm-participants">
                          {participants.map((m) => (
                            <span key={m.id} className="tm-participant" title={m.name}>
                              <Avatar member={m} size="sm" />
                              <span className="truncate">{m.name.split(' ')[0]}</span>
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="picker-placeholder">Adicionar participantes</span>
                      )}
                    </span>
                  </button>
                )}
              />
            </Prop>

            <Prop icon={<CalendarClock size={14} />} label="Previsão de entrega">
              <div className="tm-date">
                <input
                  type="date"
                  className={`input${overdue ? ' input-danger' : ''}`}
                  value={draft.dueDate ?? ''}
                  onChange={(e) => set('dueDate', e.target.value || null)}
                  aria-label="Previsão de entrega"
                />
                {draft.dueDate && (
                  <button type="button" className="icon-btn sm" onClick={() => set('dueDate', null)} aria-label="Remover prazo" title="Remover prazo">
                    <X size={15} />
                  </button>
                )}
              </div>
              <div className="tm-date-quick">
                <button type="button" onClick={() => set('dueDate', todayKey())}>Hoje</button>
                <button type="button" onClick={() => set('dueDate', addDaysKey(todayKey(), 1))}>Amanhã</button>
                <button type="button" onClick={() => set('dueDate', addDaysKey(todayKey(), 7))}>+7 dias</button>
                <button type="button" onClick={() => set('dueDate', addDaysKey(todayKey(), 30))}>+30 dias</button>
              </div>
            </Prop>

            <Prop icon={<Palette size={14} />} label="Cor de identificação">
              <ColorPicker value={draft.color} onChange={(c) => set('color', c)} allowNone noneLabel={client ? `Usar cor do cliente (${client.name})` : 'Sem cor'} />
            </Prop>

            <Prop icon={<Eye size={14} />} label="Visibilidade">
              <div className="segmented full" role="radiogroup" aria-label="Visibilidade">
                <button type="button" role="radio" aria-checked={draft.scope === 'team'} className={draft.scope === 'team' ? 'active' : ''} onClick={() => set('scope', 'team')}>
                  Equipe
                </button>
                <button type="button" role="radio" aria-checked={draft.scope === 'personal'} className={draft.scope === 'personal' ? 'active' : ''} onClick={() => set('scope', 'personal')}>
                  Pessoal
                </button>
              </div>
              {draft.scope === 'personal' && (
                <p className="field-hint">Aparece apenas em "Pessoais" de {task?.ownerId ? membersById.get(task.ownerId)?.name ?? 'seu dono' : me?.name ?? 'quem criar'}.</p>
              )}
            </Prop>

            <label className="switch tm-onboarding">
              <input type="checkbox" checked={draft.onboarding} onChange={(e) => set('onboarding', e.target.checked)} />
              <span>
                <Rocket size={14} /> Etapa de onboarding
              </span>
            </label>

            {!isNew && task && (
              <dl className="tm-meta">
                <div>
                  <dt>Criada em</dt>
                  <dd>
                    {formatDateTime(task.createdAt)}
                    {creator ? ` por ${creator.name}` : ''}
                  </dd>
                </div>
                <div>
                  <dt>Atualizada em</dt>
                  <dd>{formatDateTime(task.updatedAt)}</dd>
                </div>
                {task.completedAt && (
                  <div>
                    <dt>Finalizada em</dt>
                    <dd>{formatDateTime(task.completedAt)}</dd>
                  </div>
                )}
              </dl>
            )}
          </aside>
        </div>
      </div>
    </Modal>
  );
}
