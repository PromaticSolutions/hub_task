import { memo, useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  defaultDropAnimationSideEffects,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';
import { STATUSES, type Status, type Task } from '../../../shared/types';
import { STATUS_META } from '../../lib/constants';
import { errorMessage } from '../../lib/api';
import { isOverdue, todayKey } from '../../lib/dates';
import { useData } from '../../store/data';
import { toast } from '../../store/ui';
import { useClientsById, useMembersById, useProjectsById } from '../../hooks/useLookups';
import { TaskCard } from './TaskCard';
import type { TaskViewProps } from './types';

type Columns = Record<Status, string[]>;

const isStatus = (id: UniqueIdentifier): id is Status => (STATUSES as readonly string[]).includes(String(id));

function findColumn(id: UniqueIdentifier, columns: Columns): Status | null {
  if (isStatus(id)) return id;
  return STATUSES.find((s) => columns[s].includes(String(id))) ?? null;
}

/**
 * Prefers the card under the pointer, then the column under the pointer (append at its end).
 * closestCorners alone picks wrong targets with tall columns; it stays as the keyboard fallback.
 */
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length) {
    const card = hits.find((h) => !isStatus(h.id));
    return [card ?? hits[0]];
  }
  return closestCorners(args);
};

const dropAnimation: DropAnimation = {
  duration: 220,
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }),
};

interface CardSlotProps {
  task: Task;
  selected: boolean;
  checked: boolean;
  onOpen: (id: string) => void;
  onToggleCheck: (id: string) => void;
}

