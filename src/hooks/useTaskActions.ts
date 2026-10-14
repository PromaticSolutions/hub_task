import { useCallback } from 'react';
import type { Task } from '../../shared/types';
import { errorMessage } from '../lib/api';
import { useData } from '../store/data';
import { confirmAction, toast } from '../store/ui';
import { useTaskModal } from './useTaskModal';

/** Duplicate / archive / delete with feedback, shared by cards, list rows and the task modal. */
export function useTaskActions() {
  const duplicateTask = useData((s) => s.duplicateTask);
  const updateTask = useData((s) => s.updateTask);
  const deleteTask = useData((s) => s.deleteTask);
  const { openTask } = useTaskModal();

  const duplicate = useCallback(
    async (task: Task) => {
      try {
        const copy = await duplicateTask(task.id);
        toast.success(`Tarefa duplicada como #${copy.number}.`, { label: 'Abrir', run: () => openTask(copy.id) });
        return copy;
      } catch (err) {
        toast.error(`Não foi possível duplicar: ${errorMessage(err)}`);
        return null;
      }
    },
    [duplicateTask, openTask],
  );

  const setArchived = useCallback(
    async (task: Task, archived: boolean) => {
      try {
        await updateTask(task.id, { archived });
        toast.success(archived ? 'Tarefa arquivada.' : 'Tarefa restaurada.', {
          label: 'Desfazer',
          run: () => {
            updateTask(task.id, { archived: !archived }).catch((err) => toast.error(errorMessage(err)));
          },
        });
        return true;
      } catch (err) {
        toast.error(errorMessage(err));
        return false;
      }
    },
    [updateTask],
  );

  const remove = useCallback(
    async (task: Task) => {
      const ok = await confirmAction({
        title: 'Excluir tarefa?',
        message: `"${task.title}" será excluída permanentemente, junto com ${task.comments.length} comentário(s) e ${task.attachments.length} anexo(s). Esta ação não pode ser desfeita. Se quiser apenas tirá-la do quadro, prefira arquivar.`,
        confirmLabel: 'Excluir tarefa',
      });
      if (!ok) return false;
      try {
        await deleteTask(task.id);
        toast.success('Tarefa excluída.');
        return true;
      } catch (err) {
        toast.error(`Não foi possível excluir: ${errorMessage(err)}`);
        return false;
      }
    },
    [deleteTask],
  );

  return { duplicate, setArchived, remove };
}
