import assert from 'node:assert/strict';
import { before, mock, test, type Mock } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import Stripe from 'stripe';
import { INTERNAL_ERROR_MESSAGE } from '../../utils/app-error.js';
import { SESSION_COOKIE, startTestServer } from './helpers.js';

// Prueba mínima del webhook de Stripe (bloque 1). Driver `stripe` con valores inventados, que no son de
// ninguna cuenta: la firma se genera aquí con el mismo secreto. Se fijan antes de que before() importe
// `app`, porque config/env.ts lee las variables al cargarse; cada archivo de test corre en su propio proceso.
const WEBHOOK_SECRET = 'whsec_koma-tests-falso';
process.env.PAYMENTS_DRIVER = 'stripe';
process.env.STRIPE_SECRET_KEY = 'sk_test_koma-tests-falsa';
process.env.STRIPE_PRICE_ID = 'price_koma-tests';
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.LOG_LEVEL = 'info'; // el test del log lee las líneas info

const srv = startTestServer();

// Desde el bloque 4 el webhook consulta la suscripción en Stripe (syncSubscription): aquí, sin red, la de un
// cliente que no es de Koma, así que se registra el evento y se responde 200 sin tocar nada más. La
// sincronización de verdad se prueba en stripe-sync.test.ts.
before(async () => {
  const { payments } = await import('../../integrations/payments/index.js');
  mock.method(payments, 'retrieveSubscription', async (id: string) => ({
    providerSubscriptionId: id,
    customerId: 'cus_koma_ajeno',
    status: 'active' as const,
    currentPeriodEnd: new Date(Date.now() + 86_400_000),
    cancelAtPeriodEnd: false,
  }));
});

const WEBHOOK_PATH = '/api/stripe/webhook';
const KB = 1024;
const CUSTOMER_EMAIL = 'cliente-secreto@demo.test'; // dato del cuerpo que nunca debe llegar al log
const now = () => Math.floor(Date.now() / 1000);

function eventPayload(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'evt_koma_test',
    object: 'event',
    api_version: '2026-10-28.endive',
    created: now(),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: 'customer.subscription.created',
    data: { object: { id: 'sub_koma_test', object: 'subscription', customer_email: CUSTOMER_EMAIL, ...extra } },
  });
}

const sign = (payload: string, options: { secret?: string; timestamp?: number } = {}) =>
  Stripe.webhooks.generateTestHeaderString({ payload, secret: options.secret ?? WEBHOOK_SECRET, timestamp: options.timestamp ?? now() });

