// Funciones puras del control CSRF por `Origin` (sin `env`: los tests unitarios las importan sin .env).

// Un origen exacto, tal como lo envía el navegador en `Origin`: http(s)://host[:puerto], en minúsculas,
// sin ruta, barra final, credenciales, puerto por defecto ni comodines.
export function isValidOrigin(value: string): boolean {
  if (value.includes('*')) return false; // la URL de WHATWG admite `*` en el host
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
}

// Sin `Origin` no se acepta: ningún navegador actual lo omite en una petición que modifica datos.
export function isAllowedOrigin(origin: string | undefined, allowed: ReadonlySet<string>): boolean {
  return origin !== undefined && allowed.has(origin);
}
