import { checkActivityTarget, isDemoEmail } from './demo-activity-guard.js';
import {
  ACTIVITY_ACCOUNTS,
  COMICS_PER_ACCOUNT,
  COMMENT_MIN_GAP_MS,
  GUEST_AD_CHAPTER,
  GUESTS_PER_PASS,
  MAX_NEW_CHAPTERS_PER_ACCOUNT,
  MAX_REGISTRATIONS_PER_PASS,
  MAX_RETRY_WAIT_MS,
  commentFor,
  guestChapters,
  maxPanel,
  pauseMs,
  pickComics,
  readingMs,
  retryDelayMs,
  type ActivityAccount,
  type PauseKind,
} from './demo-activity-plan.js';

// `npm run demo:activity` y `npm run demo:activity:online -- --confirm <host>`: una pasada de la actividad simulada
// de la demo (idea 24; docs/plan_mvp.md, «Pulido» → «Actividad simulada para la demo», D14–D21). Seis cuentas
// `actividad*@demo.test` y tres invitados leen, avanzan y comentan como lectores corrientes, con pausas de persona.
// Una pasada dura unos 15–20 minutos; la lanza el desarrollador, una al día antes de la demo (D20).
//
// PARA QUIEN AMPLÍE ESTO (léelo antes de tocar nada):
// - Reparto: demo-activity-guard.ts decide DÓNDE puede actuar; demo-activity-plan.ts decide QUÉ hace cada cuenta
//   (funciones puras, con tests); este archivo solo lo ejecuta: peticiones HTTP y esperas. Una acción nueva se añade
//   en ese orden: función pura + test en el plan, y aquí un paso pequeño que la llama.
// - Todo pasa por la API real, con la cookie de cada sesión y el Origin de APP_URL (control CSRF). Este archivo no
//   importa env.ts, el pool ni app, y nunca toca la BD. No lo metas en el Dockerfile, en server.ts ni en `npm start`.
// - Variables que lee: APP_URL y SEED_READER_PASSWORD (las carga --env-file en package.json). La contraseña no se
//   imprime nunca; tampoco las cookies.
// - Respeta los límites como un lector: ante un 429 o un READING_LIMIT espera a `retryAt` si es poco (MAX_RETRY_WAIT_MS)
//   y, si no, la cuenta lo deja para la siguiente pasada. No añadas reintentos en bucle.
// - Las esperas que protegen un límite real (el anuncio de RN-01 y los 15 s entre comentarios de RN-13) no se
//   aceleran con --fast: usan `sleep`, no `pause`.
// - Cómo probar un cambio: `npm run build && npm test` y, con la app local arrancada, `npm run demo:activity -- --fast`
//   (pausas casi a cero; solo en local). La pasada es repetible: no duplica comentarios ni vuelve a gastar saldo en
//   lo ya leído.
// - Fuera del contrato: ilustraciones, obras nuevas y escrituras en la BD (ver la cabecera de demo-activity-plan.ts).

// --fast: escala de las pausas para probar en local. A ritmo real, 1.
const FAST_SPEED = 0.02;
const DAY_MS = 86_400_000;
const REQUEST_TIMEOUT_MS = 30_000;

// --- Salida ---

