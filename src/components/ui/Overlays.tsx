import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useUi } from '../../store/ui';
import { Modal } from './Modal';

export function ConfirmDialog() {
  const confirm = useUi((s) => s.confirm);
  const close = (ok: boolean) => {
    confirm?.resolve(ok);
    useUi.setState({ confirm: null });
  };
  const danger = confirm?.tone !== 'primary';
  return (
    <Modal open={!!confirm} onClose={() => close(false)} size="sm" hideHeader className="confirm-modal">
      {confirm && (
        <div className="confirm">
          <div className={`confirm-icon${danger ? ' danger' : ''}`}>
            <AlertTriangle size={22} />
          </div>
          <div className="confirm-text">
            <h2>{confirm.title}</h2>
            <p className="muted">{confirm.message}</p>
          </div>
          <div className="confirm-actions">
            <button type="button" className="btn btn-secondary" onClick={() => close(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
              onClick={() => close(true)}
              data-autofocus
            >
              {confirm.confirmLabel ?? 'Confirmar'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const ICONS = { success: CheckCircle2, error: XCircle, info: Info };

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  return (
    <div className="toasts" role="region" aria-live="polite" aria-label="Notificações">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <Icon size={18} className="toast-icon" />
            <span className="toast-message">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Fechar notificação">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
