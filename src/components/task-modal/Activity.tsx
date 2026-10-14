import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  CalendarClock,
  Copy,
  History,
  MessageSquare,
  PlusCircle,
  Send,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import type { HistoryEntry, Status, Task } from '../../../shared/types';
import { STATUS_META } from '../../lib/constants';
import { errorMessage } from '../../lib/api';
import { formatDateTime, formatDay, timeAgo } from '../../lib/dates';
import { useData } from '../../store/data';
import { confirmAction, toast } from '../../store/ui';
import { useCurrentUser, useMembersById } from '../../hooks/useLookups';
import { Avatar } from '../ui/Avatar';
import { MentionText, MentionTextarea } from '../ui/Mentions';

function Comments({ task }: { task: Task }) {
  const members = useData((s) => s.members);
  const addComment = useData((s) => s.addComment);
  const deleteComment = useData((s) => s.deleteComment);
  const membersById = useMembersById();
  const me = useCurrentUser();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const submit = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      await addComment(task.id, body.trim());
      setBody('');
      toast.success('Comentário publicado.');
    } catch (err) {
      toast.error(`Não foi possível comentar: ${errorMessage(err)}`);
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: string) => {
    const ok = await confirmAction({
      title: 'Excluir comentário?',
      message: 'O comentário será removido permanentemente.',
      confirmLabel: 'Excluir comentário',
    });
    if (!ok) return;
    setRemoving(id);
    try {
      await deleteComment(task.id, id);
      toast.success('Comentário excluído.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRemoving(null);
    }
  };

  const comments = [...task.comments].reverse();

  return (
    <div className="comments">
      <div className="comment-composer">
        <Avatar member={me} size="md" />
        <div className="comment-composer-body">
          <MentionTextarea
            value={body}
            onChange={setBody}
            members={members}
            rows={2}
            placeholder="Escreva um comentário... use @ para mencionar alguém"
            ariaLabel="Novo comentário"
            onSubmit={submit}
          />
          <div className="comment-composer-foot">
            <span className="muted">
              {me ? (
                <>
                  Comentando como <strong>{me.name}</strong> · Ctrl+Enter envia
                </>
              ) : (
                <>
                  Comentário anônimo. <Link to="/settings#identidade" className="text-link">Selecione quem é você</Link>
                </>
              )}
            </span>
            <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={!body.trim() || sending}>
              {sending ? <span className="spinner" /> : <Send size={14} />}
              Comentar
            </button>
          </div>
        </div>
      </div>

      {!comments.length && <p className="activity-empty muted">Nenhum comentário ainda. Comece a conversa!</p>}

      <ul className="comment-list">
        {comments.map((c) => {
          const author = c.authorId ? membersById.get(c.authorId) : null;
          return (
            <li key={c.id} className={`comment${c.mentions.includes(me?.id ?? '') ? ' mentions-me' : ''}`}>
              <Avatar member={author} size="md" title={author?.name ?? (c.authorId ? 'Membro removido' : 'Anônimo')} />
              <div className="comment-body">
                <div className="comment-head">
                  <strong>{author?.name ?? (c.authorId ? 'Membro removido' : 'Anônimo')}</strong>
                  <span className="muted" title={formatDateTime(c.createdAt)}>
                    {timeAgo(c.createdAt)}
                  </span>
                  <button
                    type="button"
                    className="icon-btn sm danger comment-delete"
                    onClick={() => remove(c.id)}
                    disabled={removing === c.id}
                    aria-label="Excluir comentário"
                    title="Excluir comentário"
                  >
                    {removing === c.id ? <span className="spinner" /> : <Trash2 size={14} />}
                  </button>
                </div>
                <p className="comment-text">
                  <MentionText text={c.body} members={members} meId={me?.id} />
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const HISTORY_ICON = {
  created: PlusCircle,
  duplicated: Copy,
  status: ArrowRight,
  assignee: UserRound,
  participants: Users,
  dueDate: CalendarClock,
  archived: Archive,
  restored: ArchiveRestore,
};

function HistoryList({ task }: { task: Task }) {
  const membersById = useMembersById();
  const name = (id: string | null) => (id ? membersById.get(id)?.name ?? 'membro removido' : null);

  const describe = (h: HistoryEntry) => {
    switch (h.type) {
      case 'created':
        return (
          <>
            criou a tarefa em <StatusText status={h.to as Status} />
          </>
        );
      case 'duplicated':
        return <>criou esta tarefa duplicando a #{h.from}</>;
      case 'status':
        return (
          <>
            moveu de <StatusText status={h.from as Status} /> para <StatusText status={h.to as Status} />
          </>
        );
      case 'assignee':
        if (!h.from) return <>definiu o responsável: <strong>{name(h.to)}</strong></>;
        if (!h.to) return <>removeu o responsável <strong>{name(h.from)}</strong></>;
        return (
          <>
            trocou o responsável de <strong>{name(h.from)}</strong> para <strong>{name(h.to)}</strong>
          </>
        );
      case 'participants': {
        const before = h.from ? h.from.split(',').filter(Boolean) : [];
        const after = h.to ? h.to.split(',').filter(Boolean) : [];
        const added = after.filter((id) => !before.includes(id)).map(name);
        const removed = before.filter((id) => !after.includes(id)).map(name);
        return (
          <>
            {added.length > 0 && (
              <>
                adicionou <strong>{added.join(', ')}</strong> como participante{added.length > 1 ? 's' : ''}
              </>
            )}
            {added.length > 0 && removed.length > 0 && ' e '}
            {removed.length > 0 && (
              <>
                removeu <strong>{removed.join(', ')}</strong> dos participantes
              </>
            )}
            {!added.length && !removed.length && 'atualizou os participantes'}
          </>
        );
      }
      case 'dueDate':
        if (!h.from) return <>definiu o prazo para <strong>{formatDay(h.to!, "d 'de' MMM yyyy")}</strong></>;
        if (!h.to) return <>removeu o prazo (era <strong>{formatDay(h.from, "d 'de' MMM yyyy")}</strong>)</>;
        return (
          <>
            alterou o prazo de <strong>{formatDay(h.from, "d 'de' MMM")}</strong> para{' '}
            <strong>{formatDay(h.to, "d 'de' MMM yyyy")}</strong>
          </>
        );
      case 'archived':
        return <>arquivou a tarefa</>;
      case 'restored':
        return <>restaurou a tarefa do arquivo</>;
    }
  };

  const entries = [...task.history].reverse();
  return (
    <ol className="history">
      {entries.map((h) => {
        const Icon = HISTORY_ICON[h.type];
        const actor = h.actorId ? membersById.get(h.actorId) : null;
        return (
          <li key={h.id} className={`history-item h-${h.type}`}>
            <span className="history-icon">
              <Icon size={14} />
            </span>
            <div className="history-text">
              <span>
                <strong>{actor?.name ?? (h.actorId ? 'Membro removido' : 'Alguém')}</strong> {describe(h)}
              </span>
              <time className="muted" dateTime={h.at} title={formatDateTime(h.at)}>
                {timeAgo(h.at)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StatusText({ status }: { status: Status }) {
  const meta = STATUS_META[status];
  if (!meta) return <strong>{status}</strong>;
  return (
    <span className={`badge status-${status} inline`}>
      <span className="badge-dot" />
      {meta.label}
    </span>
  );
}

export function TaskActivity({ task }: { task: Task }) {
  const [tab, setTab] = useState<'comments' | 'history'>('comments');
  return (
    <section className="tm-section">
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'comments'} className={tab === 'comments' ? 'active' : ''} onClick={() => setTab('comments')}>
          <MessageSquare size={15} /> Comentários
          <span className="count-pill">{task.comments.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          <History size={15} /> Histórico
          <span className="count-pill">{task.history.length}</span>
        </button>
      </div>
      {tab === 'comments' ? <Comments task={task} /> : <HistoryList task={task} />}
    </section>
  );
}
