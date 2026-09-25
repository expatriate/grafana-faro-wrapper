import { existsSync, statSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const entries = [];
for (const field of ['main', 'module', 'browser', 'types', 'unpkg', 'jsdelivr']) {
  if (typeof pkg[field] === 'string') entries.push([field, pkg[field]]);
}
const walkExports = (node, path) => {
  if (typeof node === 'string') {
    entries.push([`exports${path}`, node]);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) walkExports(v, `${path}/${k}`);
  }
};
if (pkg.exports) walkExports(pkg.exports, '');

const missing = [];
for (const [label, rel] of entries) {
  const abs = resolve(root, rel);
  const ok = existsSync(abs) && statSync(abs).isFile();
  console.log(`${ok ? '✓' : '✗'} ${label.padEnd(16)} -> ${rel}`);
  if (!ok) missing.push([label, rel]);
}

if (missing.length) {
  console.error(
    `\n✗ ${missing.length} declared entry point(s) do not resolve to a built file:\n` +
      missing.map(([l, r]) => `   ${l} -> ${r}`).join('\n') +
      `\nFix package.json to match what rollup actually emits (see rollup.config.ts).`,
  );
  process.exit(1);
}
console.log(`\n✓ All ${entries.length} declared entry points resolve to built files.`);

const declaredValues = [
  ...readFileSync(resolve(root, pkg.types), 'utf8').matchAll(/^export \{([^}]*)\};$/gm),
].flatMap(([, names]) =>
  names.split(',').map((name) =>
    name
      .trim()
      .split(/\s+as\s+/)
      .pop(),
  ),
);
const runtimeValues = Object.keys(await import(resolve(root, pkg.module)));
const typedOnly = declaredValues.filter((name) => !runtimeValues.includes(name));
if (typedOnly.length) {
  console.error(`✗ ${pkg.types} declares values missing at runtime: ${typedOnly.join(', ')}`);
  process.exit(1);
}
console.log(`✓ Every value export in ${pkg.types} exists in ${pkg.module}.`);

const loadUmd = (rel, globals = {}) => {
  const { window } = new JSDOM('', { runScripts: 'outside-only', url: 'https://example.test/' });
  Object.assign(window, globals);
  try {
    window.eval(readFileSync(resolve(root, rel), 'utf8'));
  } catch (error) {
    console.error(`✗ ${rel} fails to load in a browser: ${error.message}`);
    process.exit(1);
  }
  const umd = window.GrafanaFaroWrapper;
  if (typeof umd?.FaroService !== 'function' || typeof umd?.checkRender !== 'function') {
    console.error(`✗ ${rel} does not expose GrafanaFaroWrapper.FaroService and the layout helpers`);
    process.exit(1);
  }
  console.log(`✓ ${rel} loads in a browser as GrafanaFaroWrapper.`);
};

loadUmd(pkg.unpkg, { GrafanaFaroWebSdk: {}, GrafanaFaroTransportOtlpHttp: {} });
loadUmd('dist/index.umd.full.js');