const SortableTask = memo(function SortableTask({ task, selected, checked, onOpen, onToggleCheck }: CardSlotProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const membersById = useMembersById();
  const clientsById = useClientsById();
  const projectsById = useProjectsById();
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    listeners?.onKeyDown?.(e);
    if (e.key === 'Enter' && !e.defaultPrevented) onOpen(task.id);
  };
  return (
    <div
      ref={setNodeRef}
      className={`sortable-slot${isDragging ? ' is-placeholder' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      aria-roledescription="tarefa arrastável"
    >
      <TaskCard
        task={task}
        client={task.clientId ? clientsById.get(task.clientId) : undefined}
        project={task.projectId ? projectsById.get(task.projectId) : undefined}
        assignee={task.assigneeId ? membersById.get(task.assigneeId) : undefined}
        participants={task.participantIds.map((id) => membersById.get(id)).filter((m): m is NonNullable<typeof m> => !!m)}
        selected={selected}
        checked={checked}
        onOpen={onOpen}
        onToggleCheck={onToggleCheck}
      />
    </div>
  );
});

function Column({
  status,
  ids,
  tasksById,
  props,
  isDropTarget,
}: {
  status: Status;
  ids: string[];
  tasksById: Map<string, Task>;
  props: TaskViewProps;
  isDropTarget: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: status });
  const meta = STATUS_META[status];
  const today = todayKey();
  const late = ids.filter((id) => {
    const t = tasksById.get(id);
    return !!t && isOverdue(t, today);
  }).length;
  return (
    <section className={`kanban-col col-${status}${isDropTarget ? ' is-over' : ''}`} aria-label={meta.label}>
      <header className="kanban-col-head">
        <span className="kanban-col-dot" style={{ background: meta.color }} />
        <h3>{meta.label}</h3>
        <span className="kanban-col-count">{ids.length}</span>
        {late > 0 && status !== 'done' && (
          <span className="kanban-col-late" title={`${late} atrasada(s)`}>
            {late} atrasada{late > 1 ? 's' : ''}
          </span>
        )}
        <button
          type="button"
          className="icon-btn sm kanban-col-add"
          onClick={() => props.onCreate({ status })}
          aria-label={`Nova tarefa em ${meta.label}`}
          title={`Nova tarefa em ${meta.label}`}
        >
          <Plus size={16} />
        </button>
      </header>
      <div ref={setNodeRef} className="kanban-col-body">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => {
            const task = tasksById.get(id);
            if (!task) return null;
            return (
              <SortableTask
                key={id}
                task={task}
                selected={props.selectedId === id}
                checked={props.checked.has(id)}
                onOpen={props.onOpen}
                onToggleCheck={props.onToggleCheck}
              />
            );
          })}
        </SortableContext>
        {ids.length === 0 && (
          <div className="kanban-empty">
            <span>{isDropTarget ? 'Solte aqui' : 'Nenhuma tarefa'}</span>
            <small>Arraste cards para cá</small>
          </div>
        )}
      </div>
      <button type="button" className="kanban-add" onClick={() => props.onCreate({ status })}>
        <Plus size={15} /> Adicionar tarefa
      </button>
    </section>
  );
}

export function KanbanBoard(props: TaskViewProps) {
  const { tasks, sort, visibleStatuses } = props;
  const updateTask = useData((s) => s.updateTask);
  const membersById = useMembersById();
  const clientsById = useClientsById();
  const projectsById = useProjectsById();
  const allTasks = useData((s) => s.tasks);

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const baseColumns = useMemo(() => {
    const cols = Object.fromEntries(STATUSES.map((s) => [s, [] as string[]])) as Columns;
    for (const t of tasks) cols[t.status].push(t.id);
    return cols;
  }, [tasks]);

  const [dragColumns, setDragColumns] = useState<Columns | null>(null);
  const dragRef = useRef<Columns | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<Status | null>(null);
  const columns = dragColumns ?? baseColumns;

  const setColumns = (next: Columns | null) => {
    dragRef.current = next;
    setDragColumns(next);
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setColumns(baseColumns);
    setOverColumn(findColumn(active.id, baseColumns));
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    const current = dragRef.current;
    if (!over || !current) return;
    const from = findColumn(active.id, current);
    const to = findColumn(over.id, current);
    setOverColumn(to);
    if (!from || !to || from === to) return;
    const activeKey = String(active.id);
    const toItems = [...current[to]];
    let index = toItems.length;
    if (!isStatus(over.id)) {
      const overIndex = toItems.indexOf(String(over.id));
      const translated = active.rect.current.translated;
      const below = translated ? translated.top > over.rect.top + over.rect.height / 2 : false;
      index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : toItems.length;
    }
    toItems.splice(index, 0, activeKey);
    setColumns({ ...current, [from]: current[from].filter((id) => id !== activeKey), [to]: toItems });
  };

  const reset = () => {
    setActiveId(null);
    setOverColumn(null);
    setColumns(null);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const current = dragRef.current;
    const task = tasksById.get(String(active.id));
    if (!over || !current || !task) return reset();
    const status = findColumn(over.id, current) ?? findColumn(active.id, current);
    if (!status) return reset();

    let list = current[status];
    if (!isStatus(over.id) && findColumn(active.id, current) === status) {
      const oldIndex = list.indexOf(task.id);
      const newIndex = list.indexOf(String(over.id));
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) list = arrayMove(list, oldIndex, newIndex);
    }

    const patch: { status?: Status; order?: number } = {};
    if (status !== task.status) patch.status = status;
    if (sort === 'manual') {
      const idx = list.indexOf(task.id);
      const prev = tasksById.get(list[idx - 1]);
      const next = tasksById.get(list[idx + 1]);
      let order = task.order;
      if (prev && next) order = (prev.order + next.order) / 2;
      else if (prev) order = prev.order + 1;
      else if (next) order = next.order - 1;
      if (order !== task.order || patch.status) patch.order = order;
    }

    reset();
    if (!patch.status && patch.order === undefined) return;

    const before = { status: task.status, order: task.order };
    updateTask(task.id, patch)
      .then(() => {
        if (patch.status) {
          toast.success(`"${task.title}" movida para ${STATUS_META[patch.status].label}.`, {
            label: 'Desfazer',
            run: () => {
              updateTask(task.id, before).catch((err) => toast.error(errorMessage(err)));
            },
          });
        }
      })
      .catch((err) => toast.error(`Não foi possível mover a tarefa: ${errorMessage(err)}`));
  };

  const activeTask = activeId ? allTasks.find((t) => t.id === activeId) : undefined;

  const announcements: Announcements = useMemo(() => {
    const title = (id: UniqueIdentifier) => allTasks.find((t) => t.id === id)?.title ?? 'Tarefa';
    const columnLabel = (id: UniqueIdentifier | undefined) => {
      if (!id) return '';
      const col = isStatus(id) ? id : findColumn(id, dragRef.current ?? baseColumns);
      return col ? STATUS_META[col].label : '';
    };
    return {
      onDragStart: ({ active }) => `Tarefa "${title(active.id)}" selecionada para mover.`,
      onDragOver: ({ active, over }) => (over ? `"${title(active.id)}" sobre a coluna ${columnLabel(over.id)}.` : ''),
      onDragEnd: ({ active, over }) =>
        over ? `"${title(active.id)}" solta em ${columnLabel(over.id)}.` : `"${title(active.id)}" solta.`,
      onDragCancel: ({ active }) => `Movimento de "${title(active.id)}" cancelado.`,
    };
  }, [allTasks, baseColumns]);

  const statuses = visibleStatuses.length ? STATUSES.filter((s) => visibleStatuses.includes(s)) : STATUSES;

  const handleCancel = useCallback(() => reset(), []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={handleCancel}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'Para mover uma tarefa, pressione espaço. Use as setas para trocar de posição ou de coluna e espaço novamente para soltar. Esc cancela. Enter abre a tarefa.',
        },
      }}
    >
      <div className={`kanban${activeId ? ' is-dragging' : ''}`}>
        {statuses.map((status) => (
          <Column
            key={status}
            status={status}
            ids={columns[status]}
            tasksById={tasksById}
            props={props}
            isDropTarget={!!activeId && overColumn === status}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={dropAnimation}>
        {activeTask && (
          <TaskCard
            task={activeTask}
            client={activeTask.clientId ? clientsById.get(activeTask.clientId) : undefined}
            project={activeTask.projectId ? projectsById.get(activeTask.projectId) : undefined}
            assignee={activeTask.assigneeId ? membersById.get(activeTask.assigneeId) : undefined}
            participants={activeTask.participantIds.map((id) => membersById.get(id)).filter((m): m is NonNullable<typeof m> => !!m)}
            overlay
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
