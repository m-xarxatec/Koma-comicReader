import type { Queryable } from '../../db/pool.js';
import { MADRID_TODAY } from '../comics/comics.repository.js';

// Estadísticas globales del admin (CU-39; RN-20; contrato del bloque 5). Único lugar con su SQL; solo lectura y solo
// agregados (ningún correo ni nombre de usuario). Ventanas de días: días naturales de Europe/Madrid con hoy
// incluido, como RN-19 (`day > hoy - n`, y una fecha se pasa antes a su día de Madrid). La única ventana móvil es la
// de horas de los eventos de la auditoría.

// Día de Madrid de una columna timestamptz, para compararlo con MADRID_TODAY.
const madridDay = (column: string) => `(${column} AT TIME ZONE 'Europe/Madrid')::date`;

export interface StatsWindows {
  shortDays: number; // 7
  longDays: number; // 30
  recentHours: number; // 24
  topComics: number; // 5
}

export interface WindowCounts {
  total: number;
  lastShort: number;
  lastLong: number;
}

export interface PlatformCountsRow {
  today: string; // 'YYYY-MM-DD' en Europe/Madrid
  readers: number;
  authors: number;
  admins: number;
  suspended: number;
  premium: number;
  activeLong: number;
  comics: number;
  chapters: number;
  commentsShort: number;
  moderatedShort: number;
  auditRecent: number;
}

// Cuentas: las activas por su rol y las suspendidas aparte (cada cuenta, una sola vez). Premium y usuarios activos,
// solo cuentas activas y no admin. Moderados: comentarios distintos con comment.hide o comment.delete (no
// comment.delete_own); uno ocultado y después eliminado cuenta una vez.
export async function countPlatform(db: Queryable, windows: StatsWindows): Promise<PlatformCountsRow> {
  const { rows } = await db.query<{
    today: string;
    readers: number;
    authors: number;
    admins: number;
    suspended: number;
    premium: number;
    active_long: number;
    comics: number;
    chapters: number;
    comments_short: number;
    moderated_short: number;
    audit_recent: number;
  }>(
    `SELECT to_char(${MADRID_TODAY}, 'YYYY-MM-DD') AS today,
            (SELECT count(*) FROM users WHERE status = 'active' AND role = 'user' AND NOT is_author)::int AS readers,
            (SELECT count(*) FROM users WHERE status = 'active' AND role = 'user' AND is_author)::int AS authors,
            (SELECT count(*) FROM users WHERE status = 'active' AND role = 'admin')::int AS admins,
            (SELECT count(*) FROM users WHERE status = 'suspended')::int AS suspended,
            (SELECT count(*) FROM users WHERE status = 'active' AND role <> 'admin' AND premium_until > now())::int AS premium,
            (SELECT count(*) FROM users u
              WHERE u.status = 'active' AND u.role <> 'admin'
                AND EXISTS (SELECT 1 FROM chapter_reads cr
                             WHERE cr.user_id = u.id AND ${madridDay('cr.last_read_at')} > ${MADRID_TODAY} - $2::int))::int AS active_long,
            (SELECT count(*) FROM comics WHERE status = 'approved' AND deleted_at IS NULL)::int AS comics,
            (SELECT count(*) FROM chapters ch JOIN comics co ON co.id = ch.comic_id
              WHERE ch.status = 'approved' AND ch.deleted_at IS NULL
                AND co.status = 'approved' AND co.deleted_at IS NULL)::int AS chapters,
            (SELECT count(*) FROM comments WHERE ${madridDay('created_at')} > ${MADRID_TODAY} - $1::int)::int AS comments_short,
            (SELECT count(DISTINCT entity_id) FROM audit_log
              WHERE action IN ('comment.hide', 'comment.delete')
                AND ${madridDay('created_at')} > ${MADRID_TODAY} - $1::int)::int AS moderated_short,
            (SELECT count(*) FROM audit_log WHERE created_at > now() - make_interval(hours => $3::int))::int AS audit_recent`,
    [windows.shortDays, windows.longDays, windows.recentHours],
  );
  const row = rows[0]!;
  return {
    today: row.today,
    readers: row.readers,
    authors: row.authors,
    admins: row.admins,
    suspended: row.suspended,
    premium: row.premium,
    activeLong: row.active_long,
    comics: row.comics,
    chapters: row.chapters,
    commentsShort: row.comments_short,
    moderatedShort: row.moderated_short,
    auditRecent: row.audit_recent,
  };
}

