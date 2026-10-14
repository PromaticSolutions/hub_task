import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Folder, Rocket } from 'lucide-react';
import { PROJECT_STATUSES, type ClientInput, type MemberInput, type ProjectInput } from '../../../shared/types';
import { PALETTE, PRIORITY_META, PROJECT_STATUS_META } from '../../lib/constants';
import { errorMessage } from '../../lib/api';
import { addDaysKey, formatDay, todayKey } from '../../lib/dates';
import { readableOn, initials } from '../../lib/color';
import { useData } from '../../store/data';
import { toast, useUi, usePrefs } from '../../store/ui';
import { ColorPicker } from '../ui/ColorPicker';
import { Modal } from '../ui/Modal';
import { SelectPicker, clientOptions, memberOptions } from '../ui/Pickers';

function pickColor(used: string[]) {
  const free = PALETTE.filter((c) => !used.includes(c));
  const pool = free.length ? free : PALETTE;
  return pool[Math.floor(Math.random() * pool.length)];
}

const isEmail = (v: string) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function ClientFormModal() {
  const form = useUi((s) => s.clientForm);
  const close = useUi((s) => s.closeForms);
  const clients = useData((s) => s.clients);
  const saveClient = useData((s) => s.saveClient);
  const navigate = useNavigate();
  const editing = form?.client ?? null;
  const [values, setValues] = useState<ClientInput>({ name: '', color: PALETTE[0], contactName: '', email: '', phone: '', notes: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof ClientInput, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!form) return;
    setErrors({});
    setValues(
      form.client
        ? {
            name: form.client.name,
            color: form.client.color,
            contactName: form.client.contactName,
            email: form.client.email,
            phone: form.client.phone,
            notes: form.client.notes,
          }
        : { name: '', color: pickColor(clients.map((c) => c.color)), contactName: '', email: '', phone: '', notes: '' },
    );
  }, [form]);

  const set = <K extends keyof ClientInput>(k: K, v: ClientInput[K]) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!values.name.trim()) errs.name = 'Informe o nome do cliente.';
    else if (clients.some((c) => c.id !== editing?.id && c.name.trim().toLowerCase() === values.name.trim().toLowerCase()))
      errs.name = 'Já existe um cliente com esse nome.';
    if (!isEmail(values.email.trim())) errs.email = 'E-mail inválido.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const saved = await saveClient({ ...values, name: values.name.trim(), email: values.email.trim() }, editing?.id);
      toast.success(
        editing ? 'Cliente atualizado.' : `Cliente "${saved.name}" cadastrado.`,
        editing ? undefined : { label: 'Ver tarefas', run: () => navigate(`/clients/${saved.id}`) },
      );
      close();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!form}
      onClose={close}
      title={editing ? 'Editar cliente' : 'Novo cliente'}
      subtitle={editing ? editing.name : 'Cadastre um cliente para organizar as tarefas por conta.'}
      size="md"
      footer={
        <div className="form-footer">
          <button type="button" className="btn btn-secondary" onClick={close}>
            Cancelar
          </button>
          <button type="submit" form="client-form" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner" /> : <Check size={16} />}
            {editing ? 'Salvar cliente' : 'Cadastrar cliente'}
          </button>
        </div>
      }
    >
      <form id="client-form" className="form-grid" onSubmit={submit} noValidate>
        <div className="form-preview" style={{ ['--chip-color' as string]: values.color }}>
          <span className="form-preview-swatch" style={{ background: values.color, color: readableOn(values.color) }}>
            {initials(values.name || 'Cliente')}
          </span>
          <div>
            <strong>{values.name || 'Nome do cliente'}</strong>
            <span className="muted">{values.contactName || 'Contato principal'}</span>
          </div>
        </div>
        <label className="field span-2">
          <span className="field-label">Nome *</span>
          <input className="input" value={values.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} maxLength={100} data-autofocus placeholder="Ex.: Padaria Pão Dourado" />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </label>
        <div className="field span-2">
          <span className="field-label">Cor de identificação</span>
          <ColorPicker value={values.color} onChange={(c) => set('color', c ?? PALETTE[0])} />
        </div>
        <label className="field">
          <span className="field-label">Contato principal</span>
          <input className="input" value={values.contactName} onChange={(e) => set('contactName', e.target.value)} maxLength={100} placeholder="Nome da pessoa" />
        </label>
        <label className="field">
          <span className="field-label">Telefone</span>
          <input className="input" value={values.phone} onChange={(e) => set('phone', e.target.value)} maxLength={40} placeholder="(00) 00000-0000" inputMode="tel" />
        </label>
        <label className="field span-2">
          <span className="field-label">E-mail</span>
          <input className="input" type="email" value={values.email} onChange={(e) => set('email', e.target.value)} aria-invalid={!!errors.email} placeholder="contato@cliente.com" />
          {errors.email && <span className="field-error">{errors.email}</span>}
        </label>
        <label className="field span-2">
          <span className="field-label">Observações</span>
          <textarea className="textarea" value={values.notes} onChange={(e) => set('notes', e.target.value)} rows={3} maxLength={2000} placeholder="Informações úteis sobre o cliente" />
        </label>
      </form>
    </Modal>
  );
}

