import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { paths } from '../../config/paths.js';

// Lógica del lector que no necesita el navegador: se carga el JS compilado del cliente (client/dist), como en
// client-parity.test.ts, y se le pasan objetos con la forma de document y del elemento.
const load = <T>(file: string) => import(pathToFileURL(path.join(paths.clientDistDir, file)).href) as Promise<T>;

interface ButtonState { disabled: boolean; pressed: boolean; label: string; title: string | null }
interface FakeDocument { fullscreenEnabled: boolean; fullscreenElement: unknown; exitFullscreen(): Promise<void> }
interface FakeTarget { requestFullscreen(): Promise<void> }
const fullscreen = await load<{
  FULLSCREEN_LABELS: { enter: string; exit: string; unsupported: string };
  fullscreenButtonState: (doc: Pick<FakeDocument, 'fullscreenEnabled' | 'fullscreenElement'>, target: unknown) => ButtonState;
  toggleFullscreen: (doc: FakeDocument, target: FakeTarget) => Promise<string>;
}>('utils/fullscreen.js');
const timer = await load<{
  secondsLeft: (endsAt: number, now: number) => number;
  retryAtText: (retryAt: Date, now: Date) => string;
}>('components/timer.js');

// Un document de prueba: requestFullscreen y exitFullscreen cambian fullscreenElement, como el navegador.
function fakeFullscreen(enabled = true) {
  const calls: string[] = [];
  const doc: FakeDocument = {
    fullscreenEnabled: enabled,
    fullscreenElement: null,
    exitFullscreen: async () => { calls.push('exit'); doc.fullscreenElement = null; },
  };
  const target: FakeTarget = { requestFullscreen: async () => { calls.push('request'); doc.fullscreenElement = target; } };
  return { doc, target, calls };
}

test('Seguridad: pantalla completa sin soporte: botón deshabilitado con su title y sin llamar a la API', async () => {
  const { doc, target, calls } = fakeFullscreen(false);
  assert.deepEqual(fullscreen.fullscreenButtonState(doc, target), {
    disabled: true, pressed: false, label: fullscreen.FULLSCREEN_LABELS.enter, title: 'No disponible en este navegador',
  });
  assert.equal(await fullscreen.toggleFullscreen(doc, target), 'unsupported');
  assert.deepEqual(calls, []);
});

test('Seguridad: pantalla completa: entra en la tira y sale, con aria-pressed y la etiqueta de cada estado', async () => {
  const { doc, target, calls } = fakeFullscreen();
  assert.deepEqual(fullscreen.fullscreenButtonState(doc, target), { disabled: false, pressed: false, label: 'Pantalla completa', title: null });
  assert.equal(await fullscreen.toggleFullscreen(doc, target), 'entered');
  assert.deepEqual(fullscreen.fullscreenButtonState(doc, target), { disabled: false, pressed: true, label: 'Salir de pantalla completa', title: null });
  assert.equal(await fullscreen.toggleFullscreen(doc, target), 'exited');
  assert.deepEqual(fullscreen.fullscreenButtonState(doc, target).pressed, false);
  assert.deepEqual(calls, ['request', 'exit']);
});

test('Seguridad: pantalla completa: el estado sigue a fullscreenchange (Esc u otro elemento) y un rechazo no cambia nada', async () => {
  const { doc, target } = fakeFullscreen();
  doc.fullscreenElement = target;
  assert.equal(fullscreen.fullscreenButtonState(doc, target).pressed, true);
  doc.fullscreenElement = null; // salida con Esc: el navegador quita el elemento y dispara fullscreenchange
  assert.equal(fullscreen.fullscreenButtonState(doc, target).pressed, false);
  doc.fullscreenElement = {}; // otro elemento en pantalla completa: la tira no lo está
  assert.equal(fullscreen.fullscreenButtonState(doc, target).pressed, false);

  const denied = fakeFullscreen();
  denied.target.requestFullscreen = async () => { throw new TypeError('Permissions check failed'); };
  assert.equal(await fullscreen.toggleFullscreen(denied.doc, denied.target), 'failed');
  assert.equal(fullscreen.fullscreenButtonState(denied.doc, denied.target).pressed, false);
});

test('RN-01: la cuenta atrás del anuncio redondea hacia arriba y no baja de 0', () => {
  const start = 1_000_000;
  assert.equal(timer.secondsLeft(start + 10_000, start), 10);
  assert.equal(timer.secondsLeft(start + 10_000, start + 1), 10);
  assert.equal(timer.secondsLeft(start + 10_000, start + 9_001), 1);
  assert.equal(timer.secondsLeft(start + 10_000, start + 10_000), 0);
  assert.equal(timer.secondsLeft(start + 10_000, start + 60_000), 0);
});

test('RN-02: el muro de saldo dice la hora de la recarga; con la fecha si no es hoy', () => {
  const now = new Date(2026, 10, 4, 12, 0);
  assert.equal(timer.retryAtText(new Date(2026, 10, 4, 18, 5), now), 'a las 18:05');
  assert.equal(timer.retryAtText(new Date(2026, 10, 5, 9, 30), now), 'el 5 de noviembre a las 09:30');
});
