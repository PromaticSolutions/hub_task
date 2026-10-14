import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface PopoverProps {
  trigger: (props: { open: boolean; toggle: () => void; ref: (el: HTMLElement | null) => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'start' | 'end';
  width?: number | 'trigger';
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

/** Floating panel rendered in a portal, so it is never clipped by scrolling containers. */
export function Popover({ trigger, children, align = 'start', width, className, onOpenChange }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width?: number; maxHeight: number } | null>(null);

  const setOpenState = useCallback(
    (value: boolean) => {
      setOpen(value);
      onOpenChange?.(value);
    },
    [onOpenChange],
  );

  const close = useCallback(() => setOpenState(false), [setOpenState]);
  const toggle = useCallback(() => setOpenState(!open), [open, setOpenState]);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = width === 'trigger' ? r.width : width ?? panel.offsetWidth;
    const panelW = Math.min(w, vw - 16);
    let left = align === 'end' ? r.right - panelW : r.left;
    left = Math.max(8, Math.min(left, vw - panelW - 8));
    const spaceBelow = vh - r.bottom - 12;
    const spaceAbove = r.top - 12;
    const natural = panel.scrollHeight;
    const below = spaceBelow >= Math.min(natural, 260) || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(160, below ? spaceBelow : spaceAbove);
    const height = Math.min(natural, maxHeight);
    const top = below ? r.bottom + 6 : r.top - 6 - height;
    setPos({ top, left, width: width ? panelW : undefined, maxHeight });
  }, [align, width]);

  useLayoutEffect(() => {
    if (open) place();
    else setPos(null);
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        anchorRef.current?.focus();
      }
    };
    const onMove = () => place();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    const ro = new ResizeObserver(onMove);
    if (panelRef.current) ro.observe(panelRef.current);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
      ro.disconnect();
    };
  }, [open, close, place]);

  return (
    <>
      {trigger({
        open,
        toggle,
        ref: (el) => {
          anchorRef.current = el;
        },
      })}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className={`popover ${className ?? ''}`}
            style={{
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width: pos?.width,
              maxHeight: pos?.maxHeight,
              visibility: pos ? 'visible' : 'hidden',
            }}
            role="dialog"
          >
            {typeof children === 'function' ? children(close) : children}
          </div>,
          document.body,
        )}
    </>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  active,
  disabled,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`menu-item${danger ? ' danger' : ''}${active ? ' active' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}
