import { useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Search, UserRound, X } from 'lucide-react';
import type { Client, Member, Project } from '../../../shared/types';
import { PROJECT_STATUS_META } from '../../lib/constants';
import { Avatar } from './Avatar';
import { ProjectIcon } from './Badges';
import { Popover } from './Popover';

export interface Option {
  value: string;
  label: string;
  icon?: ReactNode;
  hint?: string;
}

function normalize(s: string) {
  return s
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function OptionList({
  options,
  selected,
  onToggle,
  multi,
  searchable,
  emptyText,
}: {
  options: Option[];
  selected: string[];
  onToggle: (value: string) => void;
  multi: boolean;
  searchable: boolean;
  emptyText: string;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(
    () => (query ? options.filter((o) => normalize(o.label).includes(normalize(query))) : options),
    [options, query],
  );
  return (
    <div className="option-list">
      {searchable && (
        <div className="option-search">
          <Search size={14} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar..."
            aria-label="Buscar opções"
          />
        </div>
      )}
      <div className="option-scroll" role="listbox" aria-multiselectable={multi}>
        {shown.map((o) => {
          const isSel = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={isSel}
              className={`option${isSel ? ' selected' : ''}`}
              onClick={() => onToggle(o.value)}
            >
              {multi && <span className={`option-check${isSel ? ' on' : ''}`}>{isSel && <Check size={11} strokeWidth={3.2} />}</span>}
              {o.icon}
              <span className="option-label truncate">{o.label}</span>
              {o.hint && <span className="option-hint">{o.hint}</span>}
              {!multi && isSel && <Check size={14} className="option-tick" />}
            </button>
          );
        })}
        {!shown.length && <div className="option-empty">{emptyText}</div>}
      </div>
    </div>
  );
}

interface SelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  options: Option[];
  placeholder: string;
  nullable?: boolean;
  nullLabel?: string;
  searchable?: boolean;
  renderValue?: (option: Option | undefined) => ReactNode;
  ariaLabel: string;
  disabled?: boolean;
}

/** Single-value picker with search (used for client and responsible). */
export function SelectPicker({
  value,
  onChange,
  options,
  placeholder,
  nullable,
  nullLabel = 'Nenhum',
  searchable = true,
  renderValue,
  ariaLabel,
  disabled,
}: SelectProps) {
  const current = options.find((o) => o.value === value);
  const all = nullable ? [{ value: '__null__', label: nullLabel, icon: <span className="option-null"><X size={12} /></span> }, ...options] : options;
  return (
    <Popover
      width="trigger"
      trigger={({ toggle, ref, open }) => (
        <button
          type="button"
          ref={ref}
          className={`picker-trigger${open ? ' open' : ''}`}
          onClick={toggle}
          aria-label={ariaLabel}
          aria-expanded={open}
          disabled={disabled}
        >
          <span className="picker-value">
            {renderValue ? renderValue(current) : current ? (
              <>
                {current.icon}
                <span className="truncate">{current.label}</span>
              </>
            ) : (
              <span className="picker-placeholder">{placeholder}</span>
            )}
          </span>
          <ChevronDown size={14} className="picker-caret" />
        </button>
      )}
    >
      {(close) => (
        <OptionList
          options={all}
          selected={value ? [value] : nullable ? ['__null__'] : []}
          multi={false}
          searchable={searchable && options.length > 6}
          emptyText="Nenhum resultado"
          onToggle={(v) => {
            onChange(v === '__null__' ? null : v);
            close();
          }}
        />
      )}
    </Popover>
  );
}

interface MultiProps {
  values: string[];
  onChange: (values: string[]) => void;
  options: Option[];
  label: ReactNode;
  ariaLabel: string;
  emptyText?: string;
  className?: string;
  renderTrigger?: (props: { open: boolean; toggle: () => void; ref: (el: HTMLElement | null) => void }) => ReactNode;
}

/** Multi-select checklist in a popover (filters and participants). */
export function MultiPicker({ values, onChange, options, label, ariaLabel, emptyText = 'Nenhuma opção', className, renderTrigger }: MultiProps) {
  const toggleValue = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <Popover
      width={260}
      trigger={
        renderTrigger ??
        (({ toggle, ref, open }) => (
          <button
            type="button"
            ref={ref}
            className={`filter-trigger${values.length ? ' active' : ''}${open ? ' open' : ''} ${className ?? ''}`}
            onClick={toggle}
            aria-label={ariaLabel}
            aria-expanded={open}
          >
            <span className="truncate">{label}</span>
            {values.length > 0 && <span className="count-pill">{values.length}</span>}
            <ChevronDown size={14} />
          </button>
        ))
      }
    >
      <OptionList
        options={options}
        selected={values}
        multi
        searchable={options.length > 7}
        emptyText={emptyText}
        onToggle={toggleValue}
      />
      {values.length > 0 && (
        <div className="option-footer">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([])}>
            Limpar seleção
          </button>
        </div>
      )}
    </Popover>
  );
}

export function memberOptions(members: Member[]): Option[] {
  return [...members]
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map((m) => ({ value: m.id, label: m.name, hint: m.role || undefined, icon: <Avatar member={m} size="sm" /> }));
}

export function clientOptions(clients: Client[]): Option[] {
  return [...clients]
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map((c) => ({ value: c.id, label: c.name, icon: <span className="option-dot" style={{ background: c.color }} /> }));
}

/** Every project, sorted; finished ones go last. Callers that assign tasks should leave out finished projects. */
export function projectOptions(projects: Project[]): Option[] {
  return [...projects]
    .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || a.name.localeCompare(b.name, 'pt-BR'))
    .map((p) => ({
      value: p.id,
      label: p.name,
      hint: p.status === 'active' ? undefined : PROJECT_STATUS_META[p.status].label,
      icon: <ProjectIcon color={p.color} />,
    }));
}

export const noAssigneeIcon = (
  <span className="avatar sm empty">
    <UserRound size={11} />
  </span>
);
