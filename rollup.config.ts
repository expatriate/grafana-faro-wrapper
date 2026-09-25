import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

const globals = {
  '@grafana/faro-react': 'GrafanaFaroReact',
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
