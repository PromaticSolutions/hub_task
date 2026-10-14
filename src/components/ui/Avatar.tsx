import { UserRound } from 'lucide-react';
import type { Member } from '../../../shared/types';
import { initials, readableOn } from '../../lib/color';

interface AvatarProps {
  member: Member | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}

export function Avatar({ member, size, title }: AvatarProps) {
  const cls = `avatar${size ? ` ${size}` : ''}`;
  if (!member) {
    return (
      <span className={`${cls} empty`} title={title ?? 'Sem responsável'} aria-label={title ?? 'Sem responsável'}>
        <UserRound size={size === 'lg' ? 18 : 12} />
      </span>
    );
  }
  return (
    <span
      className={cls}
      style={{ background: member.color, color: readableOn(member.color) }}
      title={title ?? member.name}
      aria-label={member.name}
    >
      {initials(member.name)}
    </span>
  );
}

export function AvatarStack({ members, max = 3, size }: { members: Member[]; max?: number; size?: 'sm' | 'md' }) {
  if (!members.length) return null;
  const shown = members.slice(0, max);
  const rest = members.length - shown.length;
  return (
    <span className="avatar-stack" title={members.map((m) => m.name).join(', ')}>
      {shown.map((m) => (
        <Avatar key={m.id} member={m} size={size} />
      ))}
      {rest > 0 && <span className={`avatar avatar-more${size ? ` ${size}` : ''}`}>+{rest}</span>}
    </span>
  );
}
