// Plan de una pasada de la actividad simulada (idea 24; docs/plan_mvp.md, «Pulido» → «Actividad simulada para la
// demo», D14–D21). Solo funciones puras y deterministas: sin red, sin reloj y sin azar. demo-activity.ts las ejecuta
// contra la API real. Sus tests: tests/unit/demo-activity-plan.test.ts.
//
// PARA QUIEN AMPLÍE ESTO (léelo antes de tocar nada):
// - Todo es determinista a propósito: la misma cuenta, obra y capítulo dan siempre la misma viñeta máxima, el mismo
//   comentario y las mismas pausas. Así una pasada repetida no duplica comentarios ni cambia datos, y se puede probar
//   sin servidor. No uses Math.random() ni Date.now() aquí: si necesitas variedad, deriva un valor de `unit(semilla)`.
// - Cada decisión nueva = una función pura aquí + su test + una llamada en demo-activity.ts. No metas lógica de
//   decisión en el script: allí solo hay peticiones HTTP y esperas.
// - Los límites de la plataforma (RN-13) mandan: 3 altas / h por IP, 5 comentarios / min por usuario, 60 envíos de
//   progreso / min. Las constantes de abajo los respetan con margen; si subes el volumen, revisa RN-13 antes.
// - Fuera del contrato hoy (necesitan aprobación del desarrollador y un cambio en docs/plan_mvp.md antes de
//   construirse): subir ilustraciones a /comunidad (D14 del bloque 6: las sube el desarrollador), crear obras o
//   capítulos (D19: el script no crea obras) y cualquier escritura directa en la BD (todo va por la API).
//   Idea para las ilustraciones cuando se aprueben: una función `illustrationFor(cuenta, día)` que elija un archivo
//   de una carpeta local y su título de una lista fija, y un paso `shareIllustration` en demo-activity.ts con
//   `POST /api/illustrations` (multipart); nacen pendientes y el admin las aprueba a mano.

// --- Cuentas (D14–D17) ---

export interface ActivityAccount {
  email: string; // siempre @demo.test (demo-activity-guard.ts)
  displayName: string; // nombre visible natural (D16)
}

export const ACTIVITY_ACCOUNTS: readonly ActivityAccount[] = [
  { email: 'actividad1@demo.test', displayName: 'Lucía_lee' },
  { email: 'actividad2@demo.test', displayName: 'MarcoV' },
  { email: 'actividad3@demo.test', displayName: 'Nerea Sol' },
  { email: 'actividad4@demo.test', displayName: 'DaniTinta' },
  { email: 'actividad5@demo.test', displayName: 'Sara R.' },
  { email: 'actividad6@demo.test', displayName: 'Leo Campos' },
];

// RN-13: el registro admite 3 altas por hora y por IP. Las que falten se registran en otra pasada, al menos 1 h después.
export const MAX_REGISTRATIONS_PER_PASS = 3;
// D18: invitados por pasada, cada uno con su propia cookie.
export const GUESTS_PER_PASS = 3;
// RN-13 (5 comentarios / min por usuario): al menos 15 s entre dos comentarios de la misma cuenta.
export const COMMENT_MIN_GAP_MS = 15_000;
// Obras que abre cada cuenta en una pasada y capítulos nuevos que intenta leer como mucho (el saldo de RN-02 suele
// cortar antes). Subirlos alarga la pasada: el plan pide unos 15–20 minutos (D20).
export const COMICS_PER_ACCOUNT = 2;
export const MAX_NEW_CHAPTERS_PER_ACCOUNT = 4;
// Espera máxima ante un 429 o un READING_LIMIT: si hay que esperar más, la cuenta lo deja para la siguiente pasada.
export const MAX_RETRY_WAIT_MS = 90_000;

// --- Azar determinista ---

// Un número de 0 a 2³² − 1 a partir de un texto: FNV-1a de 32 bits y una mezcla final (la de MurmurHash3).
// La mezcla final es necesaria: sin ella, el último carácter de la semilla (el número de capítulo) casi no cambiaba
// los bits altos y una cuenta hacía lo mismo en todos los capítulos de una obra (hay un test que lo comprueba).
function hash(seed: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return value >>> 0;
}

// Un valor en [0, 1) que depende solo de la semilla.
const unit = (seed: string): number => hash(seed) / 0x1_0000_0000;

// --- Lectura y punto de abandono (RN-21) ---

// Proporción de lecturas que llegan a la última viñeta («unos 6 de cada 10»).
const REACH_END_SHARE = 0.6;

// Viñeta máxima que ve una cuenta en un capítulo: la última en unos 6 de cada 10; si no, una anterior.
export function maxPanel(account: number, slug: string, chapter: number, panels: number): number {
  if (panels <= 1) return 1;
  const key = [account, slug, chapter].join(':');
  if (unit('end:' + key) < REACH_END_SHARE) return panels;
  return 1 + Math.floor(unit('drop:' + key) * (panels - 1)); // de 1 a panels − 1
}

// --- Comentarios (RN-11) ---

