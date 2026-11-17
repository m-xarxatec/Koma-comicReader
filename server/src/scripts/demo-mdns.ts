import dgram from 'node:dgram';
import os from 'node:os';

// Respondedor mDNS de la demo en Windows (docs/comandos.md, apartado 10.12; solo local): anuncia «koma.local» en la
// red del portátil para que los móviles de la misma wifi entren por http://koma.local. Windows solo anuncia su propio
// nombre y no hay Avahi; este script hace de Avahi para un solo nombre. Sin dependencias, sin BD y sin env.ts.
// Uso: npm run demo:mdns  (otro nombre: npm run demo:mdns -- otro.local). Ctrl+C para parar.
// Responde a las preguntas A (o ANY) de ese nombre con la IPv4 del portátil en la red de quien pregunta, de dos formas
// (RFC 6762): mDNS (pregunta desde el puerto 5353) y «legacy unicast» (un resolvedor simple, como el de Android, que
// pregunta desde otro puerto y descarta la respuesta si no repite su pregunta con el mismo id; §6.7).

export const MDNS_GROUP = '224.0.0.251';
export const MDNS_PORT = 5353;
const TTL_MDNS = 120;
const TTL_LEGACY = 10; // §6.7: como mucho 10 s
const TYPE_A = 1;
const TYPE_ANY = 255;
const CLASS_IN = 1;
const CACHE_FLUSH = 0x8000;
const MAX_POINTERS = 16; // un puntero de compresión que apunta a sí mismo no cuelga el respondedor

export interface LocalAddress {
  address: string;
  netmask: string;
}
export interface Question {
  name: string;
  type: number;
  unicastResponse: boolean; // bit QU de mDNS
}

// Nombre DNS en `offset`, con punteros de compresión; `next` es el byte siguiente al nombre en su sitio original.
export function readName(buf: Buffer, offset: number): { name: string; next: number } | null {
  const labels: string[] = [];
  let next: number | null = null;
  let at = offset;
  for (let jumps = 0; jumps <= MAX_POINTERS; ) {
    const len = buf[at];
    if (len === undefined) return null;
    if (len === 0) return { name: labels.join('.').toLowerCase(), next: next ?? at + 1 };
    if ((len & 0xc0) === 0xc0) {
      const low = buf[at + 1];
      if (low === undefined) return null;
      next ??= at + 2;
      at = ((len & 0x3f) << 8) | low;
      jumps++;
      continue;
    }
    if (at + 1 + len > buf.length) return null;
    labels.push(buf.toString('utf8', at + 1, at + 1 + len));
    at += 1 + len;
  }
  return null;
}

export function encodeName(name: string): Buffer {
  const labels = name.split('.').map((label) => {
    const bytes = Buffer.from(label, 'utf8');
    return Buffer.concat([Buffer.from([bytes.length]), bytes]);
  });
  return Buffer.concat([...labels, Buffer.from([0])]);
}

// Preguntas de un paquete; null si es una respuesta o está roto.
export function parseQuestions(msg: Buffer): Question[] | null {
  if (msg.length < 12 || (msg.readUInt16BE(2) & 0x8000) !== 0) return null;
  const questions: Question[] = [];
  let offset = 12;
  for (let i = 0; i < msg.readUInt16BE(4); i++) {
    const read = readName(msg, offset);
    if (!read || read.next + 4 > msg.length) return null;
    const klass = msg.readUInt16BE(read.next + 2);
    questions.push({ name: read.name, type: msg.readUInt16BE(read.next), unicastResponse: (klass & CACHE_FLUSH) !== 0 });
    offset = read.next + 4;
  }
  return questions;
}

// Respuesta autoritativa con un registro A. Sin `legacy`, la forma mDNS: id 0, sin la pregunta, cache-flush y TTL
// 120 s. Con `legacy`, la del resolvedor simple: su id, su pregunta repetida, sin cache-flush y TTL 10 s.
export function buildAnswer(name: string, ip: string, legacy: { id: number; type: number } | null): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(legacy?.id ?? 0, 0);
  header.writeUInt16BE(0x8400, 2);
  header.writeUInt16BE(legacy ? 1 : 0, 4);
  header.writeUInt16BE(1, 6);
  const question = legacy ? [encodeName(name), Buffer.from([legacy.type >> 8, legacy.type & 0xff, 0, CLASS_IN])] : [];
  const record = Buffer.alloc(10);
  record.writeUInt16BE(TYPE_A, 0);
  record.writeUInt16BE(legacy ? CLASS_IN : CLASS_IN | CACHE_FLUSH, 2);
  record.writeUInt32BE(legacy ? TTL_LEGACY : TTL_MDNS, 4);
  record.writeUInt16BE(4, 8);
  return Buffer.concat([header, ...question, encodeName(name), record, Buffer.from(ip.split('.').map(Number))]);
}

// IPv4 como entero de 32 bits; dos IP están en la misma red si coinciden con la máscara aplicada.
const toInt = (ip: string) => ip.split('.').reduce((n, part) => ((n << 8) | Number(part)) >>> 0, 0);
const sameNetwork = (a: string, b: string, mask: string) => (toInt(a) & toInt(mask)) === (toInt(b) & toInt(mask));

// La IPv4 del portátil en la red de quien pregunta (la wifi, no la red virtual de WSL); de otra red, ninguna.
export function pickAddress(addresses: readonly LocalAddress[], from: string): LocalAddress | null {
  return addresses.find((local) => sameNetwork(local.address, from, local.netmask)) ?? null;
}

function localAddresses(): LocalAddress[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a): a is os.NetworkInterfaceInfoIPv4 => a !== undefined && a.family === 'IPv4' && !a.internal)
    .map(({ address, netmask }) => ({ address, netmask }));
}

function main(name: string): void {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const join = () => {
    for (const { address } of localAddresses()) {
      try {
        socket.addMembership(MDNS_GROUP, address);
      } catch {
        // ya unido a esa red
      }
    }
  };

  socket.on('message', (msg, from) => {
    const question = parseQuestions(msg)?.find((q) => q.name === name && (q.type === TYPE_A || q.type === TYPE_ANY));
    if (!question) return;
    const local = pickAddress(localAddresses(), from.address);
    if (!local) return;
    const legacy = from.port !== MDNS_PORT;
    const reply = buildAnswer(name, local.address, legacy ? { id: msg.readUInt16BE(0), type: question.type } : null);
    try {
      socket.setMulticastInterface(local.address);
    } catch {
      // la red acaba de desaparecer: se responde igual
    }
    if (legacy || question.unicastResponse) socket.send(reply, from.port, from.address);
    if (!legacy) socket.send(reply, MDNS_PORT, MDNS_GROUP);
    const kind = legacy ? 'resolvedor simple' : 'mDNS';
    console.log(`${new Date().toLocaleTimeString('es-ES')} ${name} → ${local.address} (${from.address}, ${kind})`);
  });

  socket.on('error', (error) => {
    console.error(`demo:mdns: ${error.message}`);
    process.exit(1);
  });

  socket.bind(MDNS_PORT, () => {
    socket.setMulticastLoopback(true);
    join();
    console.log(`Anunciando ${name} en ${localAddresses().map((a) => a.address).join(', ')}. Ctrl+C para parar.`);
  });
  setInterval(join, 10_000).unref(); // si cambia la red (otra wifi), se une también a ella
}

if (import.meta.main) main((process.argv[2] ?? 'koma.local').toLowerCase());
