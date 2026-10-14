import { Check, UserPlus } from 'lucide-react';
import { useData } from '../store/data';
import { toast, usePrefs, useUi } from '../store/ui';
import { Avatar } from './ui/Avatar';

/** Lets the person say which team member they are (no login in this version). */
export function IdentityPicker() {
  const members = useData((s) => s.members);
  const currentUserId = usePrefs((s) => s.currentUserId);
  const setCurrentUser = usePrefs((s) => s.setCurrentUser);
  const openMemberForm = useUi((s) => s.openMemberForm);

  if (!members.length) {
    return (
      <div className="identity-empty">
        <p className="muted">Nenhum membro cadastrado ainda.</p>
        <button type="button" className="btn btn-primary" onClick={() => openMemberForm()}>
          <UserPlus size={16} /> Cadastrar membro
        </button>
      </div>
    );
  }

  return (
    <div className="identity-grid" role="radiogroup" aria-label="Quem é você?">
      {[...members]
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .map((m) => {
          const active = m.id === currentUserId;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`identity-option${active ? ' active' : ''}`}
              onClick={() => {
                setCurrentUser(m.id);
                toast.success(`Agora você está usando como ${m.name}.`);
              }}
            >
              <Avatar member={m} size="md" />
              <span className="identity-text">
                <strong className="truncate">{m.name}</strong>
                <span className="truncate muted">{m.role || 'Membro da equipe'}</span>
              </span>
              {active && <Check size={16} className="identity-check" />}
            </button>
          );
        })}
    </div>
  );
}
