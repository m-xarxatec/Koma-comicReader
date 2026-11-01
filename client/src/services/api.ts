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

async function request<T>(method: Method, path: string, body?: unknown): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin', // cookie de sesión httpOnly; el navegador añade Origin (control CSRF)
      headers: { Accept: 'application/json', ...(body !== undefined && { 'Content-Type': 'application/json' }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
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
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