export function ProjectFormModal() {
  const form = useUi((s) => s.projectForm);
  const close = useUi((s) => s.closeForms);
  const projects = useData((s) => s.projects);
  const clients = useData((s) => s.clients);
  const saveProject = useData((s) => s.saveProject);
  const navigate = useNavigate();
  const editing = form?.project ?? null;
  const [values, setValues] = useState<ProjectInput>({ name: '', color: PALETTE[0], description: '', clientId: null, status: 'active' });
  const [errors, setErrors] = useState<Partial<Record<keyof ProjectInput, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!form) return;
    setErrors({});
    setValues(
      form.project
        ? {
            name: form.project.name,
            color: form.project.color,
            description: form.project.description,
            clientId: form.project.clientId,
            status: form.project.status,
          }
        : { name: '', color: pickColor(projects.map((p) => p.color)), description: '', clientId: form.clientId, status: 'active' },
    );
  }, [form]);

  const clientOpts = useMemo(() => clientOptions(clients), [clients]);
  const client = clients.find((c) => c.id === values.clientId);

  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!values.name.trim()) errs.name = 'Informe o nome do projeto.';
    else if (projects.some((p) => p.id !== editing?.id && p.name.trim().toLowerCase() === values.name.trim().toLowerCase()))
      errs.name = 'Já existe um projeto com esse nome.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const saved = await saveProject({ ...values, name: values.name.trim(), description: values.description.trim() }, editing?.id);
      toast.success(
        editing ? 'Projeto atualizado.' : `Projeto "${saved.name}" criado.`,
        editing ? undefined : { label: 'Abrir quadro', run: () => navigate(`/projects/${saved.id}`) },
      );
      close();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!form}
      onClose={close}
      title={editing ? 'Editar projeto' : 'Novo projeto'}
      subtitle={editing ? editing.name : 'Agrupe tarefas em um quadro próprio, com ou sem cliente.'}
      size="md"
      footer={
        <div className="form-footer">
          <button type="button" className="btn btn-secondary" onClick={close}>
            Cancelar
          </button>
          <button type="submit" form="project-form" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner" /> : <Check size={16} />}
            {editing ? 'Salvar projeto' : 'Criar projeto'}
          </button>
        </div>
      }
    >
      <form id="project-form" className="form-grid" onSubmit={submit} noValidate>
        <div className="form-preview" style={{ ['--chip-color' as string]: values.color }}>
          <span className="form-preview-swatch" style={{ background: values.color, color: readableOn(values.color) }}>
            <Folder size={20} />
          </span>
          <div>
            <strong>{values.name || 'Nome do projeto'}</strong>
            <span className="muted">{client ? client.name : 'Sem cliente'}</span>
          </div>
        </div>
        <label className="field span-2">
          <span className="field-label">Nome *</span>
          <input className="input" value={values.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} maxLength={100} data-autofocus placeholder="Ex.: Site institucional" />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </label>
        <div className="field span-2">
          <span className="field-label">Cor de identificação</span>
          <ColorPicker value={values.color} onChange={(c) => set('color', c ?? PALETTE[0])} />
        </div>
        <div className="field">
          <span className="field-label">Cliente</span>
          <SelectPicker value={values.clientId} onChange={(v) => set('clientId', v)} options={clientOpts} placeholder="Sem cliente" nullable nullLabel="Sem cliente" ariaLabel="Cliente do projeto" />
        </div>
        <div className="field">
          <span className="field-label">Situação</span>
          <div className="segmented full" role="radiogroup" aria-label="Situação do projeto">
            {PROJECT_STATUSES.map((st) => (
              <button key={st} type="button" role="radio" aria-checked={values.status === st} className={values.status === st ? 'active' : ''} onClick={() => set('status', st)}>
                {PROJECT_STATUS_META[st].label}
              </button>
            ))}
          </div>
        </div>
        <label className="field span-2">
          <span className="field-label">Descrição</span>
          <textarea className="textarea" value={values.description} onChange={(e) => set('description', e.target.value)} rows={3} maxLength={2000} placeholder="Objetivo, escopo, links importantes..." />
        </label>
        {values.status === 'done' && <p className="field-hint span-2">Projetos concluídos saem do menu lateral, mas continuam em Projetos → Concluídos.</p>}
      </form>
    </Modal>
  );
}

