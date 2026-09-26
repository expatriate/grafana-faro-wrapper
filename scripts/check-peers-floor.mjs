import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const floors = Object.entries(pkg.peerDependencies).map(([name, range]) => [
  name,
  range.replace(/^\^/, ''),
]);
const faroFloor = floors[0][1];
const workdir = mkdtempSync(join(tmpdir(), 'faro-wrapper-floor-'));

const abort = (message) => {
  rmSync(workdir, { recursive: true, force: true });
  console.error(`✗ ${message}`);
  process.exit(1);
};

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: workdir, stdio: 'inherit' });
  if (result.status !== 0) {
    abort(`${command} ${args.join(' ')} failed on the peerDependencies floor`);
  }
};

for (const entry of [
  'src',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'jest.config.ts',
]) {
  cpSync(resolve(root, entry), join(workdir, entry), { recursive: true });
}
run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
run('npm', [
  'install',
  '--no-save',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
  ...floors.map(([name, version]) => `${name}@${version}`),
  `@grafana/faro-core@${faroFloor}`,
]);
for (const [name, version] of floors) {
  const installed = JSON.parse(
    readFileSync(join(workdir, 'node_modules', name, 'package.json'), 'utf8'),
  ).version;
  if (installed !== version) {
    abort(`${name}@${installed} is installed instead of the floor ${version}`);
  }
}
run('npx', ['tsc', '--noEmit']);
run('npx', ['jest']);
rmSync(workdir, { recursive: true, force: true });
console.log(`✓ Types and tests pass with ${floors.map(([n, v]) => `${n}@${v}`).join(', ')}.`);
