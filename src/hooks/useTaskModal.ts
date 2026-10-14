import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { TaskInput } from '../../shared/types';
import { useUi } from '../store/ui';

/** The open task lives in the URL (?task=<id> or ?task=new) so it can be linked and closed with "back". */
export function useTaskModal() {
  const [params, setParams] = useSearchParams();
  const openId = params.get('task');

  const openTask = useCallback(
    (id: string) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('task', id);
        return next;
      });
    },
    [setParams],
  );

  const openNewTask = useCallback(
    (defaults: Partial<TaskInput> = {}) => {
      useUi.getState().setNewTaskDefaults(defaults);
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('task', 'new');
        return next;
      });
    },
    [setParams],
  );

  const closeTask = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('task');
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  return { openId, openTask, openNewTask, closeTask };
}