// Textos fijos, de lector corriente. Para añadir más: frases cortas, sin nombres propios ni datos de una obra
// concreta (valen para cualquier viñeta), de 1 a 500 caracteres y sin repetir (el test lo comprueba).
export const COMMENT_TEXTS: readonly string[] = [
  'Esta viñeta me ha encantado.',
  'No me esperaba este giro para nada.',
  'El dibujo de esta parte es una pasada.',
  'Me he reído más de lo que debería.',
  'Qué bien usados están los colores aquí.',
  'Necesito el siguiente capítulo ya.',
  'Vaya cara se le ha quedado, jajaja.',
  'Este personaje cada vez me cae mejor.',
  'Uf, qué tensión.',
  'Me ha recordado a cuando empecé a leer cómics.',
  'El detalle del fondo es buenísimo, fijaos bien.',
  'He tenido que volver atrás para entenderlo, pero merece la pena.',
  'Ojalá dure muchos capítulos más.',
  'Esta escena está muy bien llevada.',
  'No sé si reír o llorar con esto.',
  'La composición de esta página es preciosa.',
  'Aquí se nota el cariño que le pone quien lo dibuja.',
  'Me quedo con esta frase.',
  '¿Soy la única persona que no lo vio venir?',
  'Qué buen ritmo lleva la historia.',
  'Lo he leído dos veces seguidas.',
  'Esto promete mucho.',
  'Me gusta cómo cierra el capítulo.',
  'Pequeño detalle, gran viñeta.',
  'De lo mejor que he leído esta semana.',
  'Se lo voy a pasar a mis amigos.',
];

// Parte de los capítulos leídos que una cuenta comenta (uno de cada tres, más o menos).
const COMMENT_SHARE = 0.33;

export interface PlannedComment {
  position: number; // viñeta, entre las que la cuenta ha visto
  body: string;
}

// El comentario de una cuenta en un capítulo, o null si no comenta. `reached` es su viñeta máxima (maxPanel): nunca
// comenta una viñeta que no ha visto. El script comprueba antes que la cuenta no tenga ya uno en esa viñeta.
export function commentFor(account: number, slug: string, chapter: number, reached: number): PlannedComment | null {
  const key = [account, slug, chapter].join(':');
  if (reached < 1 || unit('comment:' + key) >= COMMENT_SHARE) return null;
  return {
    position: 1 + Math.floor(unit('position:' + key) * reached),
    body: COMMENT_TEXTS[hash('body:' + key) % COMMENT_TEXTS.length]!,
  };
}

// --- Obras (D19) ---

// Las obras que abre una cuenta en la pasada de un día (`day` = días desde 1970, lo calcula el script): consecutivas
// en el catálogo, empezando en un punto que cambia con la cuenta y con el día. Sin repetir; con menos obras que
// `count`, las que haya. El script no crea obras: solo lee las aprobadas que devuelve el catálogo.
export function pickComics(account: number, day: number, slugs: readonly string[], count: number): string[] {
  const total = slugs.length;
  if (total === 0) return [];
  const start = (((account + day) % total) + total) % total;
  return Array.from({ length: Math.min(count, total) }, (_unused, offset) => slugs[(start + offset) % total]!);
}

// --- Invitados (RN-01; D18) ---

// Capítulos que lee un invitado: el 1 y el 2 (libres) y el 3 (tras ver el anuncio completo). Nunca el 4: exige cuenta.
export const GUEST_AD_CHAPTER = 3;
export function guestChapters(numbers: readonly number[]): number[] {
  return numbers.filter((number) => number >= 1 && number <= GUEST_AD_CHAPTER).sort((a, b) => a - b);
}

// --- Ritmo (D20) ---

// Pausas de persona, en milisegundos. `think`: entre dos acciones seguidas (abrir una obra, pasar de capítulo,
// escribir un comentario). `browse`: curioseando el catálogo o la ficha antes de empezar a leer.
const PAUSES = {
  think: { min: 3_000, max: 9_000 },
  browse: { min: 6_000, max: 20_000 },
} as const;
export type PauseKind = keyof typeof PAUSES;

// Tiempo de lectura por viñeta y tope por capítulo (para que una pasada no pase de unos 20 minutos).
const READ_PER_PANEL = { min: 2_000, max: 5_000 } as const;
const READ_MAX_MS = 90_000;

// `speed` escala todas las esperas: 1 = ritmo real; `--fast` usa un valor pequeño, solo para probar en local.
// La semilla hace que cada pausa dure distinto y que la misma pausa dure siempre igual.
export function pauseMs(kind: PauseKind, seed: string, speed: number): number {
  const { min, max } = PAUSES[kind];
  return Math.round((min + unit(['pause', kind, seed].join(':')) * (max - min)) * speed);
}

// Cuánto «tarda en leer» una cuenta las viñetas que ve de un capítulo.
export function readingMs(panels: number, seed: string, speed: number): number {
  const perPanel = READ_PER_PANEL.min + unit('read:' + seed) * (READ_PER_PANEL.max - READ_PER_PANEL.min);
  return Math.round(Math.min(Math.max(panels, 1) * perPanel, READ_MAX_MS) * speed);
}

// --- Límites (RN-02, RN-13) ---

// Margen sobre `retryAt`, por si los relojes no coinciden al milisegundo.
const RETRY_MARGIN_MS = 1_000;

// Cuánto esperar ante un 429 o un READING_LIMIT con `retryAt` (ISO 8601). null = no esperar: sin fecha válida o
// más que `maxMs`; la cuenta lo deja para la siguiente pasada.
export function retryDelayMs(retryAt: string | undefined, now: number, maxMs: number): number | null {
  const at = Date.parse(retryAt ?? '');
  if (Number.isNaN(at)) return null;
  const delay = Math.max(0, at - now) + RETRY_MARGIN_MS;
  return delay > maxMs ? null : delay;
}
