import { useState } from 'react';
import { Archive, ArchiveRestore, ArrowRightLeft, Trash2, UserRound, X } from 'lucide-react';
import { STATUSES, type BulkAction } from '../../../shared/types';
import { STATUS_META } from '../../lib/constants';
import { errorMessage } from '../../lib/api';
import { useData } from '../../store/data';
import { confirmAction, toast } from '../../store/ui';
import { Avatar } from '../ui/Avatar';
import { MenuItem, Popover } from '../ui/Popover';

interface BulkBarProps {
  ids: string[];
  onClear: () => void;
  archivedMode?: boolean;
}

export function BulkBar({ ids, onClear, archivedMode }: BulkBarProps) {
  const bulk = useData((s) => s.bulk);
  const members = useData((s) => s.members);
  const [busy, setBusy] = useState(false);
  const count = ids.length;

  const run = async (action: BulkAction, success: string) => {
    setBusy(true);
    try {
      await bulk(ids, action);
      toast.success(success);
      onClear();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirmAction({
      title: `Excluir ${count} tarefa${count > 1 ? 's' : ''}?`,
      message: 'As tarefas selecionadas, seus comentários e anexos serão excluídos permanentemente. Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir definitivamente',
    });
    if (ok) await run({ type: 'delete' }, `${count} tarefa${count > 1 ? 's excluídas' : ' excluída'}.`);
  };

  return (
    <div className="bulk-bar" role="toolbar" aria-label="Ações em lote">
      <span className="bulk-count">
        <strong>{count}</strong> selecionada{count > 1 ? 's' : ''}
      </span>
      <span className="bulk-sep" />
      {!archivedMode && (
        <>
          <Popover
            width={210}
            trigger={({ toggle, ref }) => (
              <button type="button" ref={ref} className="btn btn-ghost btn-sm" onClick={toggle} disabled={busy}>
                <ArrowRightLeft size={15} /> <span className="hide-sm">Mover para</span>
              </button>
            )}
          >
            {(close) => (
              <div className="menu">
                <div className="menu-title">Alterar status</div>
                {STATUSES.map((s) => (
                  <MenuItem
                    key={s}
                    icon={<span className="badge-dot" style={{ background: STATUS_META[s].color }} />}
                    onClick={() => {
                      close();
                      void run({ type: 'status', status: s }, `Status alterado para ${STATUS_META[s].label}.`);
                    }}
                  >
                    {STATUS_META[s].label}
                  </MenuItem>
                ))}
              </div>
            )}
          </Popover>
          <Popover
            width={240}
            trigger={({ toggle, ref }) => (
              <button type="button" ref={ref} className="btn btn-ghost btn-sm" onClick={toggle} disabled={busy}>
                <UserRound size={15} /> <span className="hide-sm">Responsável</span>
              </button>
            )}
          >
            {(close) => (
              <div className="menu">
                <div className="menu-title">Definir responsável</div>
                <div className="menu-scroll">
                  <MenuItem
                    icon={<Avatar member={null} size="sm" />}
                    onClick={() => {
                      close();
                      void run({ type: 'assignee', assigneeId: null }, 'Responsável removido.');
                    }}
                  >
                    Sem responsável
                  </MenuItem>
                  {members.map((m) => (
                    <MenuItem
                      key={m.id}
                      icon={<Avatar member={m} size="sm" />}
                      onClick={() => {
                        close();
                        void run({ type: 'assignee', assigneeId: m.id }, `Tarefas atribuídas a ${m.name}.`);
                      }}
                    >
                      {m.name}
                    </MenuItem>
                  ))}
                </div>
              </div>
            )}
          </Popover>
        </>
      )}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={busy}
        onClick={() =>
          run(
            { type: 'archive', archived: !archivedMode },
            archivedMode ? `${count} tarefa(s) restaurada(s).` : `${count} tarefa(s) arquivada(s).`,
          )
        }
      >
        {archivedMode ? <ArchiveRestore size={15} /> : <Archive size={15} />}
        <span className="hide-sm">{archivedMode ? 'Restaurar' : 'Arquivar'}</span>
      </button>
      <button type="button" className="btn btn-danger-ghost btn-sm" onClick={remove} disabled={busy}>
        <Trash2 size={15} /> <span className="hide-sm">Excluir</span>
      </button>
      <span className="bulk-sep" />
      <button type="button" className="icon-btn sm bulk-close" onClick={onClear} aria-label="Limpar seleção" title="Limpar seleção">
        {busy ? <span className="spinner" /> : <X size={16} />}
      </button>
    </div>
  );
}
