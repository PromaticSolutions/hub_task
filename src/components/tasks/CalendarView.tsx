import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { CalendarDays, CalendarX2, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { Task } from '../../../shared/types';
import { STATUS_META } from '../../lib/constants';
import { formatDay, isOverdue, ptBR, toDayKey, todayKey } from '../../lib/dates';
import { errorMessage } from '../../lib/api';
import { useData } from '../../store/data';
import { toast } from '../../store/ui';
import { useClientsById, useMembersById } from '../../hooks/useLookups';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { Avatar } from '../ui/Avatar';
import { Popover } from '../ui/Popover';
import type { TaskViewProps } from './types';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const MAX_CHIPS = 3;

function chipClass(task: Task, today: string, selected: boolean) {
  return [
    'cal-chip',
    `st-${task.status}`,
    isOverdue(task, today) && 'is-overdue',
    task.status === 'done' && 'is-done',
    task.status === 'blocked' && 'is-blocked',
    selected && 'is-selected',
  ]
    .filter(Boolean)
    .join(' ');
}

function TaskChip({ task, color, selected, onOpen }: { task: Task; color: string; selected: boolean; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`${chipClass(task, todayKey(), selected)}${isDragging ? ' is-dragging' : ''}`}
      style={{ ['--chip-color' as string]: color }}
      onClick={() => onOpen(task.id)}
      title={`${task.title} · ${STATUS_META[task.status].label}`}
      {...attributes}
      {...listeners}
    >
      <span className="cal-chip-dot" style={{ background: STATUS_META[task.status].color }} />
      <span className="truncate">{task.title}</span>
    </button>
  );
}

function DayCell({
  day,
  month,
  tasks,
  colorOf,
  props,
}: {
  day: Date;
  month: Date;
  tasks: Task[];
  colorOf: (t: Task) => string;
  props: TaskViewProps;
}) {
  const key = toDayKey(day);
  const { setNodeRef, isOver } = useDroppable({ id: `day:${key}` });
  const today = todayKey();
  const outside = !isSameMonth(day, month);
  const weekend = day.getDay() === 0 || day.getDay() === 6;
  const shown = tasks.slice(0, MAX_CHIPS);
  const rest = tasks.length - shown.length;
  return (
    <div
      ref={setNodeRef}
      className={`cal-cell${outside ? ' outside' : ''}${weekend ? ' weekend' : ''}${key === today ? ' today' : ''}${isOver ? ' is-over' : ''}`}
    >
      <div className="cal-cell-head">
        <span className="cal-daynum">{day.getDate()}</span>
        <button
          type="button"
          className="icon-btn sm cal-add"
          onClick={() => props.onCreate({ dueDate: key })}
          aria-label={`Nova tarefa para ${formatDay(key, "d 'de' MMMM")}`}
          title="Nova tarefa neste dia"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="cal-cell-body">
        {shown.map((t) => (
          <TaskChip key={t.id} task={t} color={colorOf(t)} selected={props.selectedId === t.id} onOpen={props.onOpen} />
        ))}
        {rest > 0 && (
          <Popover
            width={260}
            trigger={({ toggle, ref }) => (
              <button type="button" ref={ref} className="cal-more" onClick={toggle}>
                +{rest} mais
              </button>
            )}
          >
            {(close) => (
              <div className="menu cal-more-menu">
                <div className="menu-title">{formatDay(key, "EEEE, d 'de' MMMM")}</div>
                {tasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={chipClass(t, today, props.selectedId === t.id)}
                    style={{ ['--chip-color' as string]: colorOf(t) }}
                    onClick={() => {
                      close();
                      props.onOpen(t.id);
                    }}
                  >
                    <span className="cal-chip-dot" style={{ background: STATUS_META[t.status].color }} />
                    <span className="truncate">{t.title}</span>
                  </button>
                ))}
              </div>
            )}
          </Popover>
        )}
      </div>
    </div>
  );
}

function NoDateTray({ tasks, colorOf, props }: { tasks: Task[]; colorOf: (t: Task) => string; props: TaskViewProps }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'nodate' });
  return (
    <aside ref={setNodeRef} className={`cal-tray card${isOver ? ' is-over' : ''}`} aria-label="Tarefas sem prazo">
      <div className="cal-tray-head">
        <CalendarX2 size={16} />
        <h3>Sem prazo</h3>
        <span className="kanban-col-count">{tasks.length}</span>
      </div>
      <p className="cal-tray-hint muted">Arraste uma tarefa para um dia para definir o prazo.</p>
      <div className="cal-tray-list">
        {tasks.map((t) => (
          <TaskChip key={t.id} task={t} color={colorOf(t)} selected={props.selectedId === t.id} onOpen={props.onOpen} />
        ))}
        {!tasks.length && <p className="cal-tray-empty muted">Todas as tarefas filtradas têm prazo.</p>}
      </div>
    </aside>
  );
}

