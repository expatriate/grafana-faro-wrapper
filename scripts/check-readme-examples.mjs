import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUTPUTS } from '../bundles.config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readme = readFileSync(resolve(root, 'README.md'), 'utf8');

const imports = new Map();
const bodies = [];
for (const [, block] of readme.matchAll(/```(?:typescript|tsx)\n([\s\S]*?)```/g)) {
  const body = block.replace(/import \{([^}]*)\} from '([^']+)';\n?/g, (_, names, module) => {
    const known = imports.get(module) ?? new Set();
    names
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .forEach((name) => known.add(name));
    imports.set(module, known);
    return '';
  });
  bodies.push(`{\n${body.replace(/^export /gm, '')}}`);
}

const declaredForExamples = `
declare const faroService: import('grafana-faro-wrapper').FaroService;
declare function fetchData(): Promise<{ ok: boolean }>;
declare function isRendered(): boolean;
declare function useEffect(effect: () => void | (() => void), deps: unknown[]): void;
declare const isOpen: boolean;
declare const view: string;
declare const steps: Record<string, () => boolean>;
`;

const dir = resolve(root, 'node_modules/.cache/readme-examples');
mkdirSync(dir, { recursive: true });
writeFileSync(
  resolve(dir, 'examples.tsx'),
  [...imports]
    .map(([module, names]) => `import { ${[...names].sort().join(', ')} } from '${module}';`)
    .join('\n') +
    '\n' +
    declaredForExamples +
    bodies.join('\n') +
    '\nexport {};\n',
);
writeFileSync(
  resolve(dir, 'tsconfig.json'),
  JSON.stringify({
    extends: '../../../tsconfig.json',
    compilerOptions: {
      rootDir: '../../..',
      types: [],
      jsx: 'react-jsx',
      exactOptionalPropertyTypes: true,
      paths: { 'grafana-faro-wrapper': [`../../../${OUTPUTS.types}`] },
    },
    include: ['examples.tsx'],
    exclude: [],
  }),
);

const tsc = spawnSync('npx', ['tsc', '--noEmit', '-p', dir], { cwd: root, stdio: 'inherit' });
if (tsc.status !== 0) {
  console.error(`✗ README examples do not type-check against the published ${OUTPUTS.types}`);
  process.exit(1);
}
console.log(`✓ ${bodies.length} README examples type-check against ${OUTPUTS.types}.`);
