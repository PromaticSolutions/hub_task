import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CalendarDays,
  Check,
  ChevronDown,
  Columns3,
  FilterX,
  List,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { PRIORITIES, STATUSES } from '../../../shared/types';
import { PRIORITY_META, SORT_LABELS, STATUS_META, VIEW_LABELS, type SortKey, type ViewMode } from '../../lib/constants';
import { DUE_PRESETS, NONE, countActiveFilters, hasAnyFilter, type DuePreset, type Filters } from '../../lib/filters';
import { formatDay } from '../../lib/dates';
import { useData } from '../../store/data';
import { MultiPicker, clientOptions, memberOptions, noAssigneeIcon } from '../ui/Pickers';
import { Popover } from '../ui/Popover';

const VIEW_ICONS = { kanban: Columns3, list: List, calendar: CalendarDays };

const DIR_LABELS: Record<Exclude<SortKey, 'manual'>, [string, string]> = {
  due: ['Mais próximos primeiro', 'Mais distantes primeiro'],
  priority: ['Mais urgentes primeiro', 'Menos urgentes primeiro'],
  created: ['Mais antigas primeiro', 'Mais recentes primeiro'],
};

interface ToolbarProps {
  filters: Filters;
  update: (patch: Partial<Filters>) => void;
  clear: () => void;
  view: ViewMode;
  setView: (v: ViewMode) => void;
  views: ViewMode[];
  hideClientFilter?: boolean;
  total: number;
  shown: number;
}

function DueFilter({ filters, update }: Pick<ToolbarProps, 'filters' | 'update'>) {
  const label = filters.due
    ? filters.due === 'custom'
      ? [filters.from && `de ${formatDay(filters.from)}`, filters.to && `até ${formatDay(filters.to)}`].filter(Boolean).join(' ') || 'Personalizado'
      : DUE_PRESETS[filters.due]
    : 'Prazo';
  return (
    <Popover
      width={250}
      trigger={({ toggle, ref, open }) => (
        <button
          type="button"
          ref={ref}
          className={`filter-trigger${filters.due ? ' active' : ''}${open ? ' open' : ''}`}
          onClick={toggle}
          aria-label="Filtrar por período de entrega"
        >
          <span className="truncate">{filters.due ? `Prazo: ${label}` : 'Prazo'}</span>
          <ChevronDown size={14} />
        </button>
      )}
    >
      {(close) => (
        <div className="menu">
          <div className="menu-title">Período de entrega</div>
          {(Object.keys(DUE_PRESETS) as DuePreset[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`menu-item${filters.due === key ? ' active' : ''}`}
              onClick={() => {
                update({ due: filters.due === key ? null : key });
                if (key !== 'custom') close();
              }}
            >
              <span className="truncate">{DUE_PRESETS[key]}</span>
              {filters.due === key && <Check size={14} className="menu-check" />}
            </button>
          ))}
          {filters.due === 'custom' && (
            <div className="menu-range">
              <label className="field">
                <span className="field-label">De</span>
                <input
                  type="date"
                  className="input"
                  value={filters.from ?? ''}
                  max={filters.to ?? undefined}
                  onChange={(e) => update({ from: e.target.value || null })}
                />
              </label>
              <label className="field">
                <span className="field-label">Até</span>
                <input
                  type="date"
                  className="input"
                  value={filters.to ?? ''}
                  min={filters.from ?? undefined}
                  onChange={(e) => update({ to: e.target.value || null })}
                />
              </label>
            </div>
          )}
          {filters.due && (
            <>
              <div className="menu-sep" />
              <button type="button" className="menu-item" onClick={() => { update({ due: null, from: null, to: null }); close(); }}>
                <X size={14} />
                <span>Remover filtro de prazo</span>
              </button>
            </>
          )}
        </div>
      )}
    </Popover>
  );
}

