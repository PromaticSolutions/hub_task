import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon, title, description, actions, compact }: EmptyStateProps) {
  return (
    <div className={`empty-state${compact ? ' compact' : ''}`}>
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {description && <p className="muted">{description}</p>}
      {actions && <div className="empty-actions">{actions}</div>}
    </div>
  );
}
