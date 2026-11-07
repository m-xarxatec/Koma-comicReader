import { crc32, deflateSync } from 'node:zlib';

// PNG de color plano con texto en mayúsculas y números, sin dependencias (solo para `npm run demo:data`). RGB de
// 8 bits, sin entrelazado; el texto se dibuja con una fuente de píxeles de 5 × 7 escalada y centrada.

export type Rgb = readonly [number, number, number];

const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

export function flatImagePng(width: number, height: number, background: Rgb, foreground: Rgb, lines: readonly string[]): Buffer {
  for (const line of lines) {
    for (const char of line) if (!GLYPHS[char]) throw new Error(`demo-png: sin glifo para «${char}»`);
  }
  const stride = width * 3 + 1; // byte de filtro (0) + RGB
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) raw.set(background, y * stride + 1 + x * 3);
  }

  // Escala: la línea más larga ocupa como mucho el 80 % del ancho, y el bloque, el 60 % del alto.
  const longest = Math.max(1, ...lines.map((line) => line.length));
  const cell = GLYPH_WIDTH + 1;
  const rowHeight = GLYPH_HEIGHT + 3;
  const scale = Math.max(1, Math.floor(Math.min((width * 0.8) / (longest * cell), (height * 0.6) / (lines.length * rowHeight))));
  const blockHeight = lines.length * rowHeight * scale;
  lines.forEach((line, row) => {
    const top = Math.floor((height - blockHeight) / 2) + row * rowHeight * scale;
    const left = Math.floor((width - (line.length * cell - 1) * scale) / 2);
    [...line].forEach((char, index) => {
      const glyph = GLYPHS[char]!;
      for (let gy = 0; gy < GLYPH_HEIGHT; gy++) {
        for (let gx = 0; gx < GLYPH_WIDTH; gx++) {
          if (glyph[gy]![gx] !== '#') continue;
          for (let sy = 0; sy < scale; sy++) {
            const y = top + gy * scale + sy;
            for (let sx = 0; sx < scale; sx++) {
              const x = left + (index * cell + gx) * scale + sx;
              if (x >= 0 && x < width && y >= 0 && y < height) raw.set(foreground, y * stride + 1 + x * 3);
            }
          }
        }
      }
    });
  });

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB, deflate, filtro adaptativo, sin entrelazado
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