// Lecturas de toda la plataforma (RN-19 para todas las obras): capítulos approved sin retirar de obras sin retirar.
export async function sumPlatformReads(db: Queryable, windows: StatsWindows): Promise<{ guests: WindowCounts; users: WindowCounts }> {
  const { rows } = await db.query<{
    guests_total: number;
    guests_short: number;
    guests_long: number;
    users_total: number;
    users_short: number;
    users_long: number;
  }>(
    `SELECT COALESCE(sum(r.guest_reads), 0)::int AS guests_total,
            COALESCE(sum(r.guest_reads) FILTER (WHERE r.day > ${MADRID_TODAY} - $1::int), 0)::int AS guests_short,
            COALESCE(sum(r.guest_reads) FILTER (WHERE r.day > ${MADRID_TODAY} - $2::int), 0)::int AS guests_long,
            COALESCE(sum(r.user_reads), 0)::int AS users_total,
            COALESCE(sum(r.user_reads) FILTER (WHERE r.day > ${MADRID_TODAY} - $1::int), 0)::int AS users_short,
            COALESCE(sum(r.user_reads) FILTER (WHERE r.day > ${MADRID_TODAY} - $2::int), 0)::int AS users_long
     FROM chapter_read_counts r
     JOIN chapters ch ON ch.id = r.chapter_id AND ch.status = 'approved' AND ch.deleted_at IS NULL
     JOIN comics co ON co.id = ch.comic_id AND co.deleted_at IS NULL`,
    [windows.shortDays, windows.longDays],
  );
  const row = rows[0]!;
  return {
    guests: { total: row.guests_total, lastShort: row.guests_short, lastLong: row.guests_long },
    users: { total: row.users_total, lastShort: row.users_short, lastLong: row.users_long },
  };
}

export interface TopComicRow {
  slug: string;
  title: string;
  reads: WindowCounts;
}

// Obras approved sin retirar con alguna lectura: por lecturas de la ventana larga, después total y después slug
// (desempate determinista). Como mucho `topComics`.
export async function listTopComics(db: Queryable, windows: StatsWindows): Promise<TopComicRow[]> {
  const { rows } = await db.query<{ slug: string; title: string; total: number; last_short: number; last_long: number }>(
    `SELECT co.slug, co.title,
            sum(r.guest_reads + r.user_reads)::int AS total,
            COALESCE(sum(r.guest_reads + r.user_reads) FILTER (WHERE r.day > ${MADRID_TODAY} - $1::int), 0)::int AS last_short,
            COALESCE(sum(r.guest_reads + r.user_reads) FILTER (WHERE r.day > ${MADRID_TODAY} - $2::int), 0)::int AS last_long
     FROM comics co
     JOIN chapters ch ON ch.comic_id = co.id AND ch.status = 'approved' AND ch.deleted_at IS NULL
     JOIN chapter_read_counts r ON r.chapter_id = ch.id
     WHERE co.status = 'approved' AND co.deleted_at IS NULL
     GROUP BY co.id
     HAVING sum(r.guest_reads + r.user_reads) > 0
     ORDER BY last_long DESC, total DESC, co.slug ASC
     LIMIT $3`,
    [windows.shortDays, windows.longDays, windows.topComics],
  );
  return rows.map((row) => ({ slug: row.slug, title: row.title, reads: { total: row.total, lastShort: row.last_short, lastLong: row.last_long } }));
}