const clock = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
function log(who: string, message: string): void {
  console.log(`${clock.format(new Date())}  ${who.padEnd(12)} ${message}`);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

// --- Argumentos ---

interface Options {
  mode: 'local' | 'online';
  confirm: string | undefined;
  fast: boolean;
}

// null = argumentos no válidos (se explica y se aborta).
function parseArgs(args: readonly string[]): Options | null {
  const options: Options = { mode: 'local', confirm: undefined, fast: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--online') options.mode = 'online';
    else if (arg === '--fast') options.fast = true;
    else if (arg === '--confirm') options.confirm = args[++index] ?? '';
    else return null;
  }
  return options;
}

// --- Sesión HTTP: una por cuenta o invitado, con sus propias cookies ---

interface ApiResponse {
  status: number; // 0 = sin respuesta (red caída o tiempo agotado)
  data: unknown;
  code: string | undefined; // `code` del error de la API
  retryAt: string | undefined;
}

class Session {
  private readonly cookies = new Map<string, string>();

  constructor(
    private readonly origin: string,
    readonly who: string,
  ) {}

  async request(method: 'GET' | 'POST', path: string, body?: unknown, headers: Readonly<Record<string, string>> = {}): Promise<ApiResponse> {
    let res: Response;
    try {
      res = await fetch(`${this.origin}${path}`, {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          ...headers,
          Accept: 'application/json',
          Origin: this.origin, // control CSRF: el mismo origen que APP_URL
          ...(this.cookies.size > 0 && { Cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ') }),
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
    } catch {
      return { status: 0, data: undefined, code: 'NETWORK_ERROR', retryAt: undefined };
    }
    this.storeCookies(res);
    let data: unknown = undefined;
    try {
      data = res.status === 204 ? undefined : await res.json();
    } catch {
      data = undefined;
    }
    const error = typeof data === 'object' && data !== null ? (data as { code?: unknown; retryAt?: unknown }) : {};
    return {
      status: res.status,
      data,
      code: typeof error.code === 'string' ? error.code : undefined,
      retryAt: typeof error.retryAt === 'string' ? error.retryAt : undefined,
    };
  }

  // Guarda `nombre=valor` de cada Set-Cookie; una cookie vacía (cierre de sesión) se borra.
  private storeCookies(res: Response): void {
    for (const line of res.headers.getSetCookie()) {
      const pair = line.split(';', 1)[0] ?? '';
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}

// --- Datos de la API que usa el script (duplicado mínimo de los DTO del contrato) ---

interface ChapterSummary {
  number: number;
  read: boolean;
}

const asRecord = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

// Slugs de todas las obras aprobadas del catálogo (D19), página a página.
async function catalogSlugs(session: Session): Promise<string[]> {
  const slugs: string[] = [];
  for (let page = 1; page <= 50; page++) {
    const res = await session.request('GET', `/api/comics?page=${page}`);
    if (res.status !== 200) break;
    const data = asRecord(res.data);
    const comics = asArray(data['comics']);
    for (const comic of comics) {
      const slug = asRecord(comic)['slug'];
      if (typeof slug === 'string') slugs.push(slug);
    }
    const total = typeof data['total'] === 'number' ? data['total'] : 0;
    if (comics.length === 0 || slugs.length >= total) break;
  }
  return slugs;
}

async function comicChapters(session: Session, slug: string): Promise<ChapterSummary[]> {
  const res = await session.request('GET', `/api/comics/${encodeURIComponent(slug)}`);
  if (res.status !== 200) return [];
  return asArray(asRecord(asRecord(res.data)['comic'])['chapters']).flatMap((chapter) => {
    const { number, read } = asRecord(chapter);
    return typeof number === 'number' ? [{ number, read: read === true }] : [];
  });
}

// Número de viñetas de una lectura correcta (ReadingDto.panels).
const panelCount = (res: ApiResponse): number => asArray(asRecord(asRecord(res.data)['reading'])['panels']).length;

// --- Contexto de la pasada ---

export interface Pass {
  origin: string;
  password: string;
  speed: number; // 1 = ritmo real
  day: number; // días desde 1970: cambia las obras de cada cuenta de un día a otro
  slugs: readonly string[];
  commentGapMs: number; // espera real entre dos comentarios de una cuenta (COMMENT_MIN_GAP_MS; RN-13)
  totals: { reads: number; guestReads: number; comments: number; progress: number };
}

// Pausa de persona, escalada por la velocidad (--fast). Las esperas que protegen un límite usan `sleep`.
const pause = (pass: Pass, kind: PauseKind, seed: string): Promise<void> => sleep(pauseMs(kind, seed, pass.speed));

// --- Cuentas: entrar o, si aún no existen, registrarse (D14, D15) ---

interface Enrollment {
  registered: number; // altas hechas en esta pasada
  blocked: boolean; // el registro respondió 429: no se intenta más en esta pasada
}

// Devuelve la sesión abierta, o null si la cuenta se queda para una pasada posterior.
async function signIn(pass: Pass, account: ActivityAccount, enrollment: Enrollment): Promise<Session | null> {
  if (!isDemoEmail(account.email)) return null; // nunca una cuenta de fuera de @demo.test
  const session = new Session(pass.origin, account.displayName);
  const login = await session.request('POST', '/api/auth/login', { email: account.email, password: pass.password });
  if (login.status === 200) {
    log(session.who, 'entra');
    return session;
  }
  if (login.status !== 401) {
    log(session.who, `no puede entrar (${login.status} ${login.code ?? ''}): se queda para otra pasada`);
    return null;
  }
  // 401: la cuenta aún no existe (o la contraseña no es la de SEED_READER_PASSWORD).
  if (enrollment.blocked || enrollment.registered >= MAX_REGISTRATIONS_PER_PASS) {
    log(session.who, 'aún sin cuenta: se registrará en una pasada posterior (RN-13: 3 altas por hora)');
    return null;
  }
  const register = await session.request('POST', '/api/auth/register', { ...account, password: pass.password });
  if (register.status === 201) {
    enrollment.registered += 1;
    log(session.who, 'se registra');
    return session;
  }
  if (register.status === 429) {
    enrollment.blocked = true;
    log(session.who, 'el registro está limitado ahora: las altas que faltan, en otra pasada (al menos 1 h después)');
    return null;
  }
  // 409: el correo existe pero el login falló: la contraseña de la cuenta no es la de este entorno.
  log(session.who, `no se pudo registrar (${register.status} ${register.code ?? ''}): revisa SEED_READER_PASSWORD`);
  return null;
}

// --- Una cuenta: lee, avanza y comenta ---

// Lee un capítulo. Con el saldo agotado (READING_LIMIT) o un 429, espera a retryAt una vez si es poco tiempo.
async function readChapter(session: Session, slug: string, number: number, headers: Readonly<Record<string, string>> = {}): Promise<ApiResponse> {
  const path = `/api/comics/${encodeURIComponent(slug)}/chapters/${number}/read`;
  const first = await session.request('POST', path, undefined, headers);
  if (first.code !== 'READING_LIMIT' && first.status !== 429) return first;
  const wait = retryDelayMs(first.retryAt, Date.now(), MAX_RETRY_WAIT_MS);
  if (wait === null) return first;
  log(session.who, `sin saldo de lectura: espera ${Math.ceil(wait / 1000)} s`);
  await sleep(wait);
  return session.request('POST', path, undefined, headers);
}

// true si la cuenta ya tiene un comentario en esa viñeta (para no duplicarlo en otra pasada).
async function hasOwnComment(session: Session, panelPath: string): Promise<boolean> {
  for (let page = 1; page <= 20; page++) {
    const res = await session.request('GET', `${panelPath}?page=${page}`);
    if (res.status !== 200) return true; // ante la duda, no se comenta
    const data = asRecord(res.data);
    const comments = asArray(data['comments']);
    if (comments.some((comment) => asRecord(comment)['mine'] === true)) return true;
    const pageSize = typeof data['pageSize'] === 'number' ? data['pageSize'] : comments.length;
    const total = typeof data['total'] === 'number' ? data['total'] : 0;
    if (comments.length === 0 || page * pageSize >= total) return false;
  }
  return true;
}

async function accountPass(pass: Pass, session: Session, index: number): Promise<void> {
  const seed = `${index}:${pass.day}`;
  let newReads = 0;
  let lastCommentAt = 0;

  reading: for (const slug of pickComics(index, pass.day, pass.slugs, COMICS_PER_ACCOUNT)) {
    await pause(pass, 'browse', `${seed}:${slug}`);
    const chapters = await comicChapters(session, slug);
    log(session.who, `abre «${slug}» (${chapters.length} capítulos)`);

    for (const chapter of chapters) {
      if (chapter.read) continue; // ya leído en otra pasada
      if (newReads >= MAX_NEW_CHAPTERS_PER_ACCOUNT) break reading;
      const key = `${seed}:${slug}:${chapter.number}`;
      await pause(pass, 'think', key);

      const read = await readChapter(session, slug, chapter.number);
      if (read.status !== 200) {
        if (read.code === 'READING_LIMIT') {
          log(session.who, 'se queda sin saldo de lectura: sigue en la próxima pasada (RN-02)');
          break reading;
        }
        log(session.who, `no puede leer el cap. ${chapter.number} de «${slug}» (${read.status} ${read.code ?? ''})`);
        continue;
      }
      newReads += 1;
      pass.totals.reads += 1;
      const panels = panelCount(read);
      if (panels === 0) continue;

      // Lee hasta su viñeta máxima (unos 6 de cada 10 llegan al final) y envía el progreso (RN-21).
      const reached = maxPanel(index, slug, chapter.number, panels);
      log(session.who, `lee el cap. ${chapter.number} de «${slug}» hasta la viñeta ${reached} de ${panels}`);
      await sleep(readingMs(reached, key, pass.speed));
      const chapterPath = `/api/comics/${encodeURIComponent(slug)}/chapters/${chapter.number}`;
      const progress = await session.request('POST', `${chapterPath}/progress`, { panel: reached });
      if (progress.status === 204) pass.totals.progress += 1;

      // Comenta solo algunos capítulos, una viñeta que ha visto y si no tiene ya un comentario en ella (RN-11).
      const comment = commentFor(index, slug, chapter.number, reached);
      if (!comment) continue;
      const panelPath = `${chapterPath}/panels/${comment.position}/comments`;
      if (await hasOwnComment(session, panelPath)) continue;
      await pause(pass, 'think', `${key}:comment`);
      await sleep(lastCommentAt + pass.commentGapMs - Date.now()); // RN-13: 15 s reales entre comentarios
      const posted = await session.request('POST', panelPath, { body: comment.body });
      lastCommentAt = Date.now();
      if (posted.status === 201) {
        pass.totals.comments += 1;
        log(session.who, `comenta la viñeta ${comment.position}: «${comment.body}»`);
      } else {
        log(session.who, `no pudo comentar (${posted.status} ${posted.code ?? ''})`);
      }
    }
  }

  await pause(pass, 'think', `${seed}:logout`);
  await session.request('POST', '/api/auth/logout');
  log(session.who, 'cierra la sesión');
}

// --- Un invitado: caps. libres y el del anuncio (RN-01; D18) ---

async function guestPass(pass: Pass, guest: number): Promise<void> {
  const session = new Session(pass.origin, `Invitado ${guest + 1}`);
  // Una obra por invitado, en rotación tras las de las cuentas.
  const slug = pickComics(ACTIVITY_ACCOUNTS.length + guest, pass.day, pass.slugs, 1)[0];
  if (slug === undefined) return;
  const seed = `guest:${guest}:${pass.day}:${slug}`;
  await pause(pass, 'browse', seed);
  const numbers = guestChapters((await comicChapters(session, slug)).map((chapter) => chapter.number));
  log(session.who, `abre «${slug}»`);

  for (const number of numbers) {
    await pause(pass, 'think', `${seed}:${number}`);
    let headers: Record<string, string> = {};
    if (number === GUEST_AD_CHAPTER) {
      // El cap. 3 exige ver el anuncio entero: se pide el token y se espera el mínimo real (no se acelera con --fast).
      const ad = await session.request('GET', `/api/comics/${encodeURIComponent(slug)}/ad`);
      const { adToken, minSeconds } = asRecord(ad.data);
      if (ad.status !== 200 || typeof adToken !== 'string' || typeof minSeconds !== 'number') {
        log(session.who, `no pudo empezar el anuncio (${ad.status}): deja el cap. ${number}`);
        continue;
      }
      log(session.who, `ve el anuncio (${minSeconds} s)`);
      await sleep(minSeconds * 1000 + 1500);
      headers = { 'X-Ad-Token': adToken };
    }
    const read = await readChapter(session, slug, number, headers);
    if (read.status !== 200) {
      log(session.who, `no puede leer el cap. ${number} (${read.status} ${read.code ?? ''})`);
      continue;
    }
    pass.totals.guestReads += 1;
    const panels = panelCount(read);
    log(session.who, `lee el cap. ${number} de «${slug}» (${panels} viñetas)`);
    await sleep(readingMs(panels, `${seed}:${number}`, pass.speed));
  }
}

// --- Pasada ---

export interface PassResult {
  sessions: number; // cuentas que han actuado
  registered: number; // altas de esta pasada
  failed: number; // sesiones que terminaron con un error inesperado
}

// Las sesiones de una pasada sobre las obras de `pass.slugs`. Exportada para probarla contra el servidor de tests con
// obras propias (tests/api/demo-activity.test.ts); `main` le pasa el catálogo entero.
export async function runSessions(pass: Pass): Promise<PassResult> {
  // Las altas y las entradas, una detrás de otra (el registro se limita por IP); después, todos a la vez.
  const enrollment: Enrollment = { registered: 0, blocked: false };
  const sessions: { session: Session; index: number }[] = [];
  for (const [index, account] of ACTIVITY_ACCOUNTS.entries()) {
    const session = await signIn(pass, account, enrollment);
    if (session) sessions.push({ session, index });
    await pause(pass, 'think', `signin:${index}`);
  }

  // Cuentas e invitados actúan a la vez, cada uno a su ritmo y empezando escalonados: en los comentarios y en la
  // auditoría la actividad sale mezclada, no una cuenta detrás de otra.
  const stagger = (position: number) => sleep(position * pauseMs('browse', `stagger:${position}`, pass.speed));
  const tasks = [
    ...sessions.map(({ session, index }, position) => stagger(position).then(() => accountPass(pass, session, index))),
    ...Array.from({ length: GUESTS_PER_PASS }, (_unused, guest) => stagger(guest + 1).then(() => guestPass(pass, guest))),
  ];
  const results = await Promise.allSettled(tasks);
  return { sessions: sessions.length, registered: enrollment.registered, failed: results.filter((result) => result.status === 'rejected').length };
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  if (!options) {
    console.error('Uso: npm run demo:activity [-- --fast]  ·  npm run demo:activity:online -- --confirm <host de APP_URL>');
    return 1;
  }
  const password = process.env['SEED_READER_PASSWORD'];
  const target = checkActivityTarget({ mode: options.mode, appUrl: process.env['APP_URL'], confirm: options.confirm, password });
  if (!target.ok) {
    console.error(`demo:activity no se ejecuta: ${target.reason}.`);
    return 1;
  }
  if (options.fast && options.mode !== 'local') {
    console.error('demo:activity no se ejecuta: --fast es solo para probar en local.');
    return 1;
  }
  if (password === undefined) return 1; // la guarda ya lo exige; aquí solo estrecha el tipo

  log('pasada', `destino: ${target.host} (${options.mode}${options.fast ? ', rápido' : ''})`);
  const probe = new Session(target.origin, 'pasada');
  const health = await probe.request('GET', '/api/health');
  if (health.status !== 200) {
    console.error(`demo:activity no se ejecuta: /api/health respondió ${health.status === 0 ? 'sin conexión' : health.status}. ¿Está la app arrancada?`);
    return 1;
  }
  const slugs = await catalogSlugs(probe);
  if (slugs.length === 0) {
    console.error('demo:activity no se ejecuta: el catálogo no tiene obras aprobadas (importa contenido antes).');
    return 1;
  }
  log('pasada', `${slugs.length} obras en el catálogo`);

  const pass: Pass = {
    origin: target.origin,
    password,
    speed: options.fast ? FAST_SPEED : 1,
    day: Math.floor(Date.now() / DAY_MS),
    slugs,
    commentGapMs: COMMENT_MIN_GAP_MS,
    totals: { reads: 0, guestReads: 0, comments: 0, progress: 0 },
  };
  const result = await runSessions(pass);

  const { reads, guestReads, comments, progress } = pass.totals;
  log('pasada', `fin: ${result.sessions} de ${ACTIVITY_ACCOUNTS.length} cuentas, ${result.registered} altas, ${reads} lecturas, ${progress} envíos de progreso, ${comments} comentarios y ${guestReads} lecturas de invitado`);
  if (result.sessions < ACTIVITY_ACCOUNTS.length) log('pasada', 'faltan cuentas por registrar: repite la pasada al menos 1 h después');
  if (result.failed > 0) log('pasada', `${result.failed} sesiones terminaron con un error inesperado`);
  return result.failed > 0 ? 1 : 0;
}

if (import.meta.main) process.exitCode = await main();
