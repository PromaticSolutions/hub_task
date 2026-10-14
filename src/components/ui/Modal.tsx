import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  labelledBy?: string;
  hideHeader?: boolean;
}

const openStack: number[] = [];
let seq = 0;

export function Modal({ open, onClose, title, subtitle, size = 'md', children, footer, className, hideHeader }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const id = ++seq;
    idRef.current = id;
    openStack.push(id);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const auto = panel.querySelector<HTMLElement>('[data-autofocus]');
      (auto ?? panel).focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openStack[openStack.length - 1] === id && !e.defaultPrevented) {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      const idx = openStack.indexOf(id);
      if (idx !== -1) openStack.splice(idx, 1);
      if (!openStack.length) document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="modal-root" role="presentation">
      <div className="modal-overlay" onMouseDown={() => onCloseRef.current()} />
      <div
        ref={panelRef}
        className={`modal modal-${size} ${className ?? ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
      >
        {!hideHeader && (
          <header className="modal-header">
            <div className="modal-titles">
              {title && <h2>{title}</h2>}
              {subtitle && <p className="muted">{subtitle}</p>}
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
              <X size={18} />
            </button>
          </header>
        )}
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
