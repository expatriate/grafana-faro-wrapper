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
const umdName = 'GrafanaFaroWrapper';

const compileTs = () => typescript({ noEmit: false });

const library = {
  input: 'src/index.ts',
  output: [
    { file: 'dist/index.js', format: 'esm', sourcemap: true },
    { file: 'dist/index.cjs', format: 'cjs', sourcemap: true },
    { file: 'dist/index.umd.js', format: 'umd', name: umdName, globals, plugins: [terser()] },
  ],
  external,
  plugins: [compileTs()],
};

const bundles = [
  library,
  {
    input: 'src/index.ts',
    output: { file: 'dist/index.umd.full.js', format: 'umd', name: umdName, plugins: [terser()] },
    plugins: [resolve({ browser: true }), commonjs(), compileTs()],
  },
  {
    input: 'src/index.ts',
    output: { file: 'dist/index.d.ts', format: 'es' },
    plugins: [dts()],
  },
];

export default process.env.ROLLUP_WATCH ? library : bundles;
