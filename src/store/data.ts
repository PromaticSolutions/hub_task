import { create } from 'zustand';
import type {
  BulkAction,
  Client,
  ClientInput,
  Member,
  MemberInput,
  Settings,
  Snapshot,
  Task,
  TaskInput,
  TaskPatch,
} from '../../shared/types';
import { request, uploadAttachment, type ApiResult } from '../lib/api';

interface DataState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  version: number;
  members: Member[];
  clients: Client[];
  tasks: Task[];
  settings: Settings;
  pending: number;
  needsRefresh: boolean;

  load: () => Promise<void>;
  refresh: () => Promise<void>;
  checkForUpdates: () => Promise<void>;

  createTask: (input: TaskInput) => Promise<Task>;
  updateTask: (id: string, patch: TaskPatch) => Promise<Task>;
  duplicateTask: (id: string) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  bulk: (ids: string[], action: BulkAction) => Promise<void>;
  addComment: (taskId: string, body: string) => Promise<void>;
  deleteComment: (taskId: string, commentId: string) => Promise<void>;
  uploadAttachments: (taskId: string, files: File[], onProgress?: (r: number) => void) => Promise<void>;
  deleteAttachment: (taskId: string, attachmentId: string) => Promise<void>;

  saveMember: (input: MemberInput, id?: string) => Promise<Member>;
  deleteMember: (id: string) => Promise<void>;
  saveClient: (input: ClientInput, id?: string) => Promise<Client>;
  deleteClient: (id: string) => Promise<void>;
  startOnboarding: (clientId: string, body: { assigneeId: string | null; startDate: string; stepIds: string[] }) => Promise<Task[]>;
  saveSettings: (settings: Settings) => Promise<void>;
  loadSampleData: () => Promise<void>;
}

/** Mirrors the server rules locally so optimistic updates look right before the response arrives. */
function optimisticPatch(task: Task, patch: TaskPatch): Task {
  const next: Task = { ...task };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (next as unknown as Record<string, unknown>)[key] = value;
  }
  if (patch.status && patch.status !== task.status) {
    next.completedAt = patch.status === 'done' ? new Date().toISOString() : null;
  }
  if (patch.archived !== undefined) next.archivedAt = patch.archived ? new Date().toISOString() : null;
  if (patch.assigneeId) next.participantIds = next.participantIds.filter((id) => id !== patch.assigneeId);
  return next;
}

