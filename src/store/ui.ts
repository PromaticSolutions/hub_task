import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Client, Member, Project, TaskInput } from '../../shared/types';
import type { ViewMode } from '../lib/constants';

export type ThemePref = 'light' | 'dark' | 'system';

interface PrefsState {
  theme: ThemePref;
  currentUserId: string | null;
  views: Record<string, ViewMode>;
  collapsed: Record<string, boolean>;
  /** Desktop only: the sidebar shrinks to an icon rail. */
  sidebarCollapsed: boolean;
  mentionsSeenAt: string | null;
  setTheme: (theme: ThemePref) => void;
  setCurrentUser: (id: string | null) => void;
  setView: (key: string, view: ViewMode) => void;
  toggleGroup: (key: string) => void;
  toggleSidebar: () => void;
  markMentionsSeen: () => void;
}

/** Per-browser preferences (theme, identity, chosen views, sidebar state). */
export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      theme: 'system',
      currentUserId: null,
      views: {},
      collapsed: {},
      sidebarCollapsed: false,
      mentionsSeenAt: null,
      setTheme: (theme) => set({ theme }),
      setCurrentUser: (currentUserId) => set({ currentUserId, mentionsSeenAt: new Date().toISOString() }),
      setView: (key, view) => set((s) => ({ views: { ...s.views, [key]: view } })),
      toggleGroup: (key) => set((s) => ({ collapsed: { ...s.collapsed, [key]: !s.collapsed[key] } })),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      markMentionsSeen: () => set({ mentionsSeenAt: new Date().toISOString() }),
    }),
    { name: 'htt-prefs', version: 1 },
  ),
);

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; run: () => void };
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
}

export interface PageHeader {
  title: string;
  subtitle?: string;
  color?: string;
}

interface UiState {
  header: PageHeader;
  sidebarOpen: boolean;
  toasts: Toast[];
  confirm: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  clientForm: { client: Client | null } | null;
  memberForm: { member: Member | null } | null;
  projectForm: { project: Project | null; clientId: string | null } | null;
  onboardingForm: { clientId: string | null } | null;
  newTaskDefaults: Partial<TaskInput>;
  /** Defaults the current page wants for tasks created from the top bar (e.g. its client). */
  pageTaskDefaults: Partial<TaskInput>;
  setSidebarOpen: (open: boolean) => void;
  pushToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  openClientForm: (client?: Client | null) => void;
  openMemberForm: (member?: Member | null) => void;
  /** Opens the project form to edit `project`, or to create one (optionally for a client). */
  openProjectForm: (project?: Project | null, clientId?: string | null) => void;
  openOnboardingForm: (clientId?: string | null) => void;
  closeForms: () => void;
  setNewTaskDefaults: (defaults: Partial<TaskInput>) => void;
}

let toastSeq = 0;

export const useUi = create<UiState>()((set, get) => ({
  header: { title: '' },
  sidebarOpen: false,
  toasts: [],
  confirm: null,
  clientForm: null,
  memberForm: null,
  projectForm: null,
  onboardingForm: null,
  newTaskDefaults: {},
  pageTaskDefaults: {},
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  pushToast: (toast) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...toast, id }] }));
    const ttl = toast.kind === 'error' ? 6500 : toast.action ? 6000 : 3800;
    window.setTimeout(() => get().dismissToast(id), ttl);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  openClientForm: (client = null) => set({ clientForm: { client } }),
  openMemberForm: (member = null) => set({ memberForm: { member } }),
  openProjectForm: (project = null, clientId = null) => set({ projectForm: { project, clientId } }),
  openOnboardingForm: (clientId = null) => set({ onboardingForm: { clientId } }),
  closeForms: () => set({ clientForm: null, memberForm: null, projectForm: null, onboardingForm: null }),
  setNewTaskDefaults: (newTaskDefaults) => set({ newTaskDefaults }),
}));

export const toast = {
  success: (message: string, action?: Toast['action']) => useUi.getState().pushToast({ kind: 'success', message, action }),
  error: (message: string) => useUi.getState().pushToast({ kind: 'error', message }),
  info: (message: string) => useUi.getState().pushToast({ kind: 'info', message }),
};

/** Promise-based confirmation dialog. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useUi.setState({ confirm: { ...options, resolve } });
  });
}
