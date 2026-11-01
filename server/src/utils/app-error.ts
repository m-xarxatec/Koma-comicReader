// Códigos de la tabla "Errores: códigos, páginas y depuración" de docs/plan_mvp.md.
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'ACCOUNT_SUSPENDED'
  | 'READING_LIMIT'
  | 'AD_NOT_COMPLETED'
  | 'CSRF'
  | 'NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'CONFLICT'
  | 'GONE'
  | 'FILE_TOO_LARGE' // solo imágenes
  | 'PAYLOAD_TOO_LARGE' // cuerpo de la petición
  | 'UNSUPPORTED_FILE'
  | 'UNSUPPORTED_MEDIA_TYPE' // charset o codificación del cuerpo no admitidos
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

// Mensaje de todo 500: el detalle va en `cause`, que solo llega al log.
export const INTERNAL_ERROR_MESSAGE = 'Ha ocurrido un error inesperado';

export interface AppErrorDetails {
  fields?: Record<string, string>; // errores por campo (400)
  retryAt?: Date; // READING_LIMIT y RATE_LIMITED
  cause?: unknown; // error original; solo va al log
}

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly fields: Record<string, string> | undefined;
  readonly retryAt: Date | undefined;

  constructor(status: number, code: ErrorCode, message: string, details: AppErrorDetails = {}) {
    super(message, { cause: details.cause });
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.fields = details.fields;
    this.retryAt = details.retryAt;
  }
}
