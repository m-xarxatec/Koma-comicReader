const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Escapa un dato antes de inyectarlo en HTML (texto o atributo entre comillas).
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}

// Rellena los marcadores {{clave}} de una plantilla HTML con valores siempre escapados.
// Los marcadores sin valor se dejan tal cual: así se notan en la página en vez de quedar vacíos.
export function fillTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (marker, key: string) =>
    Object.hasOwn(values, key) ? escapeHtml(values[key]!) : marker,
  );
}
