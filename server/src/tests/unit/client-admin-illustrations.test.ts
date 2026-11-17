import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { paths } from '../../config/paths.js';
import { adminIllustrationsQuery } from '../../modules/illustrations/illustrations.schema.js';

// Sección «Ilustraciones» de /admin (CU-32; RN-22; contrato del bloque 6, D9): las peticiones del cliente y qué
// acciones ofrece cada estado. Se carga el JS compilado (client/dist) y se sustituye fetch por uno que guarda la petición.

type Action = 'approve' | 'reject' | 'withdraw';
interface ClientAdminService {
  listIllustrations: (params: Readonly<Record<string, string | number>>) => Promise<unknown>;
  reviewIllustration: (id: number, decision: 'approve' | 'reject', reason?: string) => Promise<unknown>;
}
interface ClientAdminUtils {
  ILLUSTRATION_REVIEW_STATUSES: readonly string[];
  illustrationActions: (status: string) => readonly Action[];
}
interface ClientIllustrationsService {
  withdrawIllustration: (id: number) => Promise<unknown>;
}

const load = <T>(file: string) => import(pathToFileURL(path.join(paths.clientDistDir, file)).href) as Promise<T>;
const service = await load<ClientAdminService>('services/admin.js');
const utils = await load<ClientAdminUtils>('utils/admin.js');
const illustrations = await load<ClientIllustrationsService>('services/illustrations.js');

function captureFetch(t: { mock: { method: (object: object, name: 'fetch', impl: (url: string, init: RequestInit) => Promise<Response>) => unknown } }) {
  const sent: { url: string; init: RequestInit }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(null, { status: 204 });
  });
  return sent;
}

test('RN-22: (D9) la lista del admin pide /api/admin/illustrations con el estado y la página, sin filtros vacíos', async (t) => {
  const sent = captureFetch(t);
  await service.listIllustrations({ status: 'pending', page: 1 });
  await service.listIllustrations({ status: 'approved', page: 3 });
  await service.listIllustrations({ status: '', page: 2 });
  assert.deepEqual(
    sent.map(({ url, init }) => `${init.method} ${url}`),
    ['GET /api/admin/illustrations?status=pending&page=1', 'GET /api/admin/illustrations?status=approved&page=3', 'GET /api/admin/illustrations?page=2'],
  );
});

test('RN-22: (D9) aprobar no lleva cuerpo, rechazar envía solo el motivo y retirar usa la ruta común', async (t) => {
  const sent = captureFetch(t);
  await service.reviewIllustration(7, 'approve');
  await service.reviewIllustration(7, 'reject', 'No es una ilustración');
  await illustrations.withdrawIllustration(7);
  assert.deepEqual(
    sent.map(({ url, init }) => `${init.method} ${url}`),
    ['POST /api/admin/illustrations/7/approve', 'POST /api/admin/illustrations/7/reject', 'POST /api/illustrations/7/withdraw'],
  );
  assert.equal(sent[0]?.init.body, undefined);
  assert.deepEqual(JSON.parse(String(sent[1]?.init.body)), { reason: 'No es una ilustración' });
  assert.equal(sent[2]?.init.body, undefined);
});

test('RN-22: (D9) una pendiente se aprueba, se rechaza o se retira; una publicada solo se retira; el resto, nada', () => {
  assert.deepEqual(utils.illustrationActions('pending'), ['approve', 'reject', 'withdraw']);
  assert.deepEqual(utils.illustrationActions('approved'), ['withdraw']);
  assert.deepEqual(utils.illustrationActions('rejected'), []);
  assert.deepEqual(utils.illustrationActions('otro'), []);
});

test('RN-22: (D9) los estados del filtro del cliente son los que admite el servidor, con «pending» el primero', () => {
  assert.deepEqual([...utils.ILLUSTRATION_REVIEW_STATUSES], ['pending', 'approved']);
  for (const status of utils.ILLUSTRATION_REVIEW_STATUSES) assert.equal(adminIllustrationsQuery.safeParse({ status }).success, true, status);
  assert.equal(adminIllustrationsQuery.safeParse({ status: 'rejected' }).success, false);
  assert.equal(adminIllustrationsQuery.parse({}).status, utils.ILLUSTRATION_REVIEW_STATUSES[0]);
});
