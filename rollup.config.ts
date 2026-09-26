import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import type { Plugin } from 'rollup';
import dts from 'rollup-plugin-dts';
import ts from 'typescript';
import { FARO_GLOBALS, OUTPUTS, UMD_NAME } from './bundles.config.mjs';

const external = Object.keys(FARO_GLOBALS);

const compileTs = () => typescript({ tsconfig: 'tsconfig.build.json', noEmit: false });

const downlevelToEs2019 = (): Plugin => ({
  name: 'downlevel-to-es2019',
  renderChunk(code) {
    const { outputText, sourceMapText } = ts.transpileModule(code, {
      fileName: 'bundle.js',
      compilerOptions: {
        target: ts.ScriptTarget.ES2019,
        module: ts.ModuleKind.ESNext,
        allowJs: true,
        alwaysStrict: false,
        ignoreDeprecations: '6.0',
        sourceMap: true,
      },
    });
    return { code: outputText, map: sourceMapText };
  },
});

const umd = { format: 'umd', name: UMD_NAME, sourcemap: true } as const;

export default [
  {
    input: 'src/index.ts',
    output: [
      { file: OUTPUTS.esm, format: 'esm', sourcemap: true },
      { file: OUTPUTS.cjs, format: 'cjs', sourcemap: true },
      { ...umd, file: OUTPUTS.umd, globals: FARO_GLOBALS, plugins: [terser()] },
    ],
    external,
    plugins: [compileTs()],
  },
  {
    input: 'src/index.ts',
    output: {
      ...umd,
      file: OUTPUTS.umdFull,
      sourcemapExcludeSources: true,
      plugins: [downlevelToEs2019(), terser()],
    },
    plugins: [resolve({ browser: true }), commonjs(), compileTs()],
  },
  {
    input: 'src/index.ts',
    output: [
      { file: OUTPUTS.types, format: 'es' },
      { file: OUTPUTS.cjsTypes, format: 'es' },
    ],
    plugins: [dts({ tsconfig: 'tsconfig.build.json' })],
  },
];
