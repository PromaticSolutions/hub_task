export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let actor: string | null = null;

/** Identifies who performs the actions (no authentication in this version). */
export function setActor(id: string | null) {
  actor = id;
}

export interface ApiResult<T> {
  data: T;
  version: number | null;
}

function headers(json: boolean): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (actor) h['X-Actor-Id'] = actor;
  return h;
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    return new ApiError(res.status, body.error ?? 'Não foi possível concluir a operação.');
  } catch {
    return new ApiError(res.status, `Erro ${res.status} ao falar com o servidor.`);
  }
}

export async function request<T>(method: string, url: string, body?: unknown): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`/api${url}`, {
      method,
      headers: headers(body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Verifique se a API está em execução.');
  }
  if (!res.ok) throw await parseError(res);
  const version = res.headers.get('x-data-version');
  return { data: (await res.json()) as T, version: version ? Number(version) : null };
}

/** Sends raw bytes to a (signed) upload URL with progress reporting — fetch has no upload progress events. */
function putFile(url: string, file: File, headers: Record<string, string>, onProgress?: (ratio: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new ApiError(0, `Falha de conexão ao enviar "${file.name}".`));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Erro ${xhr.status} ao enviar "${file.name}".`;
      try {
        const body = JSON.parse(xhr.responseText);
        message = body.error ?? body.message ?? message;
      } catch {
        /* non-JSON response */
      }
      reject(new ApiError(xhr.status, message));
    };
    xhr.send(file);
  });
}

/**
 * Uploads one attachment: the API signs an upload URL, the browser sends the bytes straight to
 * storage (Supabase in production, so large files skip the serverless body limit), then the API registers it.
 */
export async function uploadAttachment<T>(taskId: string, file: File, onProgress?: (ratio: number) => void): Promise<ApiResult<T>> {
  const meta = { name: file.name, size: file.size, mimeType: file.type || 'application/octet-stream' };
  const { data: sign } = await request<{ storedName: string; uploadUrl: string; headers: Record<string, string> }>(
    'POST',
    `/tasks/${taskId}/attachments/sign`,
    meta,
  );
  await putFile(sign.uploadUrl, file, sign.headers, onProgress);
  return request<T>('POST', `/tasks/${taskId}/attachments`, { ...meta, storedName: sign.storedName });
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Ocorreu um erro inesperado.';
}

export function attachmentUrl(taskId: string, attachmentId: string, download = false) {
  return `/api/tasks/${taskId}/attachments/${attachmentId}${download ? '?download' : ''}`;
}
