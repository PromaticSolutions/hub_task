import { useEffect } from 'react';
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { CloudOff, Compass, RefreshCw } from 'lucide-react';
import { setActor } from './lib/api';
import { useData } from './store/data';
import { usePrefs, useUi } from './store/ui';
import { useCurrentUser } from './hooks/useLookups';
import { usePageHeader } from './hooks/usePageHeader';
import { useTaskModal } from './hooks/useTaskModal';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { TaskModalHost } from './components/task-modal/TaskModal';
import { ClientFormModal, MemberFormModal, OnboardingFormModal } from './components/forms/EntityForms';
import { ConfirmDialog, Toasts } from './components/ui/Overlays';
import { EmptyState } from './components/ui/EmptyState';
import { AllTasksPage, ArchivedPage, ClientTasksPage, MyTasksPage, PersonalPage } from './pages/TaskPages';
import { DashboardPage } from './pages/DashboardPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ClientsPage, TeamPage } from './pages/PeoplePages';
import { SettingsPage } from './pages/SettingsPage';

/** Applies the chosen theme (following the OS when set to "system"). */
function useThemeEffect() {
  const theme = usePrefs((s) => s.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme;
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

/** Picks up changes made by other people: polls a cheap version endpoint and refetches when it moves. */
function useBackgroundSync() {
  const status = useData((s) => s.status);
  useEffect(() => {
    if (status !== 'ready') return;
    const check = () => {
      if (document.visibilityState === 'visible') void useData.getState().checkForUpdates();
    };
    const timer = window.setInterval(check, 15_000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [status]);
}

function useGlobalShortcuts() {
  const { openNewTask } = useTaskModal();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal-root, .popover')) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openNewTask(useUi.getState().pageTaskDefaults);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openNewTask]);
}

function LoadingScreen() {
  return (
    <div className="app">
      <aside className="sidebar skeleton-sidebar" aria-hidden>
        <div className="sidebar-brand">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
          <div className="brand-text">
            <strong>Hub Task</strong>
            <span>Timely</span>
          </div>
        </div>
        <div className="skeleton-nav">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="skeleton" />
          ))}
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <div className="skeleton" style={{ width: 180, height: 22 }} />
        </div>
        <div className="content" aria-busy="true" aria-label="Carregando">
          <div className="skeleton-board">
            {Array.from({ length: 5 }, (_, c) => (
              <div key={c} className="skeleton-col">
                <div className="skeleton" style={{ height: 20, width: '60%' }} />
                {Array.from({ length: 3 - (c % 2) }, (_, i) => (
                  <div key={i} className="skeleton skeleton-card" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  const load = useData((s) => s.load);
  return (
    <div className="fatal">
      <EmptyState
        icon={<CloudOff size={28} />}
        title="Não foi possível carregar os dados"
        description={
          <>
            {message}
            <br />
            Inicie o servidor com <code>npm run dev</code> e tente novamente.
          </>
        }
        actions={
          <button type="button" className="btn btn-primary" onClick={() => load()}>
            <RefreshCw size={16} /> Tentar novamente
          </button>
        }
      />
    </div>
  );
}

function NotFound() {
  usePageHeader('Página não encontrada');
  return (
    <EmptyState
      icon={<Compass size={26} />}
      title="Página não encontrada"
      description="O endereço acessado não existe."
      actions={
        <Link to="/tasks" className="btn btn-primary">
          Ir para as tarefas
        </Link>
      }
    />
  );
}

function Layout() {
  const me = useCurrentUser();
  useEffect(() => setActor(me?.id ?? null), [me]);
  useBackgroundSync();
  useGlobalShortcuts();
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Topbar />
        <main className="content">
          <Outlet />
        </main>
      </div>
      <TaskModalHost />
      <ClientFormModal />
      <MemberFormModal />
      <OnboardingFormModal />
      <ConfirmDialog />
      <Toasts />
    </div>
  );
}

function Shell() {
  const status = useData((s) => s.status);
  const error = useData((s) => s.error);
  const load = useData((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);
  if (status === 'loading') return <LoadingScreen />;
  if (status === 'error') return <ErrorScreen message={error ?? 'Erro desconhecido.'} />;
  return <Layout />;
}

export function App() {
  useThemeEffect();
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Navigate to="/tasks" replace />} />
          <Route path="tasks" element={<AllTasksPage />} />
          <Route path="my-tasks" element={<MyTasksPage />} />
          <Route path="personal" element={<PersonalPage />} />
          <Route path="archived" element={<ArchivedPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/:clientId" element={<ClientTasksPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
