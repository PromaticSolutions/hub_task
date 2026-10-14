import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Member } from '../../../shared/types';
import { Avatar } from './Avatar';

function normalize(s: string) {
  return s
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  members: Member[];
  placeholder?: string;
  rows?: number;
  className?: string;
  onSubmit?: () => void;
  ariaLabel: string;
  autoFocus?: boolean;
}

interface MentionQuery {
  start: number;
  query: string;
}

/** Finds an "@query" being typed right before the caret. */
function findQuery(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  if (at > 0 && !/\s|[(\[]/.test(before.charAt(at - 1))) return null;
  const query = before.slice(at + 1);
  if (query.length > 40 || /\n/.test(query) || /\s\s/.test(query)) return null;
  return { start: at, query };
}

export const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>(function MentionTextarea(
  { value, onChange, members, placeholder, rows = 3, className, onSubmit, ariaLabel, autoFocus },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current!);
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [active, setActive] = useState(0);
  const pendingCaret = useRef<number | null>(null);

  // Place the caret right after the inserted mention as soon as React commits the new value,
  // before the next keystroke is handled (a rAF here would race with fast typing).
  useLayoutEffect(() => {
    const el = inner.current;
    if (el && pendingCaret.current !== null) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [value]);

  const suggestions = useMemo(() => {
    if (!mention) return [];
    const q = normalize(mention.query);
    return members
      .filter((m) => {
        const name = normalize(m.name);
        return !q || name.startsWith(q) || name.split(/\s+/).some((part) => part.startsWith(q));
      })
      .slice(0, 6);
  }, [mention, members]);

  const open = !!mention && suggestions.length > 0;

  const sync = (el: HTMLTextAreaElement) => {
    const q = findQuery(el.value, el.selectionStart ?? el.value.length);
    setMention(q);
    setActive(0);
  };

  const pick = (member: Member) => {
    const el = inner.current;
    if (!el || !mention) return;
    const caret = el.selectionStart ?? value.length;
    const insert = `@${member.name} `;
    const next = value.slice(0, mention.start) + insert + value.slice(caret);
    pendingCaret.current = mention.start + insert.length;
    el.focus();
    onChange(next);
    setMention(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(suggestions[active]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setMention(null);
        return;
      }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="mention-wrap">
      <textarea
        ref={inner}
        className={`textarea ${className ?? ''}`}
        value={value}
        rows={rows}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value);
          sync(e.target);
        }}
        onKeyDown={onKeyDown}
        onClick={(e) => sync(e.currentTarget)}
        onBlur={() => window.setTimeout(() => setMention(null), 150)}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {open && (
        <div className="mention-menu" role="listbox" aria-label="Mencionar membro">
          <div className="mention-menu-title">Mencionar</div>
          {suggestions.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`option${i === active ? ' active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <Avatar member={m} size="sm" />
              <span className="option-label truncate">{m.name}</span>
              {m.role && <span className="option-hint">{m.role}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

function linkify(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const idx = match.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    out.push(
      <a key={`${keyBase}-u${idx}`} href={match[0]} target="_blank" rel="noopener noreferrer" className="text-link">
        {match[0]}
      </a>,
    );
    last = idx + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Renders text highlighting "@Name" mentions of known members and turning URLs into links. */
export function MentionText({ text, members, meId }: { text: string; members: Member[]; meId?: string | null }) {
  const parts = useMemo(() => {
    if (!text.includes('@') || !members.length) return linkify(text, 't');
    const sorted = [...members].sort((a, b) => b.name.length - a.name.length);
    const re = new RegExp(`@(${sorted.map((m) => escapeRe(m.name)).join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
    const byName = new Map(sorted.map((m) => [m.name.toLocaleLowerCase('pt-BR'), m]));
    const out: ReactNode[] = [];
    let last = 0;
    for (const match of text.matchAll(re)) {
      const idx = match.index ?? 0;
      if (idx > last) out.push(...linkify(text.slice(last, idx), `s${idx}`));
      const member = byName.get(match[1].toLocaleLowerCase('pt-BR'));
      out.push(
        <span key={`m${idx}`} className={`mention${member?.id === meId ? ' me' : ''}`} title={member?.role || member?.name}>
          @{member?.name ?? match[1]}
        </span>,
      );
      last = idx + match[0].length;
    }
    if (last < text.length) out.push(...linkify(text.slice(last), 'end'));
    return out;
  }, [text, members, meId]);
  return <>{parts}</>;
}
