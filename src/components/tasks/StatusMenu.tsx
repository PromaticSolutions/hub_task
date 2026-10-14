import { Check, ChevronDown } from 'lucide-react';
import { STATUSES, type Status } from '../../../shared/types';
import { STATUS_META } from '../../lib/constants';
import { Popover } from '../ui/Popover';

/** Status badge that opens a menu to change the status in place. */
export function StatusMenu({ value, onChange, block }: { value: Status; onChange: (s: Status) => void; block?: boolean }) {
  return (
    <Popover
      width={block ? 'trigger' : 200}
      trigger={({ toggle, ref, open }) => (
        <button
          type="button"
          ref={ref}
          className={`status-trigger badge status-${value}${block ? ' block' : ''}${open ? ' open' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          aria-label={`Status: ${STATUS_META[value].label}. Alterar status`}
        >
          <span className="badge-dot" />
          <span className="truncate">{STATUS_META[value].label}</span>
          <ChevronDown size={13} />
        </button>
      )}
    >
      {(close) => (
        <div className="menu" onClick={(e) => e.stopPropagation()}>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`menu-item${s === value ? ' active' : ''}`}
              onClick={() => {
                if (s !== value) onChange(s);
                close();
              }}
            >
              <span className="badge-dot" style={{ background: STATUS_META[s].color }} />
              <span className="truncate">{STATUS_META[s].label}</span>
              {s === value && <Check size={14} className="menu-check" />}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
