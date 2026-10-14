import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowDown, ArrowUp, Database, Download, Keyboard, Monitor, Moon, Palette, Plus, RotateCcw, Rocket, Save, Sun, Trash2, UserRoundCheck } from 'lucide-react';
import { PRIORITIES, type OnboardingStep, type Priority } from '../../shared/types';
import { PRIORITY_META } from '../lib/constants';
import { errorMessage } from '../lib/api';
import { useData } from '../store/data';
import { confirmAction, toast, usePrefs, type ThemePref } from '../store/ui';
import { usePageHeader } from '../hooks/usePageHeader';
import { IdentityPicker } from '../components/IdentityPicker';

function Section({ id, icon, title, description, children }: { id?: string; icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <section id={id} className="settings-section card">
      <header>
        <span className="settings-icon">{icon}</span>
        <div>
          <h2>{title}</h2>
          <p className="muted">{description}</p>
        </div>
      </header>
      <div className="settings-body">{children}</div>
    </section>
  );
}

const THEMES: { value: ThemePref; label: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Claro', icon: <Sun size={18} /> },
  { value: 'dark', label: 'Escuro', icon: <Moon size={18} /> },
  { value: 'system', label: 'Sistema', icon: <Monitor size={18} /> },
];

function TemplateEditor() {
  const template = useData((s) => s.settings.onboardingTemplate);
  const saveSettings = useData((s) => s.saveSettings);
  const settings = useData((s) => s.settings);
  const [steps, setSteps] = useState<OnboardingStep[]>(template);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(steps) !== JSON.stringify(template);

  useEffect(() => {
    // Only resync when the stored template changes, and never over unsaved edits.
    if (!dirty) setSteps(template);
  }, [template]);

  const update = (id: string, patch: Partial<OnboardingStep>) => setSteps((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const move = (index: number, delta: number) =>
    setSteps((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });

  const invalid = steps.some((s) => !s.title.trim());

  const save = async () => {
    if (invalid) {
      toast.error('Todas as etapas precisam de um título.');
      return;
    }
    setSaving(true);
    try {
      await saveSettings({ ...settings, onboardingTemplate: steps.map((s) => ({ ...s, title: s.title.trim() })) });
      toast.success('Modelo de onboarding salvo.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const removeStep = async (step: OnboardingStep) => {
    if (step.title.trim()) {
      const ok = await confirmAction({ title: 'Remover etapa?', message: `"${step.title}" será removida do modelo (tarefas já criadas não são afetadas).`, confirmLabel: 'Remover etapa' });
      if (!ok) return;
    }
    setSteps((list) => list.filter((s) => s.id !== step.id));
  };

  return (
    <div className="template-editor">
      {!steps.length && <p className="muted">Nenhuma etapa no modelo. Adicione a primeira abaixo.</p>}
      <ol className="template-steps">
        {steps.map((s, i) => (
          <li key={s.id} className="template-step">
            <span className="template-num">{i + 1}</span>
            <div className="template-fields">
              <input
                className="input"
                value={s.title}
                onChange={(e) => update(s.id, { title: e.target.value })}
                placeholder="Título da etapa"
                aria-label={`Título da etapa ${i + 1}`}
                aria-invalid={!s.title.trim()}
                maxLength={200}
              />
              <input
                className="input"
                value={s.description}
                onChange={(e) => update(s.id, { description: e.target.value })}
                placeholder="Descrição (opcional)"
                aria-label={`Descrição da etapa ${i + 1}`}
                maxLength={2000}
              />
              <div className="template-row">
                <label className="template-inline">
                  Prazo:
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={365}
                    value={s.offsetDays}
                    onChange={(e) => update(s.id, { offsetDays: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })}
                    aria-label={`Dias após o início, etapa ${i + 1}`}
                  />
                  dias após o início
                </label>
                <select className="select" value={s.priority} onChange={(e) => update(s.id, { priority: e.target.value as Priority })} aria-label={`Prioridade da etapa ${i + 1}`}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      Prioridade {PRIORITY_META[p].label.toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="template-actions">
              <button type="button" className="icon-btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Mover para cima">
                <ArrowUp size={15} />
              </button>
              <button type="button" className="icon-btn sm" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label="Mover para baixo">
                <ArrowDown size={15} />
              </button>
              <button type="button" className="icon-btn sm danger" onClick={() => removeStep(s)} aria-label="Remover etapa">
                <Trash2 size={15} />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="template-footer">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            setSteps((list) => [
              ...list,
              { id: crypto.randomUUID(), title: '', description: '', offsetDays: list.length ? list[list.length - 1].offsetDays + 1 : 0, priority: 'medium' },
            ])
          }
          disabled={steps.length >= 50}
        >
          <Plus size={16} /> Adicionar etapa
        </button>
        <div className="toolbar-spacer" />
        {dirty && (
          <button type="button" className="btn btn-ghost" onClick={() => setSteps(template)} disabled={saving}>
            <RotateCcw size={15} /> Desfazer
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
          {saving ? <span className="spinner" /> : <Save size={16} />} Salvar modelo
        </button>
      </div>
    </div>
  );
}

export function SettingsPage() {
  usePageHeader('Configurações', { subtitle: 'Preferências, identidade e dados' });
  const theme = usePrefs((s) => s.theme);
  const setTheme = usePrefs((s) => s.setTheme);
  const members = useData((s) => s.members);
  const clients = useData((s) => s.clients);
  const projects = useData((s) => s.projects);
  const tasks = useData((s) => s.tasks);
  const loadSampleData = useData((s) => s.loadSampleData);
  const location = useLocation();
  const [loadingSample, setLoadingSample] = useState(false);
  const empty = !members.length && !clients.length && !projects.length && !tasks.length;

  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('flash');
      const t = window.setTimeout(() => el.classList.remove('flash'), 1600);
      return () => window.clearTimeout(t);
    }
  }, [location.hash]);

  const counts = useMemo(
    () => ({
      active: tasks.filter((t) => !t.archived).length,
      archived: tasks.filter((t) => t.archived).length,
      attachments: tasks.reduce((n, t) => n + t.attachments.length, 0),
      comments: tasks.reduce((n, t) => n + t.comments.length, 0),
    }),
    [tasks],
  );

  return (
    <div className="page settings">
      <Section id="identidade" icon={<UserRoundCheck size={18} />} title="Quem é você?" description="Sem login nesta versão: escolha seu usuário neste navegador. Ele é usado em Minhas Tarefas, Pessoais, comentários, menções e no histórico.">
        <IdentityPicker />
      </Section>

      <Section icon={<Palette size={18} />} title="Aparência" description="O tema fica salvo neste navegador.">
        <div className="theme-options" role="radiogroup" aria-label="Tema">
          {THEMES.map((t) => (
            <button key={t.value} type="button" role="radio" aria-checked={theme === t.value} className={`theme-option theme-${t.value}${theme === t.value ? ' active' : ''}`} onClick={() => setTheme(t.value)}>
              <span className="theme-preview" aria-hidden>
                <span />
                <span />
                <span />
              </span>
              <span className="theme-label">
                {t.icon} {t.label}
              </span>
            </button>
          ))}
        </div>
      </Section>

      <Section icon={<Rocket size={18} />} title="Modelo de onboarding" description="Etapas criadas como tarefas ao iniciar o onboarding de um cliente. O prazo de cada etapa é contado a partir da data de início.">
        <TemplateEditor />
      </Section>

      <Section icon={<Database size={18} />} title="Dados" description="Os dados ficam no servidor da aplicação, compartilhados por toda a equipe.">
        <dl className="data-stats">
          <div><dt>Tarefas ativas</dt><dd>{counts.active}</dd></div>
          <div><dt>Arquivadas</dt><dd>{counts.archived}</dd></div>
          <div><dt>Projetos</dt><dd>{projects.length}</dd></div>
          <div><dt>Clientes</dt><dd>{clients.length}</dd></div>
          <div><dt>Membros</dt><dd>{members.length}</dd></div>
          <div><dt>Comentários</dt><dd>{counts.comments}</dd></div>
          <div><dt>Anexos</dt><dd>{counts.attachments}</dd></div>
        </dl>
        <div className="settings-actions">
          <a className="btn btn-secondary" href="/api/export" download>
            <Download size={16} /> Exportar backup (JSON)
          </a>
          {empty && (
            <button
              type="button"
              className="btn btn-soft"
              disabled={loadingSample}
              onClick={async () => {
                setLoadingSample(true);
                try {
                  await loadSampleData();
                  toast.success('Dados de exemplo carregados.');
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setLoadingSample(false);
                }
              }}
            >
              {loadingSample ? <span className="spinner" /> : <Database size={16} />} Carregar dados de exemplo
            </button>
          )}
        </div>
        <p className="field-hint">O backup inclui tarefas, clientes, membros e configurações. Os arquivos anexados ficam na pasta <code>data/uploads</code> do servidor.</p>
      </Section>

      <Section icon={<Keyboard size={18} />} title="Atalhos de teclado" description="Para agilizar o dia a dia.">
        <ul className="shortcuts">
          <li><span className="kbd">N</span> Nova tarefa</li>
          <li><span className="kbd">/</span> Buscar tarefas</li>
          <li><span className="kbd">V</span> Alternar visualização</li>
          <li><span className="kbd">Ctrl</span> + <span className="kbd">S</span> Salvar tarefa aberta</li>
          <li><span className="kbd">Ctrl</span> + <span className="kbd">Enter</span> Enviar comentário</li>
          <li><span className="kbd">Ctrl</span> + clique Selecionar vários cards</li>
          <li><span className="kbd">Espaço</span> Pegar/soltar card com o teclado</li>
          <li><span className="kbd">Esc</span> Fechar janelas</li>
        </ul>
      </Section>
    </div>
  );
}
