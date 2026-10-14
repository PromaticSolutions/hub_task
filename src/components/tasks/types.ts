import type { Status, Task, TaskInput } from '../../../shared/types';
import type { SortKey } from '../../lib/constants';

/** Props shared by the Kanban, List and Calendar views. */
export interface TaskViewProps {
  tasks: Task[];
  sort: SortKey;
  dir: 'asc' | 'desc';
  visibleStatuses: Status[];
  selectedId: string | null;
  checked: Set<string>;
  onToggleCheck: (id: string) => void;
  onSetChecked: (ids: string[]) => void;
  onOpen: (id: string) => void;
  onCreate: (defaults: Partial<TaskInput>) => void;
  onSort: (sort: SortKey, dir: 'asc' | 'desc') => void;
}
