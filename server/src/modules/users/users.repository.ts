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
}

const COLUMNS = 'id, email, password_hash, display_name, role, is_author, status, token_version, premium_until';

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
