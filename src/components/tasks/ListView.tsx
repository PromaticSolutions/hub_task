import { useMemo } from 'react';
import { Archive, ArrowDown, ArrowUp, ArrowUpDown, Copy, ExternalLink, MoreHorizontal, Trash2, Lock, Rocket } from 'lucide-react';
import { STATUSES, type Task } from '../../../shared/types';
import type { SortKey } from '../../lib/constants';
import { formatDate, isOverdue, todayKey } from '../../lib/dates';
import { errorMessage } from '../../lib/api';
import { useData } from '../../store/data';
import { toast } from '../../store/ui';
import { useClientsById, useMembersById, useProjectsById } from '../../hooks/useLookups';
import { useTaskActions } from '../../hooks/useTaskActions';
import { Avatar } from '../ui/Avatar';
import { ClientChip, DueChip, PriorityBadge, ProjectChip } from '../ui/Badges';
import { MenuItem, Popover } from '../ui/Popover';
import { StatusMenu } from './StatusMenu';
import type { TaskViewProps } from './types';

function SortHeader({
  label,
  sortKey,
  props,
  className,
}: {
  label: string;
  sortKey: SortKey;
  props: TaskViewProps;
  className?: string;
}) {
  const active = props.sort === sortKey;
  const Icon = !active ? ArrowUpDown : props.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={className} aria-sort={active ? (props.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={`th-sort${active ? ' active' : ''}`}
        onClick={() => props.onSort(sortKey, active && props.dir === 'asc' ? 'desc' : 'asc')}
        title={`Ordenar por ${label.toLowerCase()}`}
      >
        {label}
        <Icon size={13} />
      </button>
    </th>
  );
}

function RowMenu({ task }: { task: Task }) {
  const { duplicate, setArchived, remove } = useTaskActions();
  return (
    <Popover
      align="end"
      width={190}
      trigger={({ toggle, ref }) => (
        <button
          type="button"
          ref={ref}
          className="icon-btn sm"
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          aria-label={`Ações da tarefa ${task.title}`}
        >
          <MoreHorizontal size={16} />
        </button>
      )}
    >
      {(close) => (
        <div className="menu" onClick={(e) => e.stopPropagation()}>
          <MenuItem icon={<Copy size={15} />} onClick={() => { close(); void duplicate(task); }}>
            Duplicar
          </MenuItem>
          <MenuItem icon={<Archive size={15} />} onClick={() => { close(); void setArchived(task, !task.archived); }}>
            {task.archived ? 'Restaurar' : 'Arquivar'}
          </MenuItem>
          <div className="menu-sep" />
          <MenuItem icon={<Trash2 size={15} />} danger onClick={() => { close(); void remove(task); }}>
            Excluir
          </MenuItem>
        </div>
      )}
    </Popover>
  );
}

export function ListView(props: TaskViewProps) {
  const { tasks, sort, checked } = props;
  const membersById = useMembersById();
  const clientsById = useClientsById();
  const projectsById = useProjectsById();
  const updateTask = useData((s) => s.updateTask);
  const today = todayKey();

  const rows = useMemo(() => {
    if (sort !== 'manual') return tasks;
    return [...tasks].sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || a.order - b.order);
  }, [tasks, sort]);

  const allChecked = rows.length > 0 && rows.every((t) => checked.has(t.id));
  const someChecked = rows.some((t) => checked.has(t.id));

  return (
    <div className="list-view card">
      <table className="task-table">
        <thead>
          <tr>
            <th className="col-check">
              <input
                type="checkbox"
                className="checkbox"
                checked={allChecked}
                ref={(el) => {
                  if (el) el.indeterminate = !allChecked && someChecked;
                }}
                onChange={() => props.onSetChecked(allChecked ? [] : rows.map((t) => t.id))}
                aria-label="Selecionar todas as tarefas visíveis"
              />
            </th>
            <th className="col-title">Tarefa</th>
            <th className="col-status">Status</th>
            <th className="col-assignee">Responsável</th>
            <SortHeader label="Prioridade" sortKey="priority" props={props} className="col-priority" />
            <SortHeader label="Prazo" sortKey="due" props={props} className="col-due" />
            <SortHeader label="Criada em" sortKey="created" props={props} className="col-created" />
            <th className="col-actions">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((task) => {
            const client = task.clientId ? clientsById.get(task.clientId) : undefined;
            const project = task.projectId ? projectsById.get(task.projectId) : undefined;
            const assignee = task.assigneeId ? membersById.get(task.assigneeId) : undefined;
            const color = task.color ?? client?.color;
            const overdue = isOverdue(task, today);
            const cls = [
              'task-row',
              checked.has(task.id) && 'is-checked',
              props.selectedId === task.id && 'is-selected',
              overdue && 'is-overdue',
              task.status === 'blocked' && 'is-blocked',
              task.status === 'done' && 'is-done',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <tr
                key={task.id}
                className={cls}
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey || e.shiftKey) props.onToggleCheck(task.id);
                  else props.onOpen(task.id);
                }}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target === e.currentTarget) props.onOpen(task.id);
                }}
              >
                <td className="col-check" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={checked.has(task.id)}
                    onChange={() => props.onToggleCheck(task.id)}
                    aria-label={`Selecionar ${task.title}`}
                  />
                </td>
                <td className="col-title">
                  <div className="row-title">
                    <span className="row-stripe" style={{ background: color ?? 'var(--border-strong)' }} />
                    <div className="row-title-text">
                      <span className="row-name">
                        <span className="row-number">#{task.number}</span>
                        <span className="truncate">{task.title}</span>
                        {task.status === 'blocked' && <Lock size={13} className="row-flag blocked" aria-label="Bloqueada" />}
                        {task.onboarding && <Rocket size={13} className="row-flag" aria-label="Onboarding" />}
                      </span>
                      {(client || project) && (
                        <span className="row-tags">
                          <ClientChip client={client} />
                          <ProjectChip project={project} />
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="col-status" data-label="Status" onClick={(e) => e.stopPropagation()}>
                  <StatusMenu
                    value={task.status}
                    onChange={(status) =>
                      updateTask(task.id, { status }).catch((err) => toast.error(errorMessage(err)))
                    }
                  />
                </td>
                <td className="col-assignee" data-label="Responsável">
                  <span className="row-person">
                    <Avatar member={assignee} size="sm" />
                    <span className="truncate">{assignee?.name ?? 'Sem responsável'}</span>
                  </span>
                </td>
                <td className="col-priority" data-label="Prioridade">
                  <PriorityBadge priority={task.priority} />
                </td>
                <td className="col-due" data-label="Prazo">
                  {task.dueDate ? <DueChip task={task} /> : <span className="muted">—</span>}
                </td>
                <td className="col-created muted" data-label="Criada em">
                  {formatDate(task.createdAt)}
                </td>
                <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="icon-btn sm row-open"
                    onClick={() => props.onOpen(task.id)}
                    aria-label={`Abrir ${task.title}`}
                    title="Abrir"
                  >
                    <ExternalLink size={15} />
                  </button>
                  <RowMenu task={task} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
