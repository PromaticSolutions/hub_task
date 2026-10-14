import { Check, Pipette, X } from 'lucide-react';
import { PALETTE } from '../../lib/constants';
import { readableOn } from '../../lib/color';

interface ColorPickerProps {
  value: string | null;
  onChange: (color: string | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
}

export function ColorPicker({ value, onChange, allowNone, noneLabel = 'Usar cor do cliente' }: ColorPickerProps) {
  const custom = value && !PALETTE.includes(value.toLowerCase());
  return (
    <div className="color-picker" role="radiogroup" aria-label="Cor de identificação">
      {allowNone && (
        <button
          type="button"
          className={`swatch none${value === null ? ' selected' : ''}`}
          onClick={() => onChange(null)}
          title={noneLabel}
          aria-label={noneLabel}
          role="radio"
          aria-checked={value === null}
        >
          <X size={13} />
        </button>
      )}
      {PALETTE.map((c) => {
        const selected = value?.toLowerCase() === c;
        return (
          <button
            key={c}
            type="button"
            className={`swatch${selected ? ' selected' : ''}`}
            style={{ background: c, color: readableOn(c) }}
            onClick={() => onChange(c)}
            aria-label={`Cor ${c}`}
            role="radio"
            aria-checked={selected}
          >
            {selected && <Check size={13} strokeWidth={3} />}
          </button>
        );
      })}
      <label
        className={`swatch custom${custom ? ' selected' : ''}`}
        style={custom ? { background: value!, color: readableOn(value!) } : undefined}
        title="Cor personalizada"
      >
        {custom ? <Check size={13} strokeWidth={3} /> : <Pipette size={13} />}
        <input
          type="color"
          value={value ?? '#166534'}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Escolher cor personalizada"
        />
      </label>
    </div>
  );
}