export function MemberFormModal() {
  const form = useUi((s) => s.memberForm);
  const close = useUi((s) => s.closeForms);
  const members = useData((s) => s.members);
  const saveMember = useData((s) => s.saveMember);
  const currentUserId = usePrefs((s) => s.currentUserId);
  const setCurrentUser = usePrefs((s) => s.setCurrentUser);
  const editing = form?.member ?? null;
  const [values, setValues] = useState<MemberInput>({ name: '', email: '', role: '', color: PALETTE[0] });
  const [errors, setErrors] = useState<Partial<Record<keyof MemberInput, string>>>({});
  const [saving, setSaving] = useState(false);
  const [makeMe, setMakeMe] = useState(false);

  useEffect(() => {
    if (!form) return;
    setErrors({});
    setMakeMe(false);
    setValues(
      form.member
        ? { name: form.member.name, email: form.member.email, role: form.member.role, color: form.member.color }
        : { name: '', email: '', role: '', color: pickColor(members.map((m) => m.color)) },
    );
  }, [form]);

  const identityMissing = !members.some((m) => m.id === currentUserId);

  const set = <K extends keyof MemberInput>(k: K, v: MemberInput[K]) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!values.name.trim()) errs.name = 'Informe o nome.';
    else if (members.some((m) => m.id !== editing?.id && m.name.trim().toLowerCase() === values.name.trim().toLowerCase()))
      errs.name = 'Já existe um membro com esse nome.';
    if (!isEmail(values.email.trim())) errs.email = 'E-mail inválido.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const saved = await saveMember({ ...values, name: values.name.trim(), email: values.email.trim(), role: values.role.trim() }, editing?.id);
      if (makeMe) setCurrentUser(saved.id);
      toast.success(editing ? 'Membro atualizado.' : `${saved.name} entrou para a equipe.`);
      close();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!form}
      onClose={close}
      title={editing ? 'Editar membro' : 'Novo membro'}
      subtitle={editing ? editing.name : 'Adicione uma pessoa da equipe para atribuir e mencionar em tarefas.'}
      size="md"
      footer={
        <div className="form-footer">
          <button type="button" className="btn btn-secondary" onClick={close}>
            Cancelar
          </button>
          <button type="submit" form="member-form" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner" /> : <Check size={16} />}
            {editing ? 'Salvar membro' : 'Adicionar membro'}
          </button>
        </div>
      }
    >
      <form id="member-form" className="form-grid" onSubmit={submit} noValidate>
        <div className="form-preview">
          <span className="avatar lg" style={{ background: values.color, color: readableOn(values.color) }}>
            {initials(values.name || 'Novo membro')}
          </span>
          <div>
            <strong>{values.name || 'Nome do membro'}</strong>
            <span className="muted">{values.role || 'Função'}</span>
          </div>
        </div>
        <label className="field span-2">
          <span className="field-label">Nome *</span>
          <input className="input" value={values.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} maxLength={80} data-autofocus placeholder="Nome e sobrenome" />
          {errors.name && <span className="field-error">{errors.name}</span>}
          <span className="field-hint">É o nome usado nas @menções.</span>
        </label>
        <label className="field">
          <span className="field-label">Função</span>
          <input className="input" value={values.role} onChange={(e) => set('role', e.target.value)} maxLength={80} placeholder="Ex.: Designer" />
        </label>
        <label className="field">
          <span className="field-label">E-mail</span>
          <input className="input" type="email" value={values.email} onChange={(e) => set('email', e.target.value)} aria-invalid={!!errors.email} placeholder="nome@empresa.com" />
          {errors.email && <span className="field-error">{errors.email}</span>}
        </label>
        <div className="field span-2">
          <span className="field-label">Cor do avatar</span>
          <ColorPicker value={values.color} onChange={(c) => set('color', c ?? PALETTE[0])} />
        </div>
        {!editing && identityMissing && (
          <label className="switch span-2">
            <input type="checkbox" checked={makeMe} onChange={(e) => setMakeMe(e.target.checked)} />
            Sou eu — usar este perfil neste navegador
          </label>
        )}
      </form>
    </Modal>
  );
}

