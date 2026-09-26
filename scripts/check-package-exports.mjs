import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { OUTPUTS } from '../bundles.config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};
const isFile = (path) => existsSync(resolve(root, path)) && statSync(resolve(root, path)).isFile();

const fieldEntries = ['main', 'module', 'types', 'unpkg', 'jsdelivr']
  .filter((field) => typeof pkg[field] === 'string')
  .map((field) => [field, pkg[field]]);
const exportEntries = (node, path) =>
  typeof node === 'string'
    ? [[`exports${path}`, node]]
    : Object.entries(node).flatMap(([key, value]) => exportEntries(value, `${path}/${key}`));
const entries = [...fieldEntries, ...exportEntries(pkg.exports, '')];

const wildcardMatches = (pattern) =>
  Object.values(OUTPUTS).filter((output) => output.startsWith(pattern.replace(/^\.\/|\*$/g, '')));

for (const [label, target] of entries) {
  const resolved = target.includes('*') ? wildcardMatches(target) : [target];
  const ok = resolved.length > 0 && resolved.every(isFile);
  console.log(`${ok ? '✓' : '✗'} ${label.padEnd(26)} -> ${target}`);
  if (!ok) {
    fail(`${label} -> ${target} does not resolve to a built file (see rollup.config.ts)`);
  }
}
console.log(`✓ All ${entries.length} declared entry points resolve to built files.`);

const declaredValues = [
  ...readFileSync(resolve(root, OUTPUTS.types), 'utf8').matchAll(/^export \{([^}]*)\};$/gm),
].flatMap(([, names]) =>
  names
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name && !name.startsWith('type '))
    .map((name) => name.split(/\s+as\s+/).pop()),
);
const runtimeValues = Object.keys(await import(resolve(root, OUTPUTS.esm)));
const typedOnly = declaredValues.filter((name) => !runtimeValues.includes(name));
if (typedOnly.length) {
  fail(`${OUTPUTS.types} declares values missing at runtime: ${typedOnly.join(', ')}`);
}
if (
  readFileSync(resolve(root, OUTPUTS.types), 'utf8') !==
  readFileSync(resolve(root, OUTPUTS.cjsTypes), 'utf8')
) {
  fail(`${OUTPUTS.cjsTypes} differs from ${OUTPUTS.types}`);
}
console.log(`✓ Every value export in ${OUTPUTS.types} exists in ${OUTPUTS.esm}.`);

for (const output of [OUTPUTS.esm, OUTPUTS.cjs, OUTPUTS.umd, OUTPUTS.umdFull]) {
  try {
    parse(readFileSync(resolve(root, output), 'utf8'), {
      ecmaVersion: 2019,
      sourceType: output === OUTPUTS.esm ? 'module' : 'script',
    });
  } catch (error) {
    fail(`${output} is not ES2019, as README promises: ${error.message}`);
  }
}
console.log('✓ Every bundle parses as ES2019.');