export const useData = create<DataState>()((set, get) => {
  const applySnapshot = (s: Snapshot) =>
    set({
      status: 'ready',
      error: null,
      version: s.version,
      members: s.members,
      clients: s.clients,
      tasks: s.tasks,
      settings: s.settings,
    });

  const replaceTask = (task: Task) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === task.id ? task : t)) }));

  /** Runs a request, tracking the data version so changes made by other people trigger a refresh. */
  async function mutate<T>(fn: () => Promise<ApiResult<T>>): Promise<T> {
    set((s) => ({ pending: s.pending + 1 }));
    try {
      const res = await fn();
      if (res.version !== null) {
        const current = get().version;
        if (res.version === current + 1) set({ version: res.version });
        else if (res.version > current) set({ needsRefresh: true });
      }
      return res.data;
    } finally {
      set((s) => ({ pending: s.pending - 1 }));
      if (get().pending === 0 && get().needsRefresh) void get().refresh();
    }
  }

  return {
    status: 'loading',
    error: null,
    version: 0,
    members: [],
    clients: [],
    tasks: [],
    settings: { onboardingTemplate: [] },
    pending: 0,
    needsRefresh: false,

    load: async () => {
      set({ status: 'loading', error: null });
      try {
        const { data } = await request<Snapshot>('GET', '/snapshot');
        applySnapshot(data);
      } catch (err) {
        set({ status: 'error', error: err instanceof Error ? err.message : 'Falha ao carregar os dados.' });
      }
    },

    refresh: async () => {
      if (get().pending > 0) {
        set({ needsRefresh: true });
        return;
      }
      set({ needsRefresh: false });
      try {
        const { data } = await request<Snapshot>('GET', '/snapshot');
        if (get().pending === 0) applySnapshot(data);
        else set({ needsRefresh: true });
      } catch {
        /* keeps showing the last known data; the next check retries */
      }
    },

    checkForUpdates: async () => {
      if (get().status !== 'ready' || get().pending > 0) return;
      try {
        const { data } = await request<{ version: number }>('GET', '/version');
        if (data.version !== get().version) await get().refresh();
      } catch {
        /* offline: try again on the next tick */
      }
    },

    createTask: async (input) => {
      const task = await mutate(() => request<Task>('POST', '/tasks', input));
      set((s) => ({ tasks: [...s.tasks, task] }));
      return task;
    },

    updateTask: async (id, patch) => {
      const previous = get().tasks.find((t) => t.id === id);
      if (!previous) throw new Error('Tarefa não encontrada.');
      replaceTask(optimisticPatch(previous, patch));
      try {
        const task = await mutate(() => request<Task>('PATCH', `/tasks/${id}`, patch));
        replaceTask(task);
        return task;
      } catch (err) {
        replaceTask(previous);
        throw err;
      }
    },

    duplicateTask: async (id) => {
      const task = await mutate(() => request<Task>('POST', `/tasks/${id}/duplicate`));
      set((s) => ({ tasks: [...s.tasks, task] }));
      return task;
    },

    deleteTask: async (id) => {
      const previous = get().tasks;
      set({ tasks: previous.filter((t) => t.id !== id) });
      try {
        await mutate(() => request('DELETE', `/tasks/${id}`));
      } catch (err) {
        set({ tasks: previous });
        throw err;
      }
    },

    bulk: async (ids, action) => {
      const { tasks } = await mutate(() => request<{ tasks: Task[] }>('POST', '/tasks/bulk', { ids, action }));
      if (action.type === 'delete') {
        const gone = new Set(ids);
        set((s) => ({ tasks: s.tasks.filter((t) => !gone.has(t.id)) }));
      } else {
        const byId = new Map(tasks.map((t) => [t.id, t]));
        set((s) => ({ tasks: s.tasks.map((t) => byId.get(t.id) ?? t) }));
      }
    },

    addComment: async (taskId, body) => {
      replaceTask(await mutate(() => request<Task>('POST', `/tasks/${taskId}/comments`, { body })));
    },

    deleteComment: async (taskId, commentId) => {
      replaceTask(await mutate(() => request<Task>('DELETE', `/tasks/${taskId}/comments/${commentId}`)));
    },

    uploadAttachments: async (taskId, files, onProgress) => {
      const total = files.reduce((n, f) => n + f.size, 0) || 1;
      let done = 0;
      for (const file of files) {
        const task = await mutate(() =>
          uploadAttachment<Task>(taskId, file, (ratio) => onProgress?.((done + ratio * file.size) / total)),
        );
        replaceTask(task);
        done += file.size;
      }
    },

    deleteAttachment: async (taskId, attachmentId) => {
      replaceTask(await mutate(() => request<Task>('DELETE', `/tasks/${taskId}/attachments/${attachmentId}`)));
    },

    saveMember: async (input, id) => {
      const member = await mutate(() =>
        id ? request<Member>('PATCH', `/members/${id}`, input) : request<Member>('POST', '/members', input),
      );
      set((s) => ({
        members: id ? s.members.map((m) => (m.id === id ? member : m)) : [...s.members, member],
      }));
      return member;
    },

    deleteMember: async (id) => {
      await mutate(() => request('DELETE', `/members/${id}`));
      // The server also unassigns this member from tasks; reload to stay consistent.
      set((s) => ({ members: s.members.filter((m) => m.id !== id) }));
      await get().refresh();
    },

    saveClient: async (input, id) => {
      const client = await mutate(() =>
        id ? request<Client>('PATCH', `/clients/${id}`, input) : request<Client>('POST', '/clients', input),
      );
      set((s) => ({
        clients: id ? s.clients.map((c) => (c.id === id ? client : c)) : [...s.clients, client],
      }));
      return client;
    },

    deleteClient: async (id) => {
      await mutate(() => request('DELETE', `/clients/${id}`));
      set((s) => ({ clients: s.clients.filter((c) => c.id !== id) }));
      await get().refresh();
    },

    startOnboarding: async (clientId, body) => {
      const { tasks } = await mutate(() => request<{ tasks: Task[] }>('POST', `/clients/${clientId}/onboarding`, body));
      set((s) => ({ tasks: [...s.tasks, ...tasks] }));
      return tasks;
    },

    saveSettings: async (settings) => {
      const saved = await mutate(() => request<Settings>('PUT', '/settings', settings));
      set({ settings: saved });
    },

    loadSampleData: async () => {
      const snapshot = await mutate(() => request<Snapshot>('POST', '/sample-data'));
      applySnapshot(snapshot);
    },
  };
});
