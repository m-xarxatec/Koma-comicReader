import type { Queryable } from '../../db/pool.js';

// Único lugar con SQL de `chapter_reads`, `reading_credits`, `chapter_read_counts` y `ads`. snake_case en
// la BD, camelCase hacia fuera.

// Capítulos de esa lista que el usuario ya leyó (chapter_reads): la ficha los marca y no gastan saldo.
export async function findReadChapterIds(db: Queryable, userId: number, chapterIds: readonly number[]): Promise<Set<number>> {
  if (chapterIds.length === 0) return new Set();
  const { rows } = await db.query<{ chapter_id: number }>(
    'SELECT chapter_id FROM chapter_reads WHERE user_id = $1 AND chapter_id = ANY($2::int[])',
    [userId, chapterIds],
  );
  return new Set(rows.map((row) => row.chapter_id));
}

export interface AdRow {
  brand: string;
  body: string;
  imageKey: string | null; // null = tarjeta de texto
}

// Un anuncio activo al azar (RN-03); null si no hay ninguno (solo sin el seed).
export async function pickActiveAd(db: Queryable): Promise<AdRow | null> {
  const { rows } = await db.query<{ brand: string; body: string; image_key: string | null }>(
    'SELECT brand, body, image_key FROM ads WHERE active ORDER BY random() LIMIT 1',
  );
  const row = rows[0];
  return row ? { brand: row.brand, body: row.body, imageKey: row.image_key } : null;
}

// --- Saldo (RN-02) y anuncios del registrado (RN-03) ---

export const READING_SETTING_KEYS = ['reading.max_balance', 'reading.refill', 'reading.wait_minutes'] as const;
export type ReadingSettingKey = (typeof READING_SETTING_KEYS)[number];

// Valores en bruto (JSONB) de los parámetros de lectura de `settings` (RN-16); el servicio los valida.
export async function findReadingSettings(db: Queryable): Promise<Partial<Record<ReadingSettingKey, unknown>>> {
  const { rows } = await db.query<{ key: ReadingSettingKey; value: unknown }>('SELECT key, value FROM settings WHERE key = ANY($1::text[])', [
    READING_SETTING_KEYS,
  ]);
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

// CU-36 (RN-16): las filas de los parámetros bloqueadas hasta el final de la transacción, para comparar y guardar.
export async function findReadingSettingsForUpdate(db: Queryable): Promise<Partial<Record<ReadingSettingKey, unknown>>> {
  const { rows } = await db.query<{ key: ReadingSettingKey; value: unknown }>(
    'SELECT key, value FROM settings WHERE key = ANY($1::text[]) FOR UPDATE',
    [READING_SETTING_KEYS],
  );
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

// Inserta o actualiza un parámetro (el seed los crea; aquí se cubre también una BD sin ellos).
export async function saveSetting(db: Queryable, key: ReadingSettingKey, value: number): Promise<void> {
  await db.query(
    `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)],
  );
}

export interface CreditsRow {
  balance: number;
  periodStartedAt: Date | null; // NULL = lleno con el máximo vigente
  readsSinceAd: number;
}

// Fila de saldo del usuario, creada si no existe (primera lectura de cualquier capítulo: lleno con el máximo
// vigente, D1) y bloqueada hasta el final de la transacción: dos lecturas a la vez del mismo usuario se
// hacen una tras otra y no gastan dos veces el mismo saldo.
export async function lockCredits(db: Queryable, userId: number, maxBalance: number): Promise<CreditsRow> {
  await db.query('INSERT INTO reading_credits (user_id, balance) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING', [userId, maxBalance]);
  const { rows } = await db.query<{ balance: number; period_started_at: Date | null; reads_since_ad: number }>(
    'SELECT balance, period_started_at, reads_since_ad FROM reading_credits WHERE user_id = $1 FOR UPDATE',
    [userId],
  );
  const row = rows[0]!;
  return { balance: row.balance, periodStartedAt: row.period_started_at, readsSinceAd: row.reads_since_ad };
}

export async function updateCredits(db: Queryable, userId: number, credits: { balance: number; periodStartedAt: Date | null }): Promise<void> {
  await db.query('UPDATE reading_credits SET balance = $2, period_started_at = $3 WHERE user_id = $1', [userId, credits.balance, credits.periodStartedAt]);
}

// RN-03: primeras lecturas desde el último intersticial (caps. 1–2 incluidos; relecturas no). El valor lo
// calcula countReadForAd sobre la fila bloqueada por lockCredits en la misma transacción.
export async function updateReadsSinceAd(db: Queryable, userId: number, readsSinceAd: number): Promise<void> {
  await db.query('UPDATE reading_credits SET reads_since_ad = $2 WHERE user_id = $1', [userId, readsSinceAd]);
}

// Registra la lectura en chapter_reads: true si es la primera de ese usuario (fila nueva); si no, solo
// actualiza last_read_at. Seguro con lecturas simultáneas: la clave primaria decide cuál es la primera.
export async function recordChapterRead(db: Queryable, userId: number, chapterId: number): Promise<boolean> {
  const inserted = await db.query(
    'INSERT INTO chapter_reads (user_id, chapter_id) VALUES ($1, $2) ON CONFLICT (user_id, chapter_id) DO NOTHING RETURNING 1',
    [userId, chapterId],
  );
  if (inserted.rowCount === 1) return true;
  await db.query('UPDATE chapter_reads SET last_read_at = now() WHERE user_id = $1 AND chapter_id = $2', [userId, chapterId]);
  return false;
}

// Estadísticas por capítulo y día de Europe/Madrid, con suma atómica (modelo_datos.md, "Estadísticas"). La
// columna sale de una lista fija, nunca de la entrada.
const COUNT_READ_SQL = {
  user: `INSERT INTO chapter_read_counts (chapter_id, day, user_reads)
         VALUES ($1, (now() AT TIME ZONE 'Europe/Madrid')::date, 1)
         ON CONFLICT (chapter_id, day) DO UPDATE SET user_reads = chapter_read_counts.user_reads + 1`,
  guest: `INSERT INTO chapter_read_counts (chapter_id, day, guest_reads)
          VALUES ($1, (now() AT TIME ZONE 'Europe/Madrid')::date, 1)
          ON CONFLICT (chapter_id, day) DO UPDATE SET guest_reads = chapter_read_counts.guest_reads + 1`,
} as const;

export async function countRead(db: Queryable, chapterId: number, reader: keyof typeof COUNT_READ_SQL): Promise<void> {
  await db.query(COUNT_READ_SQL[reader], [chapterId]);
}

// RN-21: progreso de lectura. Solo UPDATE de una lectura ya registrada (nunca INSERT: no marca nada como leído) y el
// valor solo sube. Sin fila (nunca lo leyó), no escribe nada.
export async function recordLastPanel(db: Queryable, userId: number, chapterId: number, panel: number): Promise<void> {
  await db.query('UPDATE chapter_reads SET last_panel = GREATEST(COALESCE(last_panel, 0), $3) WHERE user_id = $1 AND chapter_id = $2', [
    userId,
    chapterId,
    panel,
  ]);
}
