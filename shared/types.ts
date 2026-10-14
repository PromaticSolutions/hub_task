export const STATUSES = ['todo', 'in_progress', 'blocked', 'review', 'done'] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export type TaskScope = 'team' | 'personal';

export const PROJECT_STATUSES = ['active', 'paused', 'done'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  color: string;
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  color: string;
  contactName: string;
  email: string;
  phone: string;
  notes: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  description: string;
  clientId: string | null;
  status: ProjectStatus;
  createdAt: string;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  storedName: string;
  uploadedAt: string;
  uploadedBy: string | null;
}

export interface Comment {
  id: string;
  authorId: string | null;
  body: string;
  mentions: string[];
  createdAt: string;
}

export type HistoryType =
  | 'created'
  | 'duplicated'
  | 'status'
  | 'assignee'
  | 'participants'
  | 'project'
  | 'dueDate'
  | 'archived'
  | 'restored';

export interface HistoryEntry {
  id: string;
  type: HistoryType;
  at: string;
  actorId: string | null;
  from: string | null;
  to: string | null;
}

export interface Task {
  id: string;
  number: number;
  title: string;
  description: string;
  descriptionMentions: string[];
  clientId: string | null;
  projectId: string | null;
  color: string | null;
  assigneeId: string | null;
  participantIds: string[];
  priority: Priority;
  status: Status;
  order: number;
  scope: TaskScope;
  ownerId: string | null;
  onboarding: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  dueDate: string | null;
  completedAt: string | null;
  archived: boolean;
  archivedAt: string | null;
  attachments: Attachment[];
  comments: Comment[];
  history: HistoryEntry[];
}

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  offsetDays: number;
  priority: Priority;
}

export interface Settings {
  onboardingTemplate: OnboardingStep[];
}

export interface Snapshot {
  version: number;
  members: Member[];
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  settings: Settings;
}

export interface TaskInput {
  title: string;
  description?: string;
  clientId?: string | null;
  projectId?: string | null;
  color?: string | null;
  assigneeId?: string | null;
  participantIds?: string[];
  priority?: Priority;
  status?: Status;
  order?: number;
  scope?: TaskScope;
  ownerId?: string | null;
  onboarding?: boolean;
  dueDate?: string | null;
}

export type TaskPatch = Partial<TaskInput> & { archived?: boolean };

export type MemberInput = Pick<Member, 'name' | 'email' | 'role' | 'color'>;
export type ClientInput = Pick<Client, 'name' | 'color' | 'contactName' | 'email' | 'phone' | 'notes'>;
export type ProjectInput = Pick<Project, 'name' | 'color' | 'description' | 'clientId' | 'status'>;

export type BulkAction =
  | { type: 'status'; status: Status }
  | { type: 'assignee'; assigneeId: string | null }
  | { type: 'project'; projectId: string | null }
  | { type: 'archive'; archived: boolean }
  | { type: 'delete' };

/** Extracts the ids of members mentioned as "@Nome" in a text. Longest names win. */
export function extractMentions(text: string, members: Pick<Member, 'id' | 'name'>[]): string[] {
  if (!text.includes('@')) return [];
  const sorted = [...members].sort((a, b) => b.name.length - a.name.length);
  const found = new Set<string>();
  const lower = text.toLocaleLowerCase('pt-BR');
  for (const m of sorted) {
    const needle = '@' + m.name.toLocaleLowerCase('pt-BR');
    let idx = lower.indexOf(needle);
    while (idx !== -1) {
      const after = lower.charAt(idx + needle.length);
      if (!after || !/[\p{L}\p{N}_]/u.test(after)) {
        found.add(m.id);
        break;
      }
      idx = lower.indexOf(needle, idx + 1);
    }
  }
  return [...found];
}
