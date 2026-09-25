# grafana-faro-wrapper

[![npm](https://img.shields.io/npm/v/grafana-faro-wrapper)](https://www.npmjs.com/package/grafana-faro-wrapper)
[![CI](https://github.com/expatriate/grafana-faro-wrapper/actions/workflows/ci.yml/badge.svg)](https://github.com/expatriate/grafana-faro-wrapper/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/grafana-faro-wrapper)](LICENSE)

Обёртка над [Grafana Faro](https://grafana.com/oss/faro/) для обычных веб-страниц и React-приложений.
Подключает Faro одним вызовом с отправкой по OTLP, убирает идентификаторы из URL и добавляет пользовательские
метрики и SLO-метрики из нескольких шагов.

- **`FaroService`** — инициализация Faro с OTLP HTTP-транспортом, санитизация биконов, пауза и повторный запуск.
- **`sendMetric`** — пользовательские метрики с единицей, типом, метками и результатом.
- **`trackSlo`** — SLO-метрика: ждёт, пока пройдут все шаги, с дедлайнами, паузой при скрытой вкладке и
  отправкой в едином формате.
- **Проверки вёрстки** — готовые проверки для шагов: элементы отрисованы, их достаточно, картинки и фоны
  загрузились.

Работает с Faro 1.19+ и 2.x. Бандл собран под ES2019 и работает в Chrome 73+, Firefox 69+, Safari 12.1+.

## Установка

```bash
npm install grafana-faro-wrapper @grafana/faro-web-sdk @grafana/faro-transport-otlp-http
```

Для инструментации React Router нужен ещё `@grafana/faro-react` той же версии, что и `@grafana/faro-web-sdk`.

### Без сборщика

Пакет подключается к любой HTML-странице. Есть два UMD-бандла, оба выставляют глобал `GrafanaFaroWrapper`:

- `dist/index.umd.full.js` — с Faro внутри, один файл на страницу:

  ```html
  <script src="https://unpkg.com/grafana-faro-wrapper/dist/index.umd.full.js"></script>
  <script>
    const faro = new GrafanaFaroWrapper.FaroService();
    faro.init({
      faroUrl: 'https://otlp.example.com/v1/logs',
      faroKey: 'your-key',
      app: { name: 'my-site' },
    });
  </script>
  ```

- `dist/index.umd.js` (его отдают `unpkg`/`jsdelivr` по умолчанию) — берёт Faro из глобалов его IIFE-бандлов,
  поэтому они идут раньше:

  ```html
  <script src="https://unpkg.com/@grafana/faro-web-sdk@2/dist/bundle/faro-web-sdk.iife.js"></script>
  <script src="https://unpkg.com/@grafana/faro-transport-otlp-http@2/dist/bundle/faro-transport-otlp-http.iife.js"></script>
  <script src="https://unpkg.com/grafana-faro-wrapper"></script>
  ```

Стандартные инструментации Faro (`getWebInstrumentations`) в полном бандле не экспортируются: он собирает
только то, что передано в `init` явно.

## Быстрый старт

```typescript
import { getWebInstrumentations } from '@grafana/faro-web-sdk';
import { FaroService } from 'grafana-faro-wrapper';

export const faro = new FaroService();

faro.init({
  faroUrl: 'https://otlp.example.com/v1/logs',
  faroKey: 'your-key',
  app: { name: 'my-app', version: '1.0.0', environment: 'production' },
  instrumentations: getWebInstrumentations(),
});
```

- `faroUrl` — OTLP-эндпоинт для логов, `faroKey` — API-ключ. Трейсы не отправляются.
- Остальные поля — обычный `BrowserConfig` Faro: `app`, `user`, `sessionTracking`, `batching` и т. д. Полей `url`
  и `apiKey` в типе нет: их заменяет собственный транспорт обёртки.
- Свои `transports` добавляются к OTLP-транспорту, а не заменяют его.
- `enabled: false` инициализирует Faro на паузе — ничего не отправляется, например в dev-окружении.

> [!IMPORTANT]
> По умолчанию `instrumentations` — пустой список: Faro сам не собирает ни ошибки, ни Web Vitals, ни сессии,
> а отправляет только то, что вы передаёте явно. Чтобы получить стандартный набор Faro, передайте
> `getWebInstrumentations()`, как в примере выше.

Тела логов для измерений и ошибок пишутся в logfmt, поэтому их можно разбирать в LogQL через `| logfmt`:

```text
faro_signal=measurement type=custom name=checkout value=1 result=success
faro_signal=error type=TypeError message="Cannot read properties of undefined"
```

### React Router

```tsx
import { createReactRouterV6Options, FaroRoutes, ReactIntegration } from '@grafana/faro-react';
import { getWebInstrumentations } from '@grafana/faro-web-sdk';
import { FaroService } from 'grafana-faro-wrapper';
import {
  createRoutesFromChildren,
  matchRoutes,
  Routes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

const faro = new FaroService();

faro.init({
  faroUrl: 'https://otlp.example.com/v1/logs',
  faroKey: 'your-key',
  app: { name: 'my-app' },
  instrumentations: getWebInstrumentations(),
  routerAdapter: new ReactIntegration({
    router: createReactRouterV6Options({
      createRoutesFromChildren,
      matchRoutes,
      Routes,
      useLocation,
      useNavigationType,
    }),
  }),
});
```

Затем замените `Routes` на `FaroRoutes`. Для других версий роутера подойдут `createReactRouterV4Options`,
`createReactRouterV5Options`, `createReactRouterV7Options` и data-router варианты из `@grafana/faro-react`.

## Санитизация

Перед отправкой каждый бикон проходит через санитайзеры:

- URL страницы (`meta.page.url`) и все URL в атрибутах событий — ресурсов, нарушений CSP (`documentURI`,
  `referrer`), навигации (`fromUrl`, `toUrl`) и ваших собственных — сокращаются до хоста и пути в нижнем
  регистре, а идентификаторы в пути заменяются на `:id`. URL-атрибутом считается строка, начинающаяся
  с `http://` или `https://`. Идентификаторами считаются UUID любой версии, в том числе с суффиксом,
  hex-строки от 12 символов и числа от 6 цифр.

  ```text
  https://shop.example.com/Orders/0190a6e2-7c3b-7d4e-9f00-1a2b3c4d5e6f?token=abc#top
  → shop.example.com/orders/:id
  ```

- Метки пользовательских метрик превращаются обратно в объект, чтобы в Grafana они были отдельными атрибутами,
  а не JSON-строкой.

Свой санитайзер получает копию бикона — `TransportItem` из Faro — и должен вернуть бикон. Санитайзеры
выполняются по порядку после встроенных:

```typescript
faro.addSanitizer((beacon) => ({
  ...beacon,
  meta: { ...beacon.meta, user: { ...beacon.meta?.user, email: undefined } },
}));
```

Санитайзер обязан вернуть бикон. Если он бросает исключение или ничего не возвращает, бикон не отправляется,
чтобы неочищенные данные не ушли в Grafana, а в консоль один раз выводится предупреждение.

Ваш `beforeSend` вызывается последним и получает уже очищенный бикон. Чтобы отбросить бикон, верните `null`.

## Пользовательские метрики

```typescript
faro.sendMetric({
  name: 'checkout',
  value: 1,
  description: 'Оформленный заказ',
  unit: 'EVENTS',
  type: 'counter',
  labels: { payment: 'card' },
  result: 'success',
});
```

| Поле          | Тип                                           | Описание                                                                                     |
| ------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `name`        | `string`                                      | Имя метрики                                                                                  |
| `value`       | `number`                                      | Значение; не число (`NaN`) даёт `0`                                                          |
| `unit`        | `MetricUnit`                                  | `BYTES`, `MILLISECONDS`, `SECONDS`, `REQUESTS`, `ERRORS`, `OPERATIONS`, `EVENTS`, `UNITLESS` |
| `type`        | `MetricType`                                  | `counter`, `gauge`, `histogram`                                                              |
| `result`      | `'success' \| 'fail'`                         | Итог, попадает в тело лога, необязательно                                                    |
| `labels`      | `Record<string, string \| number \| boolean>` | Плоские метки, типы значений сохраняются, необязательно                                      |
| `buckets`     | `number[]`                                    | Границы бакетов гистограммы, необязательно                                                   |
| `description` | `string`                                      | Описание, необязательно                                                                      |
| `timestamp`   | `number`                                      | Время события в мс, по умолчанию — момент вызова                                             |

Каждый вызов отправляет отдельное измерение, одинаковые метрики подряд не схлопываются. Поля попадают
в контекст измерения под ключами `measurement.*` — они экспортируются как `MEASUREMENT_KEYS`. Если Faro ещё
не инициализирован, метрика не отправляется, а в консоль выводится предупреждение.

## SLO-метрика из нескольких шагов

`trackSlo` измеряет, за сколько страница дошла до состояния, описанного шагами, и отправляет гистограмму
длительности в миллисекундах. Каждый шаг — предикат, который опрашивается каждые 100 мс, пока не вернёт
`true`. Когда все шаги прошли — `result: 'success'`; если какой-то шаг не успел к своему дедлайну —
`result: 'fail'`, и в метках видно, какой именно.

```typescript
const pageReady = faro.trackSlo({
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

| Поле              | Описание                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `name`            | Имя метрики                                                                                     |
| `failTime`        | Дедлайн всего прогона в мс; по его истечении метрика отправляется с `fail`                      |
| `steps`           | Шаги: функция или `{ check, failTime }`. Дедлайн шага не может быть больше дедлайна прогона     |
| `buckets`         | Границы бакетов гистограммы, необязательно                                                      |
| `labels`          | Функция, которая возвращает дополнительные метки в момент отправки, необязательно               |
| `startWhen`       | Предикат: пока он `false`, часы не идут — например, пока не появился нужный блок, необязательно |
| `pauseWhenHidden` | Пауза, пока вкладка скрыта или окно без фокуса; по умолчанию `true`                             |
| `log`             | Писать ход прогона в консоль                                                                    |

- Проверка шага запускается сразу при старте, а затем каждые 100 мс. Исключение или отклонённый промис —
  «ещё не готов», повтор на следующем тике. Асинхронная проверка не запускается заново, пока идёт предыдущая.
- Шаг, не успевший к дедлайну, получает `false` окончательно, но прогон ждёт остальные шаги — до своего
  `failTime`.
- Время на паузе не входит ни в длительность, ни в дедлайны.
- Отправляется одно измерение: `value` — длительность, `unit: 'MILLISECONDS'`, `type: 'histogram'`,
  `result`, а в `labels` — `status` (то же, что `result`), результат каждого шага (`true`/`false`) и метки из
  `labels()`.
- `state` трекера: `waiting` (ждёт `startWhen`), `running`, `paused`, `done`, `disposed`.
- Без `dispose()` незавершённый прогон опрашивает шаги до `failTime`; при уходе со страницы, например при
  размонтировании компонента, вызывайте `dispose()` — метрика при этом не отправляется.

В React прогон живёт в эффекте, а смена состояния страницы — это смена зависимости эффекта:

```typescript
useEffect(() => {
  if (!isOpen) return;
  const slo = faro.trackSlo({ name: `payments:${view}`, failTime: 40_000, steps });
  return () => slo.dispose();
}, [isOpen, view]);
```

## Проверки вёрстки

Хелперы проверяют DOM и возвращают `boolean` или `Promise<boolean>`, не бросая исключений, поэтому подходят
и как проверка шага, и как условие готовности:

```typescript
import {
  asyncCheckBackgroundImagesIsDisplayed,
  asyncCheckImagesIsDisplayed,
  checkGTEAmount,
  checkRender,
  checkRenderInnerValue,
} from 'grafana-faro-wrapper';

faro.trackSlo({
  name: 'payments:payments-all',
  failTime: 4000,
  steps: {
    tariff: () => checkRenderInnerValue(['[data-slo="tariff-name"]']),
    methods: () => checkGTEAmount('[data-slo="payment-list"] li', 12),
    'method-images': () => asyncCheckImagesIsDisplayed('[data-slo="payment-list"] img'),
    'reseller-logos': () => asyncCheckBackgroundImagesIsDisplayed('[data-slo="reseller-link"]'),
    controls: () => checkRender(['[data-slo="code-input"]', '[data-slo="code-button"]']),
  },
});
```

| Хелпер                                                        | Проходит, когда                                                                     |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `checkRender(selectors)`                                      | каждый селектор есть в DOM                                                          |
| `checkRenderInnerValue(selectors)`                            | каждый элемент есть и не пустой                                                     |
| `checkEnabledButtonState(selector)`                           | кнопка есть, без `disabled` и без класса `disabled`                                 |
| `getAmount(selector)`                                         | возвращает число элементов                                                          |
| `checkAmount(selector, n)`, `checkGTEAmount(selector, n)`     | элементов ровно `n` / не меньше `n`                                                 |
| `checkImagesIsDisplayed(selector)`                            | синхронно: все картинки уже загружены                                               |
| `asyncCheckImagesIsDisplayed(selector, timeoutMs?)`           | все картинки декодированы (`img.decode()`) за `timeoutMs`                           |
| `asyncCheckBackgroundImagesIsDisplayed(selector, timeoutMs?)` | у каждого элемента загрузилась своя картинка: `<img>` внутри или `background-image` |
| `extractBackgroundUrl(element)`                               | возвращает URL из `background-image` или `null`                                     |
| `loadImage(src, timeoutMs?)`                                  | картинка по адресу загрузилась за `timeoutMs`                                       |

- `timeoutMs` по умолчанию — `DEFAULT_IMAGE_TIMEOUT_MS` (10 секунд). Картинка, которая не загрузилась за это
  время, не прошла проверку.
- Если элементов по селектору нет, проверки возвращают `false` — шаг просто ждёт следующего тика, пока
  элементы не появятся.
- Растровая картинка с нулевой шириной считается сломанной, SVG без собственных размеров — загруженным.
- «IsDisplayed» значит «загружено», а не «видно на экране»: элемент с `display: none` тоже пройдёт проверку.
- Из `background-image` берётся первый `url()`: у `image-set(...)` это первый вариант, а не тот, что выбрал
  браузер. Фон только из градиента и фоны псевдоэлементов `::before`/`::after` не проверяются.

Те же функции доступны объектом `renderHelpers` — так они назывались в прежней сборке:
`const { checkRender } = GrafanaFaroWrapper.renderHelpers`.

## Остановка и повторный запуск

Faro регистрируется один раз на страницу. Поэтому `destroy()` ставит его на паузу и сбрасывает
пользовательские санитайзеры, а следующий `init()` снимает паузу с того же инстанса. Из новой конфигурации
применяется только `beforeSend`. Если изменились `faroUrl`, `faroKey` или `app`, в консоль выводится
предупреждение, а остальные опции остаются от первого `init()`.

## API

### `FaroService`

| Член                       | Описание                                                       |
| -------------------------- | -------------------------------------------------------------- |
| `init(config): Faro`       | Инициализирует Faro или снимает его с паузы после `destroy()`  |
| `addSanitizer(fn \| fn[])` | Добавляет санитайзеры после встроенных                         |
| `getInstance(): Faro`      | Возвращает инстанс Faro; до `init()` бросает ошибку            |
| `isInitialized`            | `true` между `init()` и `destroy()`                            |
| `destroy()`                | Ставит Faro на паузу и сбрасывает пользовательские санитайзеры |
| `sendMetric(metric)`       | Отправляет метрику, поля — см. таблицу выше                    |
| `trackSlo(config)`         | Запускает SLO-прогон и возвращает `SloTracker`                 |

`config` (тип `FaroServiceConfig`) — это `BrowserConfig` из Faro плюс `faroUrl`, `faroKey` и необязательные
`routerAdapter` и `enabled`.

### `SloTracker`

| Член        | Описание                                           |
| ----------- | -------------------------------------------------- |
| `state`     | `waiting`, `running`, `paused`, `done`, `disposed` |
| `dispose()` | Останавливает прогон без отправки метрики          |

### Типы

`FaroServiceConfig`, `FaroConfig`, `Sanitizer`, `Metric`, `MetricResult`, `MetricUnit`, `MetricType`, `MetricLabels`,
`SloConfig`, `SloTracker`, `SloRunState`, `SloRunResult`, `StepCheck`, `StepConfig`, `StepResults`.

Хелперы проверки вёрстки описаны в разделе «Проверки вёрстки».

## Разработка

```bash
npm install
npm run dev              # сборка в watch-режиме
npm run typecheck
npm run format           # Prettier; в CI — format:check
npm test
npm run build
npm run verify:package   # точки входа, типы и загрузка UMD
```

## Релизы

Релиз выпускается по git-тегу `v*`:

```bash
npm version minor    # или patch / major / prerelease --preid beta
git push --follow-tags
```

Воркфлоу `Release` проверяет, что тег совпадает с версией в `package.json`, прогоняет типы, тесты и сборку,
публикует пакет в npm через Trusted Publishing и создаёт GitHub Release с заметками из коммитов и PR.
Версии с суффиксом (`1.0.0-beta.1`) публикуются под dist-tag `next` и помечаются как pre-release.

## Лицензия

MIT
