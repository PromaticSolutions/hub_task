import { useRef, useState, type DragEvent } from 'react';
import { Download, File, FileArchive, FileImage, FileSpreadsheet, FileText, Paperclip, Trash2, Upload, X } from 'lucide-react';
import type { Attachment, Task } from '../../../shared/types';
import { attachmentUrl, errorMessage } from '../../lib/api';
import { timeAgo, formatDateTime } from '../../lib/dates';
import { useData } from '../../store/data';
import { confirmAction, toast } from '../../store/ui';
import { useMembersById } from '../../hooks/useLookups';

export const MAX_FILE_SIZE = 25 * 1024 * 1024;
const PREVIEWABLE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function FileIcon({ mime, name }: { mime: string; name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (mime.startsWith('image/')) return <FileImage size={18} />;
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return <FileSpreadsheet size={18} />;
  if (['zip', 'rar', '7z', 'gz', 'tar'].includes(ext)) return <FileArchive size={18} />;
  if (mime.startsWith('text/') || ['pdf', 'doc', 'docx', 'odt', 'txt', 'md'].includes(ext)) return <FileText size={18} />;
  return <File size={18} />;
}

/** Splits valid files from those over the size limit, warning about the rejected ones. */
export function acceptFiles(list: FileList | File[]): File[] {
  const files = Array.from(list);
  const tooBig = files.filter((f) => f.size > MAX_FILE_SIZE);
  if (tooBig.length) toast.error(`${tooBig.map((f) => f.name).join(', ')}: arquivo maior que 25 MB.`);
  const ok = files.filter((f) => f.size <= MAX_FILE_SIZE);
  if (ok.length > 10) {
    toast.error('Envie no máximo 10 arquivos por vez.');
    return ok.slice(0, 10);
  }
  return ok;
}

function Dropzone({ onFiles, busy, progress }: { onFiles: (files: File[]) => void; busy: boolean; progress: number | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (busy) return;
    const files = acceptFiles(e.dataTransfer.files);
    if (files.length) onFiles(files);
  };
  return (
    <div
      className={`dropzone${over ? ' over' : ''}${busy ? ' busy' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      {busy ? (
        <div className="dropzone-progress">
          <span className="spinner" />
          <span>Enviando{progress !== null ? ` ${Math.round(progress * 100)}%` : '...'}</span>
          <div className="progress">
            <div className="progress-bar" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          </div>
        </div>
      ) : (
        <>
          <Upload size={18} />
          <span>
            Arraste arquivos aqui ou{' '}
            <button type="button" className="text-link" onClick={() => input.current?.click()}>
              escolha no computador
            </button>
          </span>
          <small className="muted">Até 25 MB por arquivo</small>
        </>
      )}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = e.target.files ? acceptFiles(e.target.files) : [];
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}

function AttachmentRow({ task, attachment }: { task: Task; attachment: Attachment }) {
  const deleteAttachment = useData((s) => s.deleteAttachment);
  const membersById = useMembersById();
  const [busy, setBusy] = useState(false);
  const uploader = attachment.uploadedBy ? membersById.get(attachment.uploadedBy) : null;
  const preview = PREVIEWABLE.has(attachment.mimeType);
  const url = attachmentUrl(task.id, attachment.id);

  const remove = async () => {
    const ok = await confirmAction({
      title: 'Remover anexo?',
      message: `O arquivo "${attachment.name}" será removido desta tarefa permanentemente.`,
      confirmLabel: 'Remover anexo',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteAttachment(task.id, attachment.id);
      toast.success('Anexo removido.');
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <li className="attachment">
      <a className="attachment-thumb" href={url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${attachment.name}`}>
        {preview ? <img src={url} alt="" loading="lazy" /> : <FileIcon mime={attachment.mimeType} name={attachment.name} />}
      </a>
      <div className="attachment-info">
        <a className="attachment-name truncate" href={url} target="_blank" rel="noopener noreferrer" title={attachment.name}>
          {attachment.name}
        </a>
        <span className="attachment-meta muted" title={formatDateTime(attachment.uploadedAt)}>
          {formatSize(attachment.size)} · {timeAgo(attachment.uploadedAt)}
          {uploader ? ` · ${uploader.name}` : ''}
        </span>
      </div>
      <a className="icon-btn sm" href={attachmentUrl(task.id, attachment.id, true)} download={attachment.name} aria-label={`Baixar ${attachment.name}`} title="Baixar">
        <Download size={15} />
      </a>
      <button type="button" className="icon-btn sm danger" onClick={remove} disabled={busy} aria-label={`Remover ${attachment.name}`} title="Remover">
        {busy ? <span className="spinner" /> : <Trash2 size={15} />}
      </button>
    </li>
  );
}

export function TaskAttachments({ task }: { task: Task }) {
  const uploadAttachments = useData((s) => s.uploadAttachments);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (files: File[]) => {
    setBusy(true);
    setProgress(0);
    try {
      await uploadAttachments(task.id, files, setProgress);
      toast.success(files.length > 1 ? `${files.length} arquivos anexados.` : 'Arquivo anexado.');
    } catch (err) {
      toast.error(`Falha no envio: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <section className="tm-section">
      <div className="tm-section-head">
        <Paperclip size={16} />
        <h3>Anexos</h3>
        {task.attachments.length > 0 && <span className="count-pill">{task.attachments.length}</span>}
      </div>
      {task.attachments.length > 0 && (
        <ul className="attachments">
          {task.attachments.map((a) => (
            <AttachmentRow key={a.id} task={task} attachment={a} />
          ))}
        </ul>
      )}
      <Dropzone onFiles={send} busy={busy} progress={progress} />
    </section>
  );
}

/** Files chosen while creating a task; uploaded right after the task exists. */
export function PendingAttachments({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  return (
    <section className="tm-section">
      <div className="tm-section-head">
        <Paperclip size={16} />
        <h3>Anexos</h3>
        {files.length > 0 && <span className="count-pill">{files.length}</span>}
      </div>
      {files.length > 0 && (
        <ul className="attachments">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="attachment">
              <span className="attachment-thumb">
                <FileIcon mime={f.type} name={f.name} />
              </span>
              <div className="attachment-info">
                <span className="attachment-name truncate">{f.name}</span>
                <span className="attachment-meta muted">{formatSize(f.size)} · será enviado ao criar a tarefa</span>
              </div>
              <button type="button" className="icon-btn sm danger" onClick={() => onChange(files.filter((_, j) => j !== i))} aria-label={`Remover ${f.name}`}>
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Dropzone onFiles={(more) => onChange([...files, ...more].slice(0, 10))} busy={false} progress={null} />
    </section>
  );
}