export function OnboardingFormModal() {
  const form = useUi((s) => s.onboardingForm);
  const close = useUi((s) => s.closeForms);
  const clients = useData((s) => s.clients);
  const members = useData((s) => s.members);
  const template = useData((s) => s.settings.onboardingTemplate);
  const startOnboarding = useData((s) => s.startOnboarding);
  const navigate = useNavigate();
  const [clientId, setClientId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(todayKey());
  const [stepIds, setStepIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!form) return;
    setClientId(form.clientId);
    setAssigneeId(usePrefs.getState().currentUserId && members.some((m) => m.id === usePrefs.getState().currentUserId) ? usePrefs.getState().currentUserId : null);
    setStartDate(todayKey());
    setStepIds(template.map((s) => s.id));
    setError(null);
  }, [form]);

  const clientOpts = useMemo(() => clientOptions(clients), [clients]);
  const memberOpts = useMemo(() => memberOptions(members), [members]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clientId) return setError('Selecione o cliente.');
    if (!stepIds.length) return setError('Selecione pelo menos uma etapa.');
    if (!startDate) return setError('Informe a data de início.');
    setSaving(true);
    try {
      const created = await startOnboarding(clientId, { assigneeId, startDate, stepIds });
      toast.success(`Onboarding iniciado com ${created.length} etapa(s).`);
      close();
      navigate('/onboarding');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id: string) => setStepIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <Modal
      open={!!form}
      onClose={close}
      title="Iniciar onboarding de cliente"
      subtitle="Cria as etapas do modelo de onboarding como tarefas, com prazos calculados a partir da data de início."
      size="lg"
      footer={
        <div className="form-footer">
          <button type="button" className="btn btn-secondary" onClick={close}>
            Cancelar
          </button>
          <button type="submit" form="onboarding-form" className="btn btn-primary" disabled={saving || !template.length}>
            {saving ? <span className="spinner" /> : <Rocket size={16} />}
            Criar {stepIds.length} tarefa{stepIds.length === 1 ? '' : 's'}
          </button>
        </div>
      }
    >
      <form id="onboarding-form" className="form-grid" onSubmit={submit} noValidate>
        <div className="field span-2">
          <span className="field-label">Cliente *</span>
          <SelectPicker value={clientId} onChange={(v) => { setClientId(v); setError(null); }} options={clientOpts} placeholder="Selecione o cliente" ariaLabel="Cliente" />
          {!clients.length && <span className="field-hint">Cadastre um cliente antes de iniciar um onboarding.</span>}
        </div>
        <div className="field">
          <span className="field-label">Responsável pelas etapas</span>
          <SelectPicker value={assigneeId} onChange={setAssigneeId} options={memberOpts} placeholder="Sem responsável" nullable nullLabel="Sem responsável" ariaLabel="Responsável" />
        </div>
        <label className="field">
          <span className="field-label">Data de início *</span>
          <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <div className="field span-2">
          <span className="field-label">
            Etapas ({stepIds.length}/{template.length})
          </span>
          {!template.length ? (
            <p className="field-hint">O modelo de onboarding está vazio. Adicione etapas em Configurações.</p>
          ) : (
            <ul className="step-pick">
              {template.map((s) => (
                <li key={s.id}>
                  <label className={stepIds.includes(s.id) ? 'on' : ''}>
                    <input type="checkbox" className="checkbox" checked={stepIds.includes(s.id)} onChange={() => toggle(s.id)} />
                    <span className="step-pick-title">{s.title}</span>
                    <span className={`badge prio-${s.priority}`}>{PRIORITY_META[s.priority].label}</span>
                    <span className="step-pick-date muted">{startDate ? formatDay(addDaysKey(startDate, s.offsetDays), "d 'de' MMM") : `+${s.offsetDays}d`}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && <p className="field-error span-2">{error}</p>}
      </form>
    </Modal>
  );
}