function Agenda({ month, byDay, colorOf, props }: { month: Date; byDay: Map<string, Task[]>; colorOf: (t: Task) => string; props: TaskViewProps }) {
  const membersById = useMembersById();
  const today = todayKey();
  const keys = [...byDay.keys()].filter((k) => isSameMonth(new Date(k + 'T00:00:00'), month)).sort();
  if (!keys.length) {
    return (
      <div className="cal-agenda-empty muted">
        <CalendarDays size={22} />
        Nenhuma tarefa com prazo neste mês.
      </div>
    );
  }
  return (
    <div className="cal-agenda">
      {keys.map((k) => (
        <section key={k} className={`agenda-day${k === today ? ' today' : ''}`}>
          <header>
            <strong>{formatDay(k, 'd')}</strong>
            <span>{capitalize(formatDay(k, "EEEE, d 'de' MMMM"))}</span>
            <button type="button" className="icon-btn sm" onClick={() => props.onCreate({ dueDate: k })} aria-label="Nova tarefa neste dia">
              <Plus size={14} />
            </button>
          </header>
          {byDay.get(k)!.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`${chipClass(t, today, props.selectedId === t.id)} agenda-item`}
              style={{ ['--chip-color' as string]: colorOf(t) }}
              onClick={() => props.onOpen(t.id)}
            >
              <span className="cal-chip-dot" style={{ background: STATUS_META[t.status].color }} />
              <span className="truncate">{t.title}</span>
              <Avatar member={t.assigneeId ? membersById.get(t.assigneeId) : null} size="sm" />
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

export function CalendarView(props: TaskViewProps) {
  const { tasks } = props;
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [activeId, setActiveId] = useState<string | null>(null);
  const updateTask = useData((s) => s.updateTask);
  const clientsById = useClientsById();
  const compact = useMediaQuery('(max-width: 760px)');

  const colorOf = (t: Task) => t.color ?? (t.clientId ? clientsById.get(t.clientId)?.color : undefined) ?? 'var(--border-strong)';

  const days = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 0 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }) }),
    [month],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const list = map.get(t.dueDate) ?? [];
      list.push(t);
      map.set(t.dueDate, list);
    }
    return map;
  }, [tasks]);

  const noDate = useMemo(() => tasks.filter((t) => !t.dueDate), [tasks]);
  const monthCount = useMemo(
    () => tasks.filter((t) => t.dueDate && isSameMonth(new Date(t.dueDate + 'T00:00:00'), month)).length,
    [tasks, month],
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const onDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const task = tasks.find((t) => t.id === active.id);
    if (!task) return;
    const target = String(over.id);
    const dueDate = target === 'nodate' ? null : target.replace('day:', '');
    if (dueDate === task.dueDate) return;
    const before = task.dueDate;
    updateTask(task.id, { dueDate })
      .then(() =>
        toast.success(dueDate ? `Prazo alterado para ${formatDay(dueDate, "d 'de' MMMM")}.` : 'Prazo removido.', {
          label: 'Desfazer',
          run: () => {
            updateTask(task.id, { dueDate: before }).catch((err) => toast.error(errorMessage(err)));
          },
        }),
      )
      .catch((err) => toast.error(`Não foi possível alterar o prazo: ${errorMessage(err)}`));
  };

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : undefined;
  const title = capitalize(format(month, "MMMM 'de' yyyy", { locale: ptBR }));

  return (
    <div className="calendar">
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button type="button" className="icon-btn" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Mês anterior">
            <ChevronLeft size={18} />
          </button>
          <h2 className="cal-title">{title}</h2>
          <button type="button" className="icon-btn" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Próximo mês">
            <ChevronRight size={18} />
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMonth(startOfMonth(new Date()))}>
            Hoje
          </button>
        </div>
        <span className="muted cal-summary">
          {monthCount} tarefa{monthCount === 1 ? '' : 's'} com prazo neste mês · {noDate.length} sem prazo
        </span>
      </div>

      {compact ? (
        <Agenda month={month} byDay={byDay} colorOf={colorOf} props={props} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
          <div className="cal-layout">
            <div className="cal-grid card">
              {WEEKDAYS.map((d) => (
                <div key={d} className="cal-weekday">
                  {d}
                </div>
              ))}
              {days.map((day) => (
                <DayCell key={day.toISOString()} day={day} month={month} tasks={byDay.get(toDayKey(day)) ?? []} colorOf={colorOf} props={props} />
              ))}
            </div>
            <NoDateTray tasks={noDate} colorOf={colorOf} props={props} />
          </div>
          <DragOverlay dropAnimation={null}>
            {activeTask && (
              <div className={`${chipClass(activeTask, todayKey(), false)} is-overlay`} style={{ ['--chip-color' as string]: colorOf(activeTask) }}>
                <span className="cal-chip-dot" style={{ background: STATUS_META[activeTask.status].color }} />
                <span className="truncate">{activeTask.title}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
