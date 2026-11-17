import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAnswer, encodeName, parseQuestions, pickAddress, readName } from '../../scripts/demo-mdns.js';

// Respondedor mDNS de la demo en Windows (docs/comandos.md, apartado 10.12): anuncia koma.local en la red local.
// Probado el 17-nov con un Android: Android pregunta como «resolvedor simple» (RFC 6762, §6.7) y descarta una
// respuesta que no repite la pregunta con su mismo id.

// Pregunta DNS con un nombre; `qu` marca el bit de «respuesta directa» de mDNS.
function query(id: number, name: string, type = 1, qu = false): Buffer {
  const header = Buffer.from([id >> 8, id & 0xff, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
  return Buffer.concat([header, encodeName(name), Buffer.from([0, type, qu ? 0x80 : 0, 1])]);
}

// Lee la respuesta: cabecera, preguntas repetidas y el único registro A.
function parseAnswer(reply: Buffer) {
  const questions = reply.readUInt16BE(4);
  let offset = 12;
  for (let i = 0; i < questions; i++) offset = readName(reply, offset)!.next + 4;
  const answer = readName(reply, offset)!;
  const at = answer.next;
  return {
    id: reply.readUInt16BE(0),
    flags: reply.readUInt16BE(2),
    questions,
    answers: reply.readUInt16BE(6),
    name: answer.name,
    type: reply.readUInt16BE(at),
    klass: reply.readUInt16BE(at + 2),
    ttl: reply.readUInt32BE(at + 4),
    ip: [...reply.subarray(at + 10, at + 14)].join('.'),
  };
}

test('Seguridad: (demo) a un resolvedor simple (Android) le responde con su id, la pregunta repetida, TTL de 10 s y sin cache-flush', () => {
  const reply = parseAnswer(buildAnswer('koma.local', '192.168.1.128', { id: 4242, type: 1 }));
  assert.equal(reply.id, 4242, 'el mismo id');
  assert.equal(reply.flags, 0x8400, 'respuesta autoritativa');
  assert.equal(reply.questions, 1, 'la pregunta repetida');
  assert.deepEqual([reply.answers, reply.name, reply.type, reply.klass, reply.ttl, reply.ip], [1, 'koma.local', 1, 1, 10, '192.168.1.128']);
});

test('Seguridad: (demo) a una pregunta mDNS le responde con id 0, sin repetir la pregunta, con cache-flush y TTL de 120 s', () => {
  const reply = parseAnswer(buildAnswer('koma.local', '192.168.1.128', null));
  assert.deepEqual([reply.id, reply.questions, reply.answers], [0, 0, 1]);
  assert.equal(reply.klass, 0x8001, 'IN con cache-flush');
  assert.equal(reply.ttl, 120);
  assert.equal(reply.ip, '192.168.1.128');
});

test('Seguridad: (demo) lee las preguntas (también con nombres comprimidos) e ignora respuestas y paquetes rotos', () => {
  assert.deepEqual(parseQuestions(query(7, 'Koma.Local', 1, true)), [{ name: 'koma.local', type: 1, unicastResponse: true }]);
  assert.deepEqual(parseQuestions(query(7, 'otro.local', 28)), [{ name: 'otro.local', type: 28, unicastResponse: false }]);
  // Dos preguntas; la segunda apunta con un puntero de compresión al nombre de la primera.
  const two = Buffer.concat([Buffer.from([0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0]), encodeName('koma.local'), Buffer.from([0, 1, 0, 1]), Buffer.from([0xc0, 12, 0, 255, 0, 1])]);
  assert.deepEqual(parseQuestions(two)?.map((q) => [q.name, q.type]), [['koma.local', 1], ['koma.local', 255]]);
  const response = query(7, 'koma.local');
  response.writeUInt16BE(0x8400, 2);
  assert.equal(parseQuestions(response), null, 'una respuesta no es una pregunta');
  assert.equal(parseQuestions(Buffer.from([0, 1, 0])), null, 'demasiado corto');
  assert.equal(parseQuestions(query(7, 'koma.local').subarray(0, 18)), null, 'cortado a mitad del nombre');
  const loop = Buffer.concat([Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]), Buffer.from([0xc0, 12, 0, 1, 0, 1])]);
  assert.equal(parseQuestions(loop), null, 'un puntero que apunta a sí mismo no cuelga el respondedor');
});

test('Seguridad: (demo) responde con la IP del portátil en la red de quien pregunta (wifi y no la red virtual de WSL)', () => {
  const mine = [
    { address: '172.23.96.1', netmask: '255.255.240.0' },
    { address: '192.168.1.128', netmask: '255.255.255.0' },
  ];
  assert.equal(pickAddress(mine, '192.168.1.69')?.address, '192.168.1.128');
  assert.equal(pickAddress(mine, '172.23.100.5')?.address, '172.23.96.1');
  assert.equal(pickAddress(mine, '10.0.0.7'), null, 'de otra red no se responde');
  assert.equal(pickAddress([], '192.168.1.69'), null);
});
