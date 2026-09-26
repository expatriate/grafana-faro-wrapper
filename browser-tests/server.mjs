import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { OUTPUTS } from '../bundles.config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const port = Number(process.argv[2] ?? 5179);

function png(width, height) {
  const chunk = (kind, data) => {
    const body = Buffer.concat([Buffer.from(kind), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 4, 0xff)]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const svg = (attributes) =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}><rect width="10" height="10"/></svg>`;
const SVG = 'image/svg+xml';
const IMAGES = {
  '/img/ok.png': ['image/png', png(4, 3)],
  '/img/ok2.png': ['image/png', png(2, 2)],
  '/img/corrupt.png': ['image/png', 'not a png at all'],
  '/img/viewbox.svg': [SVG, svg('viewBox="0 0 10 10"')],
  '/img/sized.svg': [SVG, svg('width="10" height="10"')],
  '/img/bare.svg': [SVG, svg('')],
  '/img/corrupt.svg': [SVG, '<svg xmlns="http://www.w3.org/2000/svg"><rect'],
  '/img/svg-without-extension': [SVG, svg('')],
  '/img/png-named.svg': ['image/png', png(4, 3)],
};
const FILES = {
  '/': ['text/html', resolve(here, 'helpers.html')],
  '/bundle.js': ['text/javascript', resolve(root, OUTPUTS.umdFull)],
};

createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const reply = (status, type, body) => {
    response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    response.end(body);
  };
  if (path.startsWith('/img/slow')) {
    setTimeout(() => reply(200, 'image/png', png(4, 3)), 2000);
  } else if (IMAGES[path]) {
    reply(200, ...IMAGES[path]);
  } else if (FILES[path]) {
    reply(200, FILES[path][0], readFileSync(FILES[path][1]));
  } else {
    reply(404, 'text/html', '<h1>404</h1>');
  }
}).listen(port, '127.0.0.1');
