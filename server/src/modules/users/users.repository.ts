import type { Queryable } from '../../db/pool.js';

// Único lugar con SQL de `users`. Recibe un Queryable (pool o el client de una transacción).

export type Role = 'user' | 'admin';
export type UserStatus = 'active' | 'suspended';

export interface User {
  id: number;
  email: string;
  passwordHash: string; // nunca sale del servidor ni va a la auditoría
  displayName: string;
  role: Role;
  isAuthor: boolean;
  status: UserStatus;
  tokenVersion: number;
  premiumUntil: Date | null;
  stripeCustomerId: string | null; // nunca sale del servidor ni va a la auditoría
  createdAt: Date;
}

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  role: Role;
  is_author: boolean;
  status: UserStatus;
  token_version: number;
  premium_until: Date | null;
  stripe_customer_id: string | null;
  created_at: Date;
}

const COLUMNS = 'id, email, password_hash, display_name, role, is_author, status, token_version, premium_until, stripe_customer_id, created_at';

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    role: row.role,
    isAuthor: row.is_author,
    status: row.status,
    tokenVersion: row.token_version,
    premiumUntil: row.premium_until,
    stripeCustomerId: row.stripe_customer_id,
    createdAt: row.created_at,
  };
}

export async function findById(db: Queryable, id: number): Promise<User | null> {
  const { rows } = await db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

// El correo se compara sin distinguir mayúsculas (índice único sobre lower(email), RN-12).
export async function findByEmail(db: Queryable, email: string): Promise<User | null> {
  const { rows } = await db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE lower(email) = lower($1)`, [email]);
  return rows[0] ? toUser(rows[0]) : null;
}

export interface NewUser {
  email: string;
  passwordHash: string;
  displayName: string;
}

// null si el correo ya existe: ON CONFLICT evita la carrera entre comprobar e insertar.
export async function insert(db: Queryable, user: NewUser): Promise<User | null> {
  const { rows } = await db.query<UserRow>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT ((lower(email))) DO NOTHING
     RETURNING ${COLUMNS}`,
    [user.email, user.passwordHash, user.displayName],
  );
  return rows[0] ? toUser(rows[0]) : null;
}