function SortControl({ filters, update }: Pick<ToolbarProps, 'filters' | 'update'>) {
  const sortable = filters.sort !== 'manual';
  const DirIcon = filters.dir === 'asc' ? ArrowUpNarrowWide : ArrowDownWideNarrow;
  return (
    <div className="sort-control">
      <Popover
        width={230}
        trigger={({ toggle, ref, open }) => (
          <button
            type="button"
            ref={ref}
            className={`filter-trigger${sortable ? ' active' : ''}${open ? ' open' : ''}`}
            onClick={toggle}
            aria-label="Ordenar tarefas"
          >
            <span className="truncate">
              <span className="hide-sm">Ordenar: </span>
              {SORT_LABELS[filters.sort]}
            </span>
            <ChevronDown size={14} />
          </button>
        )}
      >
        {(close) => (
          <div className="menu">
            <div className="menu-title">Ordenar por</div>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`menu-item${filters.sort === key ? ' active' : ''}`}
                onClick={() => {
                  update({ sort: key, dir: key === 'created' ? 'desc' : 'asc' });
                  close();
                }}
              >
                <span className="truncate">{SORT_LABELS[key]}</span>
                {key === 'manual' && <span className="menu-hint">arrastar</span>}
                {filters.sort === key && <Check size={14} className="menu-check" />}
              </button>
            ))}
          </div>
        )}
      </Popover>
      {sortable && (
        <button
          type="button"
          className="icon-btn sort-dir"
          onClick={() => update({ dir: filters.dir === 'asc' ? 'desc' : 'asc' })}
          title={DIR_LABELS[filters.sort as Exclude<SortKey, 'manual'>][filters.dir === 'asc' ? 0 : 1]}
          aria-label={`Inverter ordem: ${DIR_LABELS[filters.sort as Exclude<SortKey, 'manual'>][filters.dir === 'asc' ? 0 : 1]}`}
        >
          <DirIcon size={17} />
        </button>
      )}
    </div>
  );
}

