import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

const external = ['@grafana/faro-react', '@grafana/faro-transport-otlp-http'];

const compileTs = () => typescript({ noEmit: false, rewriteRelativeImportExtensions: true });

export default [
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/react-version/index.umd.js',
      format: 'umd',
      name: 'FaroReactWrapper',
      plugins: [terser()],
    },
    plugins: [resolve({ browser: true, preferBuiltins: false }), commonjs(), compileTs()],
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
