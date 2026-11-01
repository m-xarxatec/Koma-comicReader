import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Queryable } from '../../db/pool.js';
import { record, type AuditEntry } from '../../modules/audit/audit.service.js';

// BD falsa: guarda las consultas en vez de ejecutarlas.
function fakeDb() {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = { query: async (sql: string, params: unknown[]) => (calls.push({ sql, params }), { rows: [] }) };
  return { db: db as unknown as Queryable, calls };
}

const base: AuditEntry = {
  action: 'user.register',
  actorId: 7,
  entityType: 'users',
  entityId: '7',
  ip: '127.0.0.1',
  requestId: '00000000-0000-4000-8000-000000000000',
};

test('Seguridad: la auditoría guarda la entrada con SQL parametrizado', async () => {
  const { db, calls } = fakeDb();
  await record(db, { ...base, after: { email: 'ana@demo.test', displayName: 'Ana' } });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.sql, /INSERT INTO audit_log/);
  assert.ok(calls[0]!.params.includes(JSON.stringify({ email: 'ana@demo.test', displayName: 'Ana' })));
});

test('Seguridad: la auditoría lanza un error (no descarta en silencio) ante pass, hash, token, secret, card, cvc e iban', async () => {
  const forbidden = [
    { after: { password: 'x' } }, // pass
    { before: { passwordHash: 'x' } }, // hash
    { after: { resetToken: 'x' } }, // token
    { after: { clientSecret: 'x' } }, // secret
    { after: { cardLast4: '4242' } }, // card
    { after: { cvc: '123' } }, // cvc
    { before: { IBAN: 'ES00' } }, // iban, sin distinguir mayúsculas
    { after: { profile: { stripeToken: 'x' } } }, // también anidado
    { after: { token_version: 2 } }, // el fragmento `token` atrapa también token_version (anotado en el filtro)
  ];
  for (const fields of forbidden) {
    const { db, calls } = fakeDb();
    await assert.rejects(record(db, { ...base, ...fields }), /no puede guardarse/, JSON.stringify(fields));
    assert.equal(calls.length, 0, `no se escribe nada: ${JSON.stringify(fields)}`);
  }
});