export function Toolbar({ filters, update, clear, view, setView, views, hideClientFilter, total, shown }: ToolbarProps) {
  const members = useData((s) => s.members);
  const clients = useData((s) => s.clients);
  const activeCount = countActiveFilters(filters);
  const [expanded, setExpanded] = useState(activeCount > 0);
  const [query, setQuery] = useState(filters.q);
  const searchRef = useRef<HTMLInputElement>(null);

  const pushedQuery = useRef(filters.q);

  // Debounce the search into the URL.
  useEffect(() => {
    if (query === filters.q) return;
    const t = window.setTimeout(() => {
      pushedQuery.current = query;
      update({ q: query });
    }, 200);
    return () => window.clearTimeout(t);
  }, [query, filters.q, update]);

  // Mirror changes made elsewhere (chips, "Limpar filtros", links) without clobbering typing in progress.
  useEffect(() => {
    if (filters.q !== pushedQuery.current) {
      pushedQuery.current = filters.q;
      setQuery(filters.q);
    }
  }, [filters.q]);

  useEffect(() => {
    if (activeCount > 0) setExpanded(true);
  }, [activeCount]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.closest('input, textarea, select, [contenteditable="true"]');
      if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal-root')) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'v' || e.key === 'V') {
        const idx = views.indexOf(view);
        setView(views[(idx + 1) % views.length]);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [view, views, setView]);

  const anything = hasAnyFilter(filters);
  const memberOpts = [{ value: NONE, label: 'Sem responsável', icon: noAssigneeIcon }, ...memberOptions(members)];
  const clientOpts = [
    { value: NONE, label: 'Sem cliente', icon: <span className="option-dot" style={{ background: 'var(--border-strong)' }} /> },
    ...clientOptions(clients),
  ];

  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (filters.q.trim()) chips.push({ key: 'q', label: `Busca: "${filters.q.trim()}"`, remove: () => { setQuery(''); update({ q: '' }); } });
  filters.clients.forEach((id) =>
    chips.push({
      key: `c-${id}`,
      label: `Cliente: ${id === NONE ? 'Sem cliente' : clients.find((c) => c.id === id)?.name ?? '—'}`,
      remove: () => update({ clients: filters.clients.filter((x) => x !== id) }),
    }),
  );
  filters.assignees.forEach((id) =>
    chips.push({
      key: `a-${id}`,
      label: `Responsável: ${id === NONE ? 'Sem responsável' : members.find((m) => m.id === id)?.name ?? '—'}`,
      remove: () => update({ assignees: filters.assignees.filter((x) => x !== id) }),
    }),
  );
  filters.statuses.forEach((s) =>
    chips.push({ key: `s-${s}`, label: STATUS_META[s].label, remove: () => update({ statuses: filters.statuses.filter((x) => x !== s) }) }),
  );
  filters.priorities.forEach((p) =>
    chips.push({ key: `p-${p}`, label: `Prioridade ${PRIORITY_META[p].label.toLowerCase()}`, remove: () => update({ priorities: filters.priorities.filter((x) => x !== p) }) }),
  );
  if (filters.due) chips.push({ key: 'due', label: `Prazo: ${filters.due === 'custom' ? 'personalizado' : DUE_PRESETS[filters.due].toLowerCase()}`, remove: () => update({ due: null, from: null, to: null }) });
  if (filters.overdue) chips.push({ key: 'late', label: 'Somente atrasadas', remove: () => update({ overdue: false }) });

  return (
    <div className="toolbar">
      <div className="toolbar-row">
        <label className="search-box">
          <Search size={16} />
          <input
            ref={searchRef}
            id="task-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título ou descrição"
            aria-label="Buscar tarefas por título ou descrição"
          />
          {query ? (
            <button type="button" className="search-clear" onClick={() => { setQuery(''); update({ q: '' }); }} aria-label="Limpar busca">
              <X size={14} />
            </button>
          ) : (
            <span className="kbd hide-sm" aria-hidden>/</span>
          )}
        </label>

        <button
          type="button"
          className={`btn btn-secondary${expanded ? ' is-on' : ''}`}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="filter-bar"
        >
          <SlidersHorizontal size={16} />
          <span className="hide-xs">Filtros</span>
          {activeCount > 0 && <span className="count-pill solid">{activeCount}</span>}
        </button>

        <button type="button" className="btn btn-ghost" onClick={() => { setQuery(''); clear(); }} disabled={!anything} title="Limpar filtros, busca e ordenação">
          <FilterX size={16} />
          <span className="hide-sm">Limpar filtros</span>
        </button>

        <SortControl filters={filters} update={update} />

        <div className="toolbar-spacer" />

        <span className="toolbar-count muted hide-sm" aria-live="polite">
          {shown === total ? `${total} tarefa${total === 1 ? '' : 's'}` : `${shown} de ${total}`}
        </span>

        {views.length > 1 && (
          <div className="segmented" role="tablist" aria-label="Alternar visualização (V)">
            {views.map((v) => {
              const Icon = VIEW_ICONS[v];
              return (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  className={view === v ? 'active' : ''}
                  onClick={() => setView(v)}
                  title={`Visualizar em ${VIEW_LABELS[v]} (V alterna)`}
                >
                  <Icon size={16} />
                  <span className="hide-md">{VIEW_LABELS[v]}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {expanded && (
        <div className="filter-bar" id="filter-bar">
          {!hideClientFilter && (
            <MultiPicker
              label="Cliente"
              ariaLabel="Filtrar por cliente"
              values={filters.clients}
              onChange={(clients) => update({ clients })}
              options={clientOpts}
              emptyText="Nenhum cliente cadastrado"
            />
          )}
          <MultiPicker
            label="Responsável"
            ariaLabel="Filtrar por responsável"
            values={filters.assignees}
            onChange={(assignees) => update({ assignees })}
            options={memberOpts}
          />
          <MultiPicker
            label="Status"
            ariaLabel="Filtrar por status"
            values={filters.statuses}
            onChange={(statuses) => update({ statuses: statuses as Filters['statuses'] })}
            options={STATUSES.map((s) => ({
              value: s,
              label: STATUS_META[s].label,
              icon: <span className="option-dot" style={{ background: STATUS_META[s].color }} />,
            }))}
          />
          <MultiPicker
            label="Prioridade"
            ariaLabel="Filtrar por prioridade"
            values={filters.priorities}
            onChange={(priorities) => update({ priorities: priorities as Filters['priorities'] })}
            options={[...PRIORITIES].reverse().map((p) => ({ value: p, label: PRIORITY_META[p].label }))}
          />
          <DueFilter filters={filters} update={update} />
          <label className={`filter-toggle${filters.overdue ? ' active' : ''}`}>
            <input type="checkbox" className="checkbox" checked={filters.overdue} onChange={(e) => update({ overdue: e.target.checked })} />
            Somente atrasadas
          </label>
        </div>
      )}

      {chips.length > 0 && (
        <div className="active-filters" aria-label="Filtros ativos">
          {chips.map((c) => (
            <span key={c.key} className="filter-chip">
              <span className="truncate">{c.label}</span>
              <button type="button" onClick={c.remove} aria-label={`Remover filtro ${c.label}`}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

