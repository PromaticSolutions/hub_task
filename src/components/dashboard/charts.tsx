import { useRef, useState, type FocusEvent as ReactFocusEvent, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, Minus, Table2, TrendingDown, TrendingUp } from 'lucide-react';
import { STATUSES, type Status } from '../../../shared/types';
import { STATUS_META } from '../../lib/constants';

/* ---------- Tooltip (shared by every chart card) ---------- */

export interface Tip {
  x: number;
  y: number;
  value: string;
  label: string;
  color?: string;
}

export function useTooltip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const place = (clientX: number, clientY: number, data: Omit<Tip, 'x' | 'y'>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ ...data, x: clientX - box.left, y: clientY - box.top });
  };
  const handlers = (data: Omit<Tip, 'x' | 'y'>) => ({
    onPointerMove: (e: ReactPointerEvent) => place(e.clientX, e.clientY, data),
    onPointerLeave: () => setTip(null),
    onFocus: (e: ReactFocusEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      place(r.left + r.width / 2, r.top, data);
    },
    onBlur: () => setTip(null),
  });
  const node = tip ? (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="status">
      <strong>{tip.value}</strong>
      <span>
        {tip.color && <i className="chart-tip-key" style={{ background: tip.color }} />}
        {tip.label}
      </span>
    </div>
  ) : null;
  return { ref, handlers, node };
}

export type TipHandlers = ReturnType<typeof useTooltip>['handlers'];

export function ChartCard({
  title,
  subtitle,
  children,
  table,
  className,
  legend,
}: {
  title: string;
  subtitle?: string;
  children: (handlers: ReturnType<typeof useTooltip>['handlers']) => ReactNode;
  table?: ReactNode;
  className?: string;
  legend?: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  const tip = useTooltip();
  return (
    <section className={`dash-card card ${className ?? ''}`}>
      <header className="dash-card-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {table && (
          <button
            type="button"
            className="icon-btn sm"
            onClick={() => setAsTable((v) => !v)}
            aria-pressed={asTable}
            aria-label={asTable ? 'Ver como gráfico' : 'Ver como tabela'}
            title={asTable ? 'Ver como gráfico' : 'Ver como tabela'}
          >
            {asTable ? <BarChart3 size={16} /> : <Table2 size={16} />}
          </button>
        )}
      </header>
      {!asTable && legend}
      <div className="dash-card-body" ref={tip.ref}>
        {asTable ? table : children(tip.handlers)}
        {!asTable && tip.node}
      </div>
    </section>
  );
}

/** Change against the previous period. `upIsGood` decides the color; null means neutral. */
export interface Delta {
  value: number;
  previous: number;
  against: string;
  upIsGood: boolean | null;
}

function DeltaBadge({ delta }: { delta: Delta }) {
  const diff = delta.value - delta.previous;
  const tone = diff === 0 || delta.upIsGood === null ? 'flat' : (diff > 0) === delta.upIsGood ? 'up' : 'down';
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  return (
    <span className={`stat-delta ${tone}`}>
      <Icon size={13} strokeWidth={2.4} />
      {diff > 0 ? '+' : ''}
      {diff.toLocaleString('pt-BR')} <span className="stat-delta-against">vs {delta.against}</span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone,
  to,
  delta,
}: {
  label: string;
  value: number | string;
  hint: ReactNode;
  icon: ReactNode;
  tone?: 'danger' | 'good' | 'warn';
  to?: string;
  delta?: Delta;
}) {
  const body = (
    <>
      <span className="stat-icon">{icon}</span>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</span>
      <span className="stat-hint">
        {delta && <DeltaBadge delta={delta} />}
        {hint}
      </span>
    </>
  );
  const cls = `stat-tile${tone ? ` tone-${tone}` : ''}`;
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Legend() {
  return (
    <ul className="chart-legend" aria-label="Legenda">
      {STATUSES.map((s) => (
        <li key={s}>
          <i style={{ background: STATUS_META[s].color }} />
          {STATUS_META[s].label}
        </li>
      ))}
    </ul>
  );
}

export type Counts = Record<Status, number>;
export const emptyCounts = (): Counts => ({ todo: 0, in_progress: 0, blocked: 0, review: 0, done: 0 });
export const total = (c: Counts) => STATUSES.reduce((n, s) => n + c[s], 0);

export interface StackRow {
  key: string;
  label: string;
  marker: ReactNode;
  counts: Counts;
  href: string;
  segmentHref: (status: Status) => string;
}

export function StackedRows({ rows, handlers }: { rows: StackRow[]; handlers: ReturnType<typeof useTooltip>['handlers'] }) {
  const navigate = useNavigate();
  const max = Math.max(1, ...rows.map((r) => total(r.counts)));
  return (
    <ul className="stack-rows">
      {rows.map((r) => {
        const t = total(r.counts);
        const present = STATUSES.filter((s) => r.counts[s] > 0);
        return (
          <li key={r.key} className="stack-row">
            <Link to={r.href} className="stack-label" title={r.label}>
              {r.marker}
              <span className="truncate">{r.label}</span>
            </Link>
            <div className="stack-track">
              <div className="stack-bar" style={{ width: `${(t / max) * 100}%` }}>
                {present.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="stack-seg"
                    style={{ flexGrow: r.counts[s], background: STATUS_META[s].color }}
                    onClick={() => navigate(r.segmentHref(s))}
                    aria-label={`${r.label}: ${r.counts[s]} ${STATUS_META[s].label}`}
                    {...handlers({ value: `${r.counts[s]} tarefa${r.counts[s] === 1 ? '' : 's'}`, label: `${r.label} · ${STATUS_META[s].label}`, color: STATUS_META[s].color })}
                  />
                ))}
              </div>
              <span className="stack-total">{t}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function CountsTable({ rows, firstCol }: { rows: { key: string; label: string; counts: Counts }[]; firstCol: string }) {
  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead>
          <tr>
            <th>{firstCol}</th>
            {STATUSES.map((s) => (
              <th key={s}>{STATUS_META[s].short}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td>
              {STATUSES.map((s) => (
                <td key={s}>{r.counts[s]}</td>
              ))}
              <td>
                <strong>{total(r.counts)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
