import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FARO_IIFE_BUNDLES, OUTPUTS, UMD_NAME } from '../bundles.config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const PAGE_URL =
  'https://shop.example.com/Orders/0190a6e2-7c3b-7d4e-9f00-1a2b3c4d5e6f?token=secret';
const SANITIZED_PAGE = 'shop.example.com/orders/:id';
const COLLECTOR = 'https://collector.example.com/v1/logs';

const read = (path) => readFileSync(resolve(root, path), 'utf8');
const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

function createPage() {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: PAGE_URL,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const posts = [];
  window.fetch = (url, init = {}) => {
    posts.push({ url: String(url), body: JSON.parse(init.body) });
    return Promise.resolve({ status: 200, headers: { get: () => null }, text: async () => '' });
  };
  window.console.warn = window.console.info = window.console.debug = () => {};
  const run = (code, filename) =>
    new vm.Script(code, { filename }).runInContext(dom.getInternalVMContext());
  return { window, posts, run };
}

const loadFaroIifes = (page) =>
  Object.entries(FARO_IIFE_BUNDLES).forEach(([pkg, bundle]) =>
    page.run(read(`node_modules/${pkg}/${bundle}`), bundle),
  );

const logRecords = (posts) =>
  posts.flatMap(({ body }) =>
    (body.resourceLogs ?? []).flatMap(({ scopeLogs }) =>
      scopeLogs.flatMap(({ logRecords: records }) => records),
    ),
  );
const attribute = (record, key) =>
  record.attributes.find((attr) => attr.key === key)?.value.stringValue;

async function waitFor(find, what) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const found = find();
    if (found) {
      return found;
    }
    await new Promise((done) => setTimeout(done, 50));
  }
  return fail(what);
}

async function runConsumerScenario(label, lib, { window, posts }, initOptions = {}) {
  const service = new lib.FaroService();
  service.init({
    faroUrl: COLLECTOR,
    faroKey: 'key',
    app: { name: 'bundle-check' },
    batching: { enabled: false },
    ...initOptions,
  });
  window.document.body.innerHTML = '<div id="app">Ready</div>';
  service.trackSlo({
    name: 'page_ready',
    failTime: 2000,
    steps: { app: () => lib.checkRenderInnerValue('#app') },
  });

  const record = await waitFor(
    () => logRecords(posts).find((item) => item.body.stringValue?.includes('name=page_ready')),
    `${label}: trackSlo did not deliver an OTLP log record to ${COLLECTOR}`,
  );
  if (
    !/^faro_signal=measurement type=custom name=page_ready value=\d+ result=success$/.test(
      record.body.stringValue,
    )
  ) {
    fail(`${label}: unexpected logfmt body "${record.body.stringValue}"`);
  }
  if (attribute(record, 'url.full') !== SANITIZED_PAGE) {
    fail(`${label}: page URL was not sanitized: ${attribute(record, 'url.full')}`);
  }
  console.log(`✓ ${label}: init → trackSlo → OTLP POST with a logfmt body and a sanitized URL.`);
  return service;
}

function sameExports(label, keys, expected) {
  const missing = expected.filter((key) => !keys.includes(key));
  const extra = keys.filter((key) => !expected.includes(key) && key !== '__esModule');
  if (missing.length || extra.length) {
    fail(`${label} exports differ from ${OUTPUTS.esm}: missing [${missing}], extra [${extra}]`);
  }
}

const esmPage = createPage();
for (const name of [
  'window',
  'document',
  'navigator',
  'location',
  'MutationObserver',
  'HTMLElement',
  'HTMLImageElement',
  'Element',
  'Image',
  'Event',
  'ErrorEvent',
  'getComputedStyle',
  'localStorage',
  'sessionStorage',
]) {
  Object.defineProperty(globalThis, name, {
    value: esmPage.window[name],
    configurable: true,
    writable: true,
  });
}
globalThis.fetch = esmPage.window.fetch;
const esm = await import(resolve(root, OUTPUTS.esm));
const expectedExports = Object.keys(esm).sort();
await runConsumerScenario(`${OUTPUTS.esm} with Faro from node_modules`, esm, esmPage);

sameExports(OUTPUTS.cjs, Object.keys(require(resolve(root, OUTPUTS.cjs))), expectedExports);
console.log(`✓ ${OUTPUTS.cjs} exports the same values as ${OUTPUTS.esm}.`);

const externalPage = createPage();
loadFaroIifes(externalPage);
externalPage.run(read(OUTPUTS.umd), OUTPUTS.umd);
sameExports(OUTPUTS.umd, Object.keys(externalPage.window[UMD_NAME]), expectedExports);
await runConsumerScenario(
  `${OUTPUTS.umd} after the Faro IIFE bundles`,
  externalPage.window[UMD_NAME],
  externalPage,
);

const fullPage = createPage();
fullPage.run(read(OUTPUTS.umdFull), OUTPUTS.umdFull);
const full = fullPage.window[UMD_NAME];
sameExports(OUTPUTS.umdFull, Object.keys(full), expectedExports);
await runConsumerScenario(`${OUTPUTS.umdFull} on its own`, full, fullPage, {
  instrumentations: full.getWebInstrumentations({ captureConsole: false }),
});
fullPage.window.dispatchEvent(
  new fullPage.window.ErrorEvent('error', {
    message: 'boom',
    error: new fullPage.window.Error('boom'),
    filename: 'https://shop.example.com/Orders/1234567/app.js?token=secret',
    lineno: 1,
    colno: 1,
  }),
);
const exception = await waitFor(
  () => logRecords(fullPage.posts).find((record) => attribute(record, 'exception.message')),
  `${OUTPUTS.umdFull}: getWebInstrumentations() did not report a page error`,
);
if (JSON.stringify(exception).includes('secret')) {
  fail(`${OUTPUTS.umdFull}: the error record leaks the page token: ${JSON.stringify(exception)}`);
}
console.log(
  `✓ ${OUTPUTS.umdFull}: getWebInstrumentations() reports errors without the page token.`,
);

const barePage = createPage();
barePage.run(read(OUTPUTS.umd), OUTPUTS.umd);
try {
  new barePage.window[UMD_NAME].FaroService().init({
    faroUrl: COLLECTOR,
    faroKey: 'k',
    app: { name: 'x' },
  });
  fail(
    `${OUTPUTS.umd} without the Faro IIFE bundles initialized instead of explaining what is missing`,
  );
} catch (error) {
  if (!String(error.message).includes('are not loaded')) {
    fail(`${OUTPUTS.umd} without Faro fails with an unclear error: ${error.message}`);
  }
}
console.log(`✓ ${OUTPUTS.umd} without the Faro IIFE bundles explains what to include.`);
process.exit(0);
