import { existsSync, statSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

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
].flatMap(([, names]) => names.split(',').map((name) => name.trim()));
const runtimeValues = Object.keys(await import(resolve(root, pkg.module)));
const typedOnly = declaredValues.filter((name) => !runtimeValues.includes(name));
if (typedOnly.length) {
  console.error(`✗ ${pkg.types} declares values missing at runtime: ${typedOnly.join(', ')}`);
  process.exit(1);
}
console.log(`✓ Every value export in ${pkg.types} exists in ${pkg.module}.`);

const browserGlobals = { GrafanaFaroWebSdk: {}, GrafanaFaroTransportOtlpHttp: {} };
try {
  runInNewContext(readFileSync(resolve(root, pkg.unpkg), 'utf8'), browserGlobals);
} catch (error) {
  console.error(`✗ ${pkg.unpkg} fails to load in a browser-like context: ${error.message}`);
  process.exit(1);
}
if (typeof browserGlobals.GrafanaFaroWrapper?.FaroService !== 'function') {
  console.error(`✗ ${pkg.unpkg} does not expose GrafanaFaroWrapper.FaroService`);
  process.exit(1);
}
console.log(`✓ ${pkg.unpkg} loads in a browser-like context as GrafanaFaroWrapper.`);