function postWebhook(body: string, headers: Record<string, string> = {}) {
  return fetch(`${srv.baseUrl}${WEBHOOK_PATH}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
}

test('Seguridad: el webhook de Stripe acepta un evento firmado sin Origin o con uno ajeno (exento de CSRF) y no pasa por la sesión', async () => {
  for (const origin of [undefined, 'http://evil.test']) {
    const payload = eventPayload();
    const res = await postWebhook(payload, {
      'Stripe-Signature': sign(payload),
      Cookie: `${SESSION_COOKIE}=basura`, // si pasara por `auth`, la borraría con Set-Cookie
      ...(origin && { Origin: origin }),
    });
    assert.equal(res.status, 200, `Origin ${origin}`);
    assert.deepEqual(await res.json(), { received: true });
    assert.equal(res.headers.get('set-cookie'), null, 'no pasa por auth');
  }
});

test('Seguridad: firma ausente, falsa, de otro secreto, caducada o de otro cuerpo, y cuerpo no JSON, dan 400 VALIDATION_ERROR', async () => {
  const payload = eventPayload();
  const cases: [name: string, body: string, headers: Record<string, string>][] = [
    ['sin Stripe-Signature', payload, {}],
    ['firma inventada', payload, { 'Stripe-Signature': `t=${now()},v1=${'0'.repeat(64)}` }],
    ['cabecera mal formada', payload, { 'Stripe-Signature': 'basura' }],
    ['firmado con otro secreto', payload, { 'Stripe-Signature': sign(payload, { secret: 'whsec_otro-secreto' }) }],
    ['caducada (10 min)', payload, { 'Stripe-Signature': sign(payload, { timestamp: now() - 600 }) }],
    ['cuerpo cambiado tras firmar', payload.replace('"livemode":false', '"livemode":true'), { 'Stripe-Signature': sign(payload) }],
    ['cuerpo no JSON', payload, { 'Stripe-Signature': sign(payload), 'Content-Type': 'text/plain' }],
  ];
  for (const [name, body, headers] of cases) {
    const res = await postWebhook(body, headers);
    const json = (await res.json()) as { code: string; message: string; requestId: string };
    assert.equal(res.status, 400, name);
    assert.equal(json.code, 'VALIDATION_ERROR', name);
    assert.equal(json.message, 'Firma del webhook no válida', name);
    assert.equal(json.requestId, res.headers.get('x-request-id'), name);
  }
});

test('Seguridad: el webhook lee el cuerpo crudo con el límite general: un evento de más de 100 kB da 413', async () => {
  const payload = eventPayload({ description: 'x'.repeat(101 * KB) });
  const res = await postWebhook(payload, { 'Stripe-Signature': sign(payload) });
  assert.equal(res.status, 413);
  assert.equal(((await res.json()) as { code: string }).code, 'PAYLOAD_TOO_LARGE');
});

// Líneas JSON del log (stdout y stderr) con este requestId; espera a la línea `request`, que se escribe al
// terminar la respuesta.
type LogLine = Record<string, unknown>;
async function logLines(spies: Mock<(...args: never[]) => unknown>[], requestId: string): Promise<{ raw: string; lines: LogLine[] }> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const raw = spies
      .flatMap((spy) => spy.mock.calls.map((call) => String(call.arguments[0])))
      .filter((chunk) => chunk.startsWith('{') && chunk.includes(requestId));
    const lines = raw.map((chunk) => JSON.parse(chunk) as LogLine);
    if (lines.some((line) => line['msg'] === 'request')) return { raw: raw.join(''), lines };
    await sleep(5);
  }
  assert.fail(`Sin línea de log de la petición ${requestId}`);
}

test('Seguridad: el log del webhook lleva id, tipo, livemode y apiVersion del evento, y nunca la firma ni el cuerpo', async (t) => {
  const spies = [t.mock.method(process.stdout, 'write'), t.mock.method(process.stderr, 'write')] as unknown as Mock<
    (...args: never[]) => unknown
  >[];
  const payload = eventPayload();
  const signature = sign(payload);
  const forged = `t=${now()},v1=${'f'.repeat(64)}`;

  const ok = await postWebhook(payload, { 'Stripe-Signature': signature });
  assert.equal(ok.status, 200);
  const okLog = await logLines(spies, ok.headers.get('x-request-id') ?? '');
  const verified = okLog.lines.find((line) => line['msg'] === 'Webhook de Stripe verificado');
  assert.deepEqual(
    verified && { level: verified['level'], eventId: verified['eventId'], type: verified['type'], livemode: verified['livemode'], apiVersion: verified['apiVersion'] },
    { level: 'info', eventId: 'evt_koma_test', type: 'customer.subscription.created', livemode: false, apiVersion: '2026-10-28.endive' },
  );
  assert.ok(okLog.lines.some((line) => line['msg'] === 'request' && line['status'] === 200 && line['route'] === WEBHOOK_PATH));

  const bad = await postWebhook(payload, { 'Stripe-Signature': forged });
  assert.equal(bad.status, 400);
  const badLog = await logLines(spies, bad.headers.get('x-request-id') ?? '');
  const warning = badLog.lines.find((line) => line['msg'] === 'Firma del webhook no válida');
  assert.equal(warning?.['level'], 'warn');
  assert.equal(typeof warning?.['reason'], 'string', 'lleva el motivo que da Stripe');
  assert.ok(badLog.lines.some((line) => line['msg'] === 'request' && line['status'] === 400 && line['code'] === 'VALIDATION_ERROR'));

  // Ni la cabecera (con su firma), ni nada del cuerpo, en ninguna línea de las dos peticiones.
  const logged = okLog.raw + badLog.raw;
  for (const secret of [signature, signature.split('v1=')[1] ?? signature, forged, CUSTOMER_EMAIL, 'sub_koma_test', WEBHOOK_SECRET]) {
    assert.ok(!logged.includes(secret), `el log no contiene ${secret.slice(0, 24)}…`);
  }
});

test('Seguridad: un fallo después de verificar la firma (evento "thin" de v2) da 500 genérico; la causa va solo al log, sin firma ni cuerpo', async (t) => {
  const spies = [t.mock.method(process.stdout, 'write'), t.mock.method(process.stderr, 'write')] as unknown as Mock<
    (...args: never[]) => unknown
  >[];
  // Firmado y JSON válido, pero el SDK rechaza los eventos "thin" en constructEvent: no es un error de firma.
  const payload = JSON.stringify({
    id: 'evt_koma_thin',
    object: 'v2.core.event',
    type: 'v1.billing.meter.no_meter_found',
    created: new Date().toISOString(),
    related_object: { id: 'sub_koma_thin', type: 'subscription', url: '/v1/subscriptions/sub_koma_thin' },
  });
  const signature = sign(payload);

  const res = await postWebhook(payload, { 'Stripe-Signature': signature });
  assert.equal(res.status, 500);
  const requestId = res.headers.get('x-request-id') ?? '';
  // La respuesta lleva solo code, message y requestId: nada de cause, stack ni el mensaje del SDK.
  assert.deepEqual(await res.json(), { code: 'INTERNAL_ERROR', message: INTERNAL_ERROR_MESSAGE, requestId });

  const log = await logLines(spies, requestId);
  const failure = log.lines.find((line) => line['level'] === 'error');
  const cause = failure?.['err'] as { name?: unknown; message?: unknown } | undefined;
  assert.equal(failure?.['code'], 'INTERNAL_ERROR');
  assert.equal(cause?.name, 'Error', 'en el log va el error original del SDK, no el AppError');
  assert.match(String(cause?.message), /thin event/);
  for (const secret of [signature, signature.split('v1=')[1] ?? signature, WEBHOOK_SECRET, 'sub_koma_thin', 'evt_koma_thin']) {
    assert.ok(!log.raw.includes(secret), `el log no contiene ${secret.slice(0, 24)}…`);
  }
});

test('Seguridad: un cuerpo bien firmado que no es JSON da 500 genérico; en el log, un error fijo sin ningún trozo del cuerpo ni de la firma', async (t) => {
  const spies = [t.mock.method(process.stdout, 'write'), t.mock.method(process.stderr, 'write')] as unknown as Mock<
    (...args: never[]) => unknown
  >[];
  // JSON.parse copiaría el principio del cuerpo en el mensaje de su SyntaxError.
  const payload = `xyzzy-koma-sin-json ${CUSTOMER_EMAIL}`;
  const signature = sign(payload);

  const res = await postWebhook(payload, { 'Stripe-Signature': signature });
  assert.equal(res.status, 500);
  const requestId = res.headers.get('x-request-id') ?? '';
  assert.deepEqual(await res.json(), { code: 'INTERNAL_ERROR', message: INTERNAL_ERROR_MESSAGE, requestId });

  const log = await logLines(spies, requestId);
  const failure = log.lines.find((line) => line['level'] === 'error');
  const cause = failure?.['err'] as { message?: unknown } | undefined;
  assert.equal(failure?.['code'], 'INTERNAL_ERROR');
  assert.equal(cause?.message, 'El cuerpo firmado no es JSON válido');
  for (const fragment of [payload, 'xyzzy', 'koma-sin-json', CUSTOMER_EMAIL, signature, signature.split('v1=')[1] ?? signature, WEBHOOK_SECRET]) {
    assert.ok(!log.raw.includes(fragment), `el log no contiene ${fragment.slice(0, 24)}…`);
  }
});