// Cambiar el estado incrementa token_version: las sesiones abiertas dejan de valer (RN-15).
export async function updateStatus(db: Queryable, id: number, status: UserStatus): Promise<User | null> {
  const { rows } = await db.query<UserRow>(
    `UPDATE users SET status = $2, token_version = token_version + 1
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [id, status],
  );
  return rows[0] ? toUser(rows[0]) : null;
}

// Fila bloqueada hasta el final de la transacción: el perfil compara el nombre anterior con el nuevo.
export async function findByIdForUpdate(db: Queryable, id: number): Promise<User | null> {
  const { rows } = await db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1 FOR UPDATE`, [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function updateDisplayName(db: Queryable, id: number, displayName: string): Promise<User | null> {
  const { rows } = await db.query<UserRow>(
    `UPDATE users SET display_name = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, displayName],
  );
  return rows[0] ? toUser(rows[0]) : null;
}

// RN-15: el hash nuevo incrementa token_version (las demás sesiones dejan de valer). Solo si token_version sigue
// siendo el de la sesión que pidió el cambio: si otra petición la invalidó entretanto (otro cambio de
// contraseña, una suspensión), no se cambia nada y devuelve null.
export async function updatePassword(db: Queryable, id: number, passwordHash: string, tokenVersion: number): Promise<User | null> {
  const { rows } = await db.query<UserRow>(
    `UPDATE users SET password_hash = $2, token_version = token_version + 1
     WHERE id = $1 AND token_version = $3 AND status = 'active'
     RETURNING ${COLUMNS}`,
    [id, passwordHash, tokenVersion],
  );
  return rows[0] ? toUser(rows[0]) : null;
}

// "En Koma desde" del panel del autor (RN-19): la fecha de alta de la cuenta.
export async function findCreatedAt(db: Queryable, id: number): Promise<Date | null> {
  const { rows } = await db.query<{ created_at: Date }>('SELECT created_at FROM users WHERE id = $1', [id]);
  return rows[0]?.created_at ?? null;
}

// --- Bloque 4: premium (RN-04) ---

// Lo recalcula applySubscription con la fila del usuario bloqueada.
export async function updatePremiumUntil(db: Queryable, id: number, premiumUntil: Date | null): Promise<User> {
  const { rows } = await db.query<UserRow>(`UPDATE users SET premium_until = $2 WHERE id = $1 RETURNING ${COLUMNS}`, [id, premiumUntil]);
  return toUser(rows[0]!);
}

export async function findByStripeCustomerId(db: Queryable, customerId: string): Promise<User | null> {
  const { rows } = await db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE stripe_customer_id = $1`, [customerId]);
  return rows[0] ? toUser(rows[0]) : null;
}

// Solo si aún no tiene: de dos checkouts a la vez, gana el primero y el segundo usa ese cliente (devuelve el
// guardado, que puede no ser el que se le pasó).
export async function setStripeCustomerIdIfMissing(db: Queryable, id: number, customerId: string): Promise<string | null> {
  await db.query('UPDATE users SET stripe_customer_id = $2 WHERE id = $1 AND stripe_customer_id IS NULL', [id, customerId]);
  const { rows } = await db.query<{ stripe_customer_id: string | null }>('SELECT stripe_customer_id FROM users WHERE id = $1', [id]);
  return rows[0]?.stripe_customer_id ?? null;
}

// --- Bloque 4: gestión de usuarios (CU-35; RN-14, RN-15) ---

export interface UserSearch {
  q: string; // ya escapado para ILIKE ('' = sin filtro): correo y nombre visible
  role: 'user' | 'author' | 'admin' | null; // author = is_author
  status: UserStatus | null;
  limit: number;
  offset: number;
}

// Fragmento fijo; los datos van en $1 a $3. role=user son las cuentas sin admin ni autor.
const SEARCH_WHERE = `($1 = '' OR email ILIKE '%' || $1 || '%' OR display_name ILIKE '%' || $1 || '%')
  AND ($2::text IS NULL
       OR ($2 = 'admin' AND role = 'admin')
       OR ($2 = 'author' AND is_author)
       OR ($2 = 'user' AND role = 'user' AND NOT is_author))
  AND ($3::text IS NULL OR status = $3)`;

export async function search(db: Queryable, filter: UserSearch): Promise<{ total: number; users: User[] }> {
  const params = [filter.q, filter.role, filter.status];
  const count = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM users WHERE ${SEARCH_WHERE}`, params);
  const { rows } = await db.query<UserRow>(
    `SELECT ${COLUMNS} FROM users WHERE ${SEARCH_WHERE} ORDER BY created_at DESC, id DESC LIMIT $4 OFFSET $5`,
    [...params, filter.limit, filter.offset],
  );
  return { total: count.rows[0]?.total ?? 0, users: rows.map(toUser) };
}

// RN-14: ids de los admins activos, bloqueados (en orden de id, para que dos cambios a la vez no se crucen) hasta
// el final de la transacción.
export async function lockActiveAdminIds(db: Queryable): Promise<number[]> {
  const { rows } = await db.query<{ id: number }>(`SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY id FOR UPDATE`);
  return rows.map((row) => row.id);
}

// RN-15: cambiar el rol incrementa token_version (las sesiones abiertas dejan de valer, D8).
export async function updateRole(db: Queryable, id: number, role: Role): Promise<User> {
  const { rows } = await db.query<UserRow>(
    `UPDATE users SET role = $2, token_version = token_version + 1 WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, role],
  );
  return toUser(rows[0]!);
}

// D8: el rol de autor no cierra sesiones (los permisos se leen de la BD en cada petición).
export async function updateIsAuthor(db: Queryable, id: number, isAuthor: boolean): Promise<User> {
  const { rows } = await db.query<UserRow>(`UPDATE users SET is_author = $2 WHERE id = $1 RETURNING ${COLUMNS}`, [id, isAuthor]);
  return toUser(rows[0]!);
}
