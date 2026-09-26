export const UMD_NAME = 'GrafanaFaroWrapper';

export const FARO_GLOBALS = {
  '@grafana/faro-web-sdk': 'GrafanaFaroWebSdk',
  '@grafana/faro-transport-otlp-http': 'GrafanaFaroTransportOtlpHttp',
};

export const FARO_IIFE_BUNDLES = {
  '@grafana/faro-web-sdk': 'dist/bundle/faro-web-sdk.iife.js',
  '@grafana/faro-transport-otlp-http': 'dist/bundle/faro-transport-otlp-http.iife.js',
};

export const OUTPUTS = {
  esm: 'dist/index.js',
  cjs: 'dist/index.cjs',
  umd: 'dist/index.umd.js',
  umdFull: 'dist/index.umd.full.js',
  types: 'dist/index.d.ts',
  cjsTypes: 'dist/index.d.cts',
};
