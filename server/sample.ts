import { randomUUID } from 'node:crypto';
import { extractMentions, type Client, type Member, type Priority, type Project, type Status } from '../shared/types.js';
import { addHistory, createTask } from './domain.js';
import type { DbShape } from './store.js';

function day(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

/** Loads demonstration data. Only called when the database is completely empty. */
export function loadSampleData(db: DbShape) {
  const members: Member[] = [
    ['Ana Souza', 'ana@empresa.com', 'Gerente de projetos', '#166534'],
    ['Bruno Lima', 'bruno@empresa.com', 'Designer', '#7c3aed'],
    ['Carla Mendes', 'carla@empresa.com', 'Desenvolvedora', '#0369a1'],
    ['Diego Rocha', 'diego@empresa.com', 'Social media', '#c2410c'],
    ['Elisa Prado', 'elisa@empresa.com', 'Atendimento', '#be185d'],
  ].map(([name, email, role, color], i) => ({ id: randomUUID(), name, email, role, color, createdAt: daysAgo(60 - i) }));

  const clients: Client[] = [
    ['Padaria Pão Dourado', '#d97706', 'Marcos Oliveira', 'contato@paodourado.com'],
    ['Clínica Vida Plena', '#0891b2', 'Dra. Renata Alves', 'renata@vidaplena.com'],
    ['Studio Fit', '#7c3aed', 'Juliana Costa', 'juliana@studiofit.com'],
    ['Construtora Horizonte', '#dc2626', 'Paulo Henrique', 'paulo@horizonte.com'],
  ].map(([name, color, contactName, email], i) => ({
    id: randomUUID(),
    name,
    color,
    contactName,
    email,
    phone: '',
    notes: '',
    createdAt: daysAgo(45 - i * 5),
  }));

  db.members.push(...members);
  db.clients.push(...clients);

  const [ana, bruno, carla, diego, elisa] = members;
  const [padaria, clinica, studio, construtora] = clients;

  const projects: Project[] = (
    [
      ['Site da clínica', '#0891b2', clinica, 'Novo site institucional com agendamento online.'],
      ['Lançamento Residencial Horizonte', '#dc2626', construtora, 'Landing page, SEO e materiais do novo empreendimento.'],
      ['Redes sociais Studio Fit', '#7c3aed', studio, 'Conteúdo mensal e campanhas pagas.'],
    ] as const
  ).map(([name, color, client, description], i) => ({
    id: randomUUID(),
    name,
    color,
    description,
    clientId: client.id,
    status: 'active',
    createdAt: daysAgo(40 - i * 5),
  }));
  db.projects.push(...projects);
  const [siteClinica, lancamento, redes] = projects;

  type Seed = {
    title: string;
    description?: string;
    client: Client | null;
    assignee: Member | null;
    participants?: Member[];
    priority: Priority;
    status: Status;
    due: number | null;
    createdAgo: number;
    onboarding?: boolean;
    personal?: Member;
    project?: Project;
    comments?: [Member, string][];
  };

  const seeds: Seed[] = [
    { title: 'Criar cardápio digital', description: 'Cardápio responsivo com fotos dos produtos e link para o WhatsApp.', client: padaria, assignee: carla, participants: [bruno], priority: 'high', status: 'in_progress', due: 3, createdAgo: 8, comments: [[ana, '@Carla Mendes as fotos novas já estão na pasta compartilhada.']] },
    { title: 'Identidade visual de Natal', description: 'Peças para redes sociais e vitrine da loja.', client: padaria, assignee: bruno, priority: 'medium', status: 'todo', due: 12, createdAgo: 3 },
    { title: 'Aprovar layout do site', description: 'Aguardando retorno do cliente sobre as cores da página inicial.', client: clinica, project: siteClinica, assignee: elisa, participants: [bruno, carla], priority: 'urgent', status: 'blocked', due: -2, createdAgo: 14, comments: [[elisa, 'Cliente pediu mais uma semana para revisar. @Ana Souza podemos ajustar o cronograma?']] },
    { title: 'Agendamento online', description: 'Integração do formulário de agendamento com a agenda da clínica.', client: clinica, project: siteClinica, assignee: carla, priority: 'high', status: 'review', due: 1, createdAgo: 20 },
    { title: 'Calendário de posts de novembro', client: studio, project: redes, assignee: diego, participants: [bruno], priority: 'medium', status: 'in_progress', due: 5, createdAgo: 6 },
    { title: 'Relatório mensal de métricas', description: 'Consolidar alcance, engajamento e conversões do mês anterior.', client: studio, project: redes, assignee: diego, priority: 'low', status: 'done', due: -5, createdAgo: 18 },
    { title: 'Landing page do novo empreendimento', client: construtora, project: lancamento, assignee: carla, participants: [bruno, ana], priority: 'urgent', status: 'todo', due: -1, createdAgo: 10 },
    { title: 'Fotos da obra para o portfólio', client: construtora, assignee: bruno, priority: 'low', status: 'done', due: -8, createdAgo: 25 },
    { title: 'Revisar contrato de manutenção', client: clinica, assignee: ana, priority: 'medium', status: 'review', due: 6, createdAgo: 4 },
    { title: 'Campanha de matrículas', description: 'Anúncios patrocinados para o público da região.', client: studio, project: redes, assignee: diego, participants: [elisa], priority: 'high', status: 'todo', due: 9, createdAgo: 2 },
    { title: 'Ajustar SEO do site institucional', client: construtora, project: lancamento, assignee: null, priority: 'medium', status: 'todo', due: null, createdAgo: 1 },
    { title: 'Reunião de kickoff', description: 'Alinhar objetivos, expectativas e pontos de contato com o cliente.', client: construtora, assignee: elisa, priority: 'high', status: 'done', due: -12, createdAgo: 30, onboarding: true },
    { title: 'Coletar acessos e materiais', description: 'Solicitar logins, identidade visual, documentos e referências.', client: construtora, assignee: elisa, priority: 'high', status: 'in_progress', due: -4, createdAgo: 30, onboarding: true },
    { title: 'Definir cronograma de entregas', client: construtora, assignee: ana, priority: 'medium', status: 'todo', due: 2, createdAgo: 30, onboarding: true },
    { title: 'Organizar pauta da reunião semanal', client: null, assignee: ana, priority: 'low', status: 'todo', due: 1, createdAgo: 1, personal: ana },
  ];

  for (const s of seeds) {
    const task = createTask(
      db,
      {
        title: s.title,
        description: s.description ?? '',
        clientId: s.client?.id ?? null,
        projectId: s.project?.id ?? null,
        assigneeId: s.assignee?.id ?? null,
        participantIds: (s.participants ?? []).map((p) => p.id),
        priority: s.priority,
        status: 'todo',
        onboarding: s.onboarding ?? false,
        scope: s.personal ? 'personal' : 'team',
        ownerId: s.personal?.id ?? null,
        dueDate: s.due === null ? null : day(s.due),
      },
      ana.id,
    );
    task.createdAt = daysAgo(s.createdAgo);
    task.history[0].at = task.createdAt;
    if (s.status !== 'todo') {
      addHistory(task, 'status', s.assignee?.id ?? ana.id, 'todo', s.status);
      task.history[1].at = daysAgo(Math.max(0, s.createdAgo - 1));
      task.status = s.status;
      task.completedAt = s.status === 'done' ? task.history[1].at : null;
    }
    task.updatedAt = task.history[task.history.length - 1].at;
    for (const [author, body] of s.comments ?? []) {
      task.comments.push({
        id: randomUUID(),
        authorId: author.id,
        body,
        mentions: extractMentions(body, members),
        createdAt: daysAgo(Math.max(0, s.createdAgo - 2)),
      });
    }
  }
  // Re-space orders per column so the seeded board keeps a stable, readable order.
  for (const status of ['todo', 'in_progress', 'blocked', 'review', 'done'] as const) {
    db.tasks.filter((t) => t.status === status).forEach((t, i) => (t.order = i));
  }
}
