import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SearchX } from 'lucide-react';
import type { Task, TaskInput } from '../../../shared/types';
import { VIEW_ORDER, type SortKey, type ViewMode } from '../../lib/constants';
import { applyFilters, sortTasks } from '../../lib/filters';
import { usePrefs, useUi } from '../../store/ui';
import { useFilters } from '../../hooks/useFilters';
import { useTaskModal } from '../../hooks/useTaskModal';
import { EmptyState } from '../ui/EmptyState';
import { BulkBar } from './BulkBar';
import { CalendarView } from './CalendarView';
import { KanbanBoard } from './KanbanBoard';
import { ListView } from './ListView';
import { Toolbar } from './Toolbar';
import type { TaskViewProps } from './types';

interface WorkspaceProps {
  pageKey: string;
  tasks: Task[];
  defaults?: Partial<TaskInput>;
  emptyState: ReactNode;
  hideClientFilter?: boolean;
  hideProjectFilter?: boolean;
  archivedMode?: boolean;
  views?: ViewMode[];
  header?: ReactNode;
}

/** Toolbar + Kanban/List/Calendar for a set of tasks (all, mine, a client, a project, onboarding...). */
export function TasksWorkspace({
  pageKey,
  tasks,
  defaults = {},
  emptyState,
  hideClientFilter,
  hideProjectFilter,
  archivedMode,
  views = VIEW_ORDER,
  header,
}: WorkspaceProps) {
  const { filters, update, clear } = useFilters();
  const { openId, openTask, openNewTask } = useTaskModal();
  const storedView = usePrefs((s) => s.views[pageKey]);
  const setStoredView = usePrefs((s) => s.setView);
  const view: ViewMode = storedView && views.includes(storedView) ? storedView : views[0];
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const defaultsKey = JSON.stringify(defaults);
  useEffect(() => {
    useUi.setState({ pageTaskDefaults: JSON.parse(defaultsKey) });
    return () => useUi.setState({ pageTaskDefaults: {} });
  }, [defaultsKey]);

  const visible = useMemo(() => sortTasks(applyFilters(tasks, filters), filters.sort, filters.dir), [tasks, filters]);

  // Selection only keeps tasks that are still visible.
  const visibleChecked = useMemo(() => {
    const ids = new Set(visible.map((t) => t.id));
    return new Set([...checked].filter((id) => ids.has(id)));
  }, [checked, visible]);

  const onToggleCheck = useCallback((id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onSetChecked = useCallback((ids: string[]) => setChecked(new Set(ids)), []);
  const onCreate = useCallback((extra: Partial<TaskInput>) => openNewTask({ ...JSON.parse(defaultsKey), ...extra }), [openNewTask, defaultsKey]);
  const onSort = useCallback((sort: SortKey, dir: 'asc' | 'desc') => update({ sort, dir }), [update]);

  const viewProps: TaskViewProps = {
    tasks: visible,
    sort: filters.sort,
    dir: filters.dir,
    visibleStatuses: filters.statuses,
    selectedId: openId,
    checked: visibleChecked,
    onToggleCheck,
    onSetChecked,
    onOpen: openTask,
    onCreate,
    onSort,
  };

  const hasTasks = tasks.length > 0;
  const noResults = hasTasks && visible.length === 0 && view !== 'calendar';

  return (
    <div className={`workspace view-${view}`}>
      {header}
      {hasTasks && (
        <Toolbar
          filters={filters}
          update={update}
          clear={clear}
          view={view}
          setView={(v) => setStoredView(pageKey, v)}
          views={views}
          hideClientFilter={hideClientFilter}
          hideProjectFilter={hideProjectFilter}
          total={tasks.length}
          shown={visible.length}
        />
      )}
      <div className="workspace-body">
        {!hasTasks ? (
          emptyState
        ) : noResults ? (
          <EmptyState
            icon={<SearchX size={26} />}
            title="Nenhuma tarefa encontrada"
            description="Nenhuma tarefa corresponde à busca e aos filtros aplicados."
            actions={
              <button type="button" className="btn btn-secondary" onClick={clear}>
                Limpar filtros
              </button>
            }
          />
        ) : view === 'kanban' ? (
          <KanbanBoard {...viewProps} />
        ) : view === 'list' ? (
          <ListView {...viewProps} />
        ) : (
          <CalendarView {...viewProps} />
        )}
      </div>
      {visibleChecked.size > 0 && <BulkBar ids={[...visibleChecked]} onClear={() => setChecked(new Set())} archivedMode={archivedMode} />}
    </div>
  );
}
