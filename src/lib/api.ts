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

/** Multipart upload with progress reporting (fetch has no upload progress events). */
export function upload<T>(url: string, files: File[], onProgress?: (ratio: number) => void): Promise<ApiResult<T>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${url}`);
    if (actor) xhr.setRequestHeader('X-Actor-Id', actor);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new ApiError(0, 'Falha de conexão durante o envio.'));
    xhr.onload = () => {
      let body: { error?: string } | T | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON response */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        const version = xhr.getResponseHeader('x-data-version');
        resolve({ data: body as T, version: version ? Number(version) : null });
      } else {
        const message = (body as { error?: string } | null)?.error ?? `Erro ${xhr.status} ao enviar arquivo.`;
        reject(new ApiError(xhr.status, message));
      }
    };
    const form = new FormData();
    files.forEach((f) => form.append('files', f, f.name));
    xhr.send(form);
  });
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Ocorreu um erro inesperado.';
}

export function attachmentUrl(taskId: string, attachmentId: string, download = false) {
  return `/api/tasks/${taskId}/attachments/${attachmentId}${download ? '?download' : ''}`;
}
