import { memo, type MouseEvent } from 'react';
import { CheckCircle2, Lock, MessageSquare, Paperclip, Rocket, UserRound } from 'lucide-react';
import type { Client, Member, Project, Task } from '../../../shared/types';
import { isOverdue } from '../../lib/dates';
import { Avatar, AvatarStack } from '../ui/Avatar';
import { ClientChip, DueChip, PriorityBadge, ProjectChip } from '../ui/Badges';

interface TaskCardProps {
  task: Task;
  client: Client | undefined;
  project: Project | undefined;
  assignee: Member | undefined;
  participants: Member[];
  selected?: boolean;
  checked?: boolean;
  overlay?: boolean;
  onOpen?: (id: string) => void;
  onToggleCheck?: (id: string) => void;
}

export const TaskCard = memo(function TaskCard({
  task,
  client,
  project,
  assignee,
  participants,
  selected,
  checked,
  overlay,
  onOpen,
  onToggleCheck,
}: TaskCardProps) {
  const overdue = isOverdue(task);
  const color = task.color ?? client?.color ?? null;
  const classes = [
    'task-card',
    task.status === 'blocked' && 'is-blocked',
    task.status === 'done' && 'is-done',
    overdue && 'is-overdue',
    selected && 'is-selected',
    checked && 'is-checked',
    overlay && 'is-overlay',
    color && 'has-color',
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = (e: MouseEvent) => {
    if ((e.ctrlKey || e.metaKey || e.shiftKey) && onToggleCheck) {
      e.preventDefault();
      onToggleCheck(task.id);
      return;
    }
    onOpen?.(task.id);
  };

  return (
    <article
      className={classes}
      style={color ? { ['--task-color' as string]: color } : undefined}
      onClick={handleClick}
      aria-label={`${task.title}${overdue ? ' (atrasada)' : ''}`}
    >
      <div className="task-card-top">
        {client ? <ClientChip client={client} /> : <span className="task-card-noclient">Sem cliente</span>}
        <span className="task-card-number">#{task.number}</span>
        {onToggleCheck && (
          <input
            type="checkbox"
            className="checkbox task-card-check"
            checked={!!checked}
            onChange={() => onToggleCheck(task.id)}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            aria-label={`Selecionar tarefa ${task.title}`}
          />
        )}
      </div>

      <h4 className="task-card-title">
        {task.status === 'done' && <CheckCircle2 size={15} className="task-card-done-icon" />}
        {task.title}
      </h4>

      {task.status === 'blocked' && (
        <div className="task-card-flag blocked">
          <Lock size={12} strokeWidth={2.5} /> Bloqueada
        </div>
      )}

      <div className="task-card-meta">
        <PriorityBadge priority={task.priority} />
        <DueChip task={task} />
        <ProjectChip project={project} />
        {task.onboarding && (
          <span className="badge task-card-onb" title="Tarefa de onboarding">
            <Rocket size={12} /> Onboarding
          </span>
        )}
      </div>

      <div className="task-card-footer">
        <div className="task-card-counters">
          {task.comments.length > 0 && (
            <span title={`${task.comments.length} comentário(s)`}>
              <MessageSquare size={13} /> {task.comments.length}
            </span>
          )}
          {task.attachments.length > 0 && (
            <span title={`${task.attachments.length} anexo(s)`}>
              <Paperclip size={13} /> {task.attachments.length}
            </span>
          )}
        </div>
        <div className="task-card-people">
          {participants.length > 0 && <AvatarStack members={participants} max={2} size="sm" />}
          {assignee ? (
            <span className="task-card-assignee" title={`Responsável: ${assignee.name}`}>
              <Avatar member={assignee} title={`Responsável: ${assignee.name}`} />
              <span className="task-card-assignee-name truncate">{assignee.name.split(' ')[0]}</span>
            </span>
          ) : (
            <span className="task-card-unassigned" title="Sem responsável">
              <UserRound size={13} /> Sem responsável
            </span>
          )}
        </div>
      </div>
    </article>
  );
});
