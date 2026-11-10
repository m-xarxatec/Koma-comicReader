// Todas las peticiones del cliente pasan por aquí. Nunca lanza por errores HTTP: devuelve un ApiResult.

export interface ApiError {
  code: string; // 'VALIDATION_ERROR', 'READING_LIMIT'… (tabla de errores del plan); 'NETWORK_ERROR' solo en el cliente
  message: string; // texto para el usuario
  fields?: Record<string, string>; // errores por campo (400)
  retryAt?: string; // ISO 8601, en READING_LIMIT y RATE_LIMITED
  requestId: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ApiError };

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

// Opciones por petición. Las llamadas que no las pasan no cambian.
export interface RequestOptions {
  headers?: Readonly<Record<string, string>>; // p. ej. X-Ad-Token en la lectura del cap. 3 (RN-01)
  keepalive?: boolean; // la petición sigue aunque se cierre la página (progreso de lectura, RN-21)
}

// Sin respuesta del servidor (red caída, servidor apagado): status 0 y un código propio del cliente.
const NETWORK_ERROR: ApiError = {
  code: 'NETWORK_ERROR',
  message: 'No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.',
  requestId: '',
};

function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) return false;
  const { code, message } = value as Record<string, unknown>;
  return typeof code === 'string' && typeof message === 'string';
}

async function request<T>(method: Method, path: string, body?: unknown, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin', // cookie de sesión httpOnly; el navegador añade Origin (control CSRF)
      // FormData (subida de imágenes, contrato del bloque 3): el navegador pone el Content-Type multipart con su
      // boundary; cualquier otro cuerpo va como JSON.
      headers: { ...options.headers, Accept: 'application/json', ...(body !== undefined && !isForm && { 'Content-Type': 'application/json' }) },
      ...(body !== undefined && { body: isForm ? body : JSON.stringify(body) }),
      ...(options.keepalive && { keepalive: true }),
    });
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }

  const requestId = res.headers.get('X-Request-Id') ?? '';
  let payload: unknown = undefined;
  if (res.status !== 204) {
    try {
      payload = await res.json();
    } catch {
      payload = undefined;
    }
  }

  if (res.ok) return { ok: true, data: payload as T };
  if (isApiError(payload)) return { ok: false, status: res.status, error: { ...payload, requestId: payload.requestId || requestId } };
  // Error sin cuerpo JSON (p. ej. un proxy delante del servidor)
  return {
    ok: false,
    status: res.status,
    error: { code: 'INTERNAL_ERROR', message: 'El servidor respondió de forma inesperada. Inténtalo de nuevo.', requestId },
  };
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, body, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, undefined, options),
};
