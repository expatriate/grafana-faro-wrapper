# grafana-faro-wrapper

[![npm](https://img.shields.io/npm/v/grafana-faro-wrapper)](https://www.npmjs.com/package/grafana-faro-wrapper)
[![CI](https://github.com/expatriate/grafana-faro-wrapper/actions/workflows/ci.yml/badge.svg)](https://github.com/expatriate/grafana-faro-wrapper/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/grafana-faro-wrapper)](LICENSE)

Обёртка над [Grafana Faro](https://grafana.com/oss/faro/) — SDK, который собирает с фронтенда ошибки, Web
Vitals и события и отправляет их в Grafana. Пакет подключает Faro к обычной HTML-странице или React-приложению
одним вызовом и добавляет то, чего в Faro нет:

- **Отправка по OTLP** — логи, ошибки и измерения уходят в OTLP-эндпоинт; тела измерений и ошибок — в logfmt,
  их разбирает `| logfmt` в LogQL.
- **Санитизация** — из URL страниц, ресурсов и стектрейсов убираются идентификаторы, query и hash, чтобы в
  Grafana не утекали токены и не росла кардинальность.
- **`sendMetric`** — пользовательская метрика с единицей, типом, метками и результатом в одном вызове.
- **`trackSlo`** — SLO-метрика «страница дошла до состояния»: шаги с дедлайнами, пауза при скрытой вкладке,
  отправка в едином формате.
- **Проверки вёрстки** — готовые предикаты для шагов: элементы отрисованы, их достаточно, картинки и фоны
  загрузились.

Работает с Faro 2.0.2+. Все бандлы собраны под ES2019: Chrome 73+, Firefox 69+, Safari 12.1+. Web Vitals
из `getWebInstrumentations()` считаются только в браузерах, которые отдают эти метрики.

## Установка

```bash
npm install grafana-faro-wrapper @grafana/faro-web-sdk @grafana/faro-transport-otlp-http
```

Для инструментации React Router нужен ещё `@grafana/faro-react` той же версии, что и `@grafana/faro-web-sdk`;
`@grafana/faro-react` 2.12+ требует `react-router` 7.12+.

Без сборщика подключите один файл — `dist/index.umd.full.js` (его отдают `unpkg` и `jsdelivr` по умолчанию)
содержит Faro внутри и выставляет глобал `GrafanaFaroWrapper`. Отдельно Faro на такую страницу не подключайте:
`getWebInstrumentations` берётся из того же глобала.

```html
<script src="https://unpkg.com/grafana-faro-wrapper/dist/index.umd.full.js"></script>
<script>
  const faroService = new GrafanaFaroWrapper.FaroService();
  faroService.init({
    faroUrl: 'https://otlp.example.com/v1/logs',
    faroKey: 'your-key',
    app: { name: 'my-site' },
    instrumentations: GrafanaFaroWrapper.getWebInstrumentations(),
  });
</script>
```

Файлы бандлов доступны и из установленного пакета — `grafana-faro-wrapper/dist/index.umd.full.js`, например
для копирования сборкой бекенда. Второй бандл, `dist/index.umd.js`, не содержит Faro и ждёт его IIFE-бандлы,
подключённые раньше него, — они выставляют глобалы `GrafanaFaroWebSdk` и `GrafanaFaroTransportOtlpHttp`:

```html
<script src="https://unpkg.com/@grafana/faro-web-sdk@2/dist/bundle/faro-web-sdk.iife.js"></script>
<script src="https://unpkg.com/@grafana/faro-transport-otlp-http@2/dist/bundle/faro-transport-otlp-http.iife.js"></script>
<script src="https://unpkg.com/grafana-faro-wrapper/dist/index.umd.js"></script>
```

## Быстрый старт

```typescript
import { FaroService, getWebInstrumentations } from 'grafana-faro-wrapper';

export const faroService = new FaroService();

faroService.init({
  faroUrl: 'https://otlp.example.com/v1/logs',
  faroKey: 'your-key',
  app: { name: 'my-app', version: '1.0.0', environment: 'production' },
  instrumentations: getWebInstrumentations(),
});
```

- `faroUrl` — OTLP-эндпоинт для логов, `faroKey` — API-ключ. Трейсы не отправляются.
- Остальные поля — обычный `BrowserConfig` Faro: `app`, `user`, `sessionTracking`, `batching` и т. д. Полей
  `url` и `apiKey` в типе нет — их заменяет транспорт обёртки. Свои `transports` добавляются к нему.
- `enabled: false` инициализирует Faro на паузе — удобно для dev-окружения; после `destroy()` и `init()` с тем же
  флагом Faro тоже остаётся на паузе.
- `init()` возвращает инстанс Faro и, как сам Faro, регистрирует его глобалом `window.faro`; отключается
  опцией `preventGlobalExposure: true`.

> [!IMPORTANT]
> По умолчанию `instrumentations` — пустой список: Faro не собирает ни ошибки, ни Web Vitals, ни сессии,
> пока вы не передадите `getWebInstrumentations()`, как в примере выше.

Faro регистрируется один раз на страницу, поэтому на странице — один `FaroService`: второй получит ошибку.
`destroy()` ставит Faro на паузу, а следующий `init()` снимает паузу с того же инстанса: применяется только
новый `beforeSend`, а об изменении `faroUrl`, `faroKey` или `app` выводится предупреждение.

### React Router

```tsx
import { createReactRouterV7Options, ReactIntegration } from '@grafana/faro-react';
import { FaroService, getWebInstrumentations } from 'grafana-faro-wrapper';
import {
  createRoutesFromChildren,
  matchRoutes,
  Routes,
  useLocation,
  useNavigationType,
} from 'react-router';

const faroService = new FaroService();

faroService.init({
  faroUrl: 'https://otlp.example.com/v1/logs',
  faroKey: 'your-key',
  app: { name: 'my-app' },
  instrumentations: getWebInstrumentations(),
  routerAdapter: new ReactIntegration({
    router: createReactRouterV7Options({
      createRoutesFromChildren,
      matchRoutes,
      Routes,
      useLocation,
      useNavigationType,
    }),
  }),
});
```

Затем замените `Routes` на `FaroRoutes` из `@grafana/faro-react`. Хелперы для React Router 4–6 и data-router
описаны в [документации faro-react](https://github.com/grafana/faro-web-sdk/tree/main/packages/react).

## Пользовательские метрики

```typescript
faroService.sendMetric({
  name: 'checkout',
  value: 1,
  unit: 'EVENTS',
  type: 'counter',
  labels: { payment: 'card' },
  result: 'success',
});
```

| Поле          | Тип                                           | Описание                                                                                     |
| ------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `name`        | `string`                                      | Имя метрики                                                                                  |
| `value`       | `number`                                      | Значение; не конечное число (`NaN`, `±Infinity`) даёт `0`                                    |
| `unit`        | `MetricUnit`                                  | `BYTES`, `MILLISECONDS`, `SECONDS`, `REQUESTS`, `ERRORS`, `OPERATIONS`, `EVENTS`, `UNITLESS` |
| `type`        | `MetricType`                                  | `counter`, `gauge`, `histogram`                                                              |
| `result`      | `'success' \| 'fail'`                         | Итог, попадает и в тело лога, необязательно                                                  |
| `labels`      | `Record<string, string \| number \| boolean>` | Плоские метки, типы значений сохраняются, необязательно                                      |
| `buckets`     | `number[]`                                    | Границы бакетов гистограммы, необязательно                                                   |
| `description` | `string`                                      | Описание, необязательно                                                                      |
| `timestamp`   | `number`                                      | Время события в мс, по умолчанию — момент вызова                                             |

Каждый вызов — отдельное измерение Faro с `type: 'custom'` и `values: { [name]: value }`; одинаковые метрики
подряд не схлопываются. Пустое `name`, `unit` или `type` вне списка не останавливают отправку, но один раз
дают предупреждение в консоли. Остальные поля уходят в контекст измерения под ключами `measurement.*` (экспорт
`MEASUREMENT_KEYS`) и попадают в Grafana атрибутом `faro.measurement.context`. Тело лога — logfmt:
`faro_signal=measurement type=custom name=checkout value=1 result=success`, его разбирает `| logfmt` в LogQL.

Метки становятся измерениями в Grafana: кладите в них только значения с небольшим числом вариантов.
Идентификаторы пользователя, сессии, заказа и URL уже есть в `meta` бикона, а как метки они взорвут
кардинальность.

## SLO-метрика из нескольких шагов

`trackSlo` измеряет, за сколько страница дошла до состояния, описанного шагами, и отправляет гистограмму
длительности в миллисекундах. Каждый шаг — предикат, который опрашивается каждые 100 мс, пока не вернёт
истинное значение (`true`, найденный элемент, промис с `true`). Все шаги прошли — `result: 'success'`; какой-то не успел к дедлайну — `result: 'fail'`, и в метках
видно, какой именно.

```typescript
const pageReady = faroService.trackSlo({
  name: 'page_ready',
  failTime: 10_000,
  buckets: [100, 500, 1000, 2000, 5000, 10_000, 10_100],
  steps: {
    data: async () => (await fetchData()).ok,
    render: () => isRendered(),
    images: { check: () => asyncCheckImagesIsDisplayed('img.hero'), failTime: 3000 },
  },
});

pageReady.dispose(); // при уходе со страницы — остановить без отправки
```

| Поле              | Описание                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| `name`            | Имя метрики                                                                                             |
| `failTime`        | Дедлайн всего прогона в мс; по его истечении метрика отправляется с `fail`                              |
| `steps`           | Шаги: функция или `{ check, failTime }`. Дедлайн шага не может быть больше дедлайна прогона             |
| `buckets`         | Границы бакетов гистограммы, необязательно                                                              |
| `labels`          | Дополнительные метки: объект или функция, которая вернёт их в момент отправки, необязательно            |
| `startWhen`       | Селектор или предикат: часы не идут, пока элемент не появился в DOM или предикат `false`, необязательно |
| `pauseWhenHidden` | Пауза, пока вкладка скрыта или фокус ушёл из окна; по умолчанию `true`                                  |
| `log`             | Писать в консоль ход прогона и первую ошибку каждой проверки                                            |

- Исключение или отклонённый промис в проверке — «ещё не готов», повтор на следующем тике; асинхронная
  проверка не запускается заново, пока идёт предыдущая.
- Шаг, не успевший к дедлайну, получает `false` окончательно, но прогон ждёт остальные — до своего `failTime`.
- Время на паузе не входит ни в длительность, ни в дедлайны, поэтому пока вкладка скрыта, метрика не уходит.
  Уход фокуса во вложенный iframe паузой не считается; окно без фокуса на старте — тоже, пауза начинается
  с ухода фокуса.
- Уходит одно измерение: `unit: 'MILLISECONDS'`, `type: 'histogram'`, `result`, а в `labels` — метки из
  `labels`, результат каждого шага и `status` (то же, что `result`). Имена шагов становятся ключами меток,
  шаг с именем `status` запрещён типом, а метки не перезаписывают ни `status`, ни результаты шагов — о таком
  совпадении предупреждает консоль.
- Невалидный селектор в `startWhen` не бросает исключение: прогон ждёт, в консоли — одно предупреждение.
  Без шагов прогон не запускается и ничего не отправляет.
- Трекер сообщает `state` (`waiting`, `running`, `paused`, `done`, `disposed`) и умеет `dispose()`. Без него
  незавершённый прогон опрашивает шаги до `failTime` — при уходе со страницы вызывайте `dispose()`.

В React прогон живёт в эффекте, а смена состояния страницы — это смена зависимости эффекта:

```typescript
useEffect(() => {
  if (!isOpen) return;
  const slo = faroService.trackSlo({ name: `payments:${view}`, failTime: 40_000, steps });
  return () => slo.dispose();
}, [isOpen, view]);
```

## Проверки вёрстки

Хелперы проверяют DOM, возвращают `boolean` или `Promise<boolean>` и не бросают исключений — их можно
передавать в шаги напрямую. Невалидный селектор даёт `false` и одно предупреждение в консоли.

```typescript
import {
  asyncCheckBackgroundImagesIsDisplayed,
  asyncCheckImagesIsDisplayed,
  checkGTEAmount,
  checkRender,
  checkRenderInnerValue,
} from 'grafana-faro-wrapper';

faroService.trackSlo({
  name: 'payments:payments-all',
  failTime: 4000,
  steps: {
    tariff: () => checkRenderInnerValue('[data-slo="tariff-name"]'),
    methods: () => checkGTEAmount('[data-slo="payment-list"] li', 12),
    'method-images': () => asyncCheckImagesIsDisplayed('[data-slo="payment-list"] img'),
    'reseller-logos': () => asyncCheckBackgroundImagesIsDisplayed('[data-slo="reseller-link"]'),
    controls: () => checkRender(['[data-slo="code-input"]', '[data-slo="code-button"]']),
  },
});
```

| Хелпер                                                        | Проходит, когда                                                                     |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `checkRender(selectors)`                                      | каждый селектор (строка или массив) есть в DOM                                      |
| `checkRenderInnerValue(selectors)`                            | каждый элемент есть и содержит текст, не только пробелы                             |
| `checkEnabledButtonState(selector)`                           | кнопка есть, без `disabled` и без класса `disabled`                                 |
| `getAmount(selector)`                                         | возвращает число элементов                                                          |
| `checkAmount(selector, n)`, `checkGTEAmount(selector, n)`     | элементов ровно `n` / не меньше `n`                                                 |
| `checkImagesIsDisplayed(selector)`                            | синхронно: все картинки уже загружены (битый SVG не отличает, см. ниже)             |
| `asyncCheckImagesIsDisplayed(selector, timeoutMs?)`           | все картинки декодированы (`img.decode()`) за `timeoutMs`                           |
| `asyncCheckBackgroundImagesIsDisplayed(selector, timeoutMs?)` | у каждого элемента загрузилась своя картинка: `<img>` внутри или `background-image` |
| `extractBackgroundUrl(element)`                               | возвращает URL из `background-image` или `null`                                     |
| `loadImage(src, timeoutMs?)`                                  | картинка по адресу загрузилась за `timeoutMs`                                       |

- `timeoutMs` по умолчанию — `DEFAULT_IMAGE_TIMEOUT_MS`, 10 секунд. Нет элементов по селектору — `false`.
- Селектор может указывать на `<img>` или на обёртку: тогда проверяются картинки внутри, обёртка без них — `false`.
- Растровая картинка с нулевой шириной считается сломанной, SVG без собственных размеров — загруженным.
  Синхронная проверка не отличает битый SVG от загруженного — для SVG берите `asyncCheckImagesIsDisplayed`.
  «IsDisplayed» значит «загружено», а не «видно на экране».
- Из `background-image` берётся первый `url()`. Элемент без `<img>` и без `url()` — например, с фоном из одного
  градиента — даёт `false`; фоны `::before`/`::after` не учитываются.

## Санитизация

Перед отправкой каждый бикон проходит через встроенные санитайзеры:

- URL страницы (`meta.page.url`), атрибуты событий, значение которых целиком — `http(s)`-URL (ресурсы,
  нарушения CSP, навигация, ваши события), и файлы во фреймах стектрейса ошибок сокращаются до хоста и пути
  в нижнем регистре, а идентификаторы в пути (UUID любой версии, hex-строки от 12 символов, числа от 6 цифр,
  в том числе через `_`) заменяются на `:id`:
  `https://shop.example.com/Orders/0190a6e2-7c3b-7d4e-9f00-1a2b3c4d5e6f?token=abc` → `shop.example.com/orders/:id`.
- Метки метрик превращаются обратно в объект, чтобы в Grafana они были отдельными атрибутами, а не JSON-строкой.

Не трогаются: текст логов и ошибок, контекст логов и измерений, имя и домен события, URL внутри строки или
вложенного объекта, `meta.user`, `meta.view`, атрибуты сессии. Их чистите своим санитайзером.

Свой санитайзер получает полную копию бикона (`TransportItem` из Faro) — её можно менять на месте — и обязан
вернуть бикон; санитайзеры выполняются по порядку после встроенных. Если санитайзер бросает исключение или
ничего не возвращает, бикон не отправляется, а в консоль выводится одно предупреждение (снова — после
`destroy()` и `init()`). Ваш `beforeSend` вызывается последним и получает уже очищенный бикон; чтобы отбросить
бикон, верните `null`.

```typescript
faroService.addSanitizer((beacon) => {
  delete beacon.meta.user?.email;
  return beacon;
});
```

Те же правила доступны как функции: `sanitizeUrl(url)` возвращает хост и очищенный путь (для строки, которая не
разбирается как URL, — очищенную часть до `?` и `#`), `sanitizePath(pathname)` — очищенный путь для строки без
хоста, например для `meta.view.name` из роутера.

## API

| `FaroService`              | Описание                                                         |
| -------------------------- | ---------------------------------------------------------------- |
| `init(config): Faro`       | Инициализирует Faro или снимает его с паузы после `destroy()`    |
| `destroy()`                | Ставит Faro на паузу и сбрасывает пользовательские санитайзеры   |
| `sendMetric(metric)`       | Отправляет метрику                                               |
| `trackSlo(config)`         | Запускает SLO-прогон и возвращает `SloTracker`, не бросает       |
| `addSanitizer(fn \| fn[])` | Добавляет санитайзеры после встроенных; не функция — `TypeError` |
| `getInstance(): Faro`      | Возвращает инстанс Faro; вне `init()`…`destroy()` бросает ошибку |
| `isInitialized`            | `true` между `init()` и `destroy()`                              |

`config` (тип `FaroServiceConfig`) — `BrowserConfig` из Faro плюс `faroUrl`, `faroKey` и необязательные
`routerAdapter` и `enabled`. Вне `init()`…`destroy()` `sendMetric` и завершившийся `trackSlo` не отправляют
метрику, а выводят предупреждение.

Кроме хелперов и санитайзеров пакет реэкспортирует из Faro `getWebInstrumentations` и `TransportItemType` — для
страниц без сборщика. Типы: `FaroServiceConfig`, `FaroConfig`, `Sanitizer`, `Metric`, `MetricResult`,
`MetricUnit`, `MetricType`, `MetricLabels`, `SloConfig`, `SloTracker`, `SloRunState`, `StepCheck`, `StepConfig`;
`SloRunOptions`, `SloRunResult` и `StepResults` устарели и уйдут в 2.0.

## Миграция с 0.x

| Было                                                                        | Стало                                                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `new MetricsService(faro).sendCustomMetric(m)`                              | `faroService.sendMetric(m)`; `CustomMetric` → `Metric`, метки плоские, `description` необязателен |
| `MetricsCollector`, `addStep`, условия готовности, `getStatus()`, `reset()` | `faroService.trackSlo({ name, failTime, steps })`, шаг — предикат до `true`, `dispose()`          |
| `MetricFn`, `ReadyToCheckConditionFn`, `MetricsCollector*`                  | `StepCheck`, `StepConfig`, `SloConfig`, `SloTracker`                                              |
| `paused` в конфигурации                                                     | `enabled: false`; полей `url` и `apiKey` больше нет                                               |
| объект `renderHelpers`, глобал `FaroReactWrapper`                           | именованные экспорты, глобал `GrafanaFaroWrapper`, один файл `dist/index.umd.full.js`             |

Старый `addMetricStep(name, check, ready)` молча отбрасывал лишние аргументы — при переносе на `trackSlo`
объедините все проверки шага в одном предикате. Условие `if (!params.duration) return` перед отправкой
отбросит метрики с нулевой длительностью, в `trackSlo` оно не нужно.

## Разработка

Как предложить изменение — в [CONTRIBUTING.md](CONTRIBUTING.md); об уязвимостях сообщайте приватно, по
[SECURITY.md](SECURITY.md).

Нужен Node 22.18+ (конфиги сборки и тестов — TypeScript без загрузчика).

```bash
npm install
npm run dev                  # сборка всех бандлов и типов в watch-режиме
npm run check                # формат, линт, типы, тесты, сборка, запуск бандлов, примеры README
npm run verify:peers-floor   # типы и тесты на нижней границе peerDependencies
```

Релиз — по git-тегу `v*`: `npm version <patch|minor|major>`, затем `git push --follow-tags`. Воркфлоу
`Release` прогоняет `check`, публикует пакет в npm через Trusted Publishing и создаёт GitHub Release.
Версии с суффиксом (`1.1.0-beta.1`) уходят под dist-tag `next`.

## Лицензия

MIT © [DmitryK](https://github.com/expatriate)
