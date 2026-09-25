import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

const globals = {
  '@grafana/faro-web-sdk': 'GrafanaFaroWebSdk',
  '@grafana/faro-transport-otlp-http': 'GrafanaFaroTransportOtlpHttp',
};
const external = Object.keys(globals);

const compileTs = () => typescript({ noEmit: false, rewriteRelativeImportExtensions: true });

export default [
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.umd.js',
      format: 'umd',
      name: 'GrafanaFaroWrapper',
      globals,
      plugins: [terser()],
    },
    external,
    plugins: [compileTs()],
  },
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.umd.full.js',
      format: 'umd',
      name: 'GrafanaFaroWrapper',
      plugins: [terser()],
    },
    plugins: [resolve({ browser: true }), commonjs(), compileTs()],
  },
  {
    input: 'src/index.ts',
    output: [
      { file: 'dist/index.js', format: 'esm', sourcemap: true },
      { file: 'dist/index.cjs', format: 'cjs', sourcemap: true },
    ],
    external,
    plugins: [compileTs()],
  },
  {
    input: 'src/index.ts',
    output: { file: 'dist/index.d.ts', format: 'es' },
    external,
    plugins: [dts()],
  },
];
