# grafana-faro-wrapper

[![npm](https://img.shields.io/npm/v/grafana-faro-wrapper)](https://www.npmjs.com/package/grafana-faro-wrapper)
[![CI](https://github.com/expatriate/grafana-faro-wrapper/actions/workflows/ci.yml/badge.svg)](https://github.com/expatriate/grafana-faro-wrapper/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/grafana-faro-wrapper)](LICENSE)

Обёртка над [Grafana Faro](https://grafana.com/oss/faro/) для обычных веб-страниц и React-приложений.
Подключает Faro одним вызовом с отправкой по OTLP, убирает идентификаторы из URL и добавляет пользовательские
метрики и SLO-метрики из нескольких шагов.

- **`FaroService`** — инициализация Faro с OTLP HTTP-транспортом, санитизация биконов, пауза и повторный запуск.
- **`MetricsService`** — пользовательские метрики с единицей, типом, метками и результатом.
- **`MetricsCollector`** — SLO-метрика: ждёт, пока пройдут все шаги, с таймаутом и паузой.

Работает с Faro 1.19+ и 2.x. Бандл собран под ES2019 и работает в Chrome 73+, Firefox 69+, Safari 12.1+.

## Установка

```bash
npm install grafana-faro-wrapper @grafana/faro-web-sdk @grafana/faro-transport-otlp-http
```

Для инструментации React Router нужен ещё `@grafana/faro-react` той же версии, что и `@grafana/faro-web-sdk`.

### Без сборщика

Пакет подключается к любой HTML-странице. UMD-бандл берёт Faro из глобалов его IIFE-бандлов, поэтому они
идут раньше:

```html
<script src="https://unpkg.com/@grafana/faro-web-sdk@2/dist/bundle/faro-web-sdk.iife.js"></script>
<script src="https://unpkg.com/@grafana/faro-transport-otlp-http@2/dist/bundle/faro-transport-otlp-http.iife.js"></script>
<script src="https://unpkg.com/grafana-faro-wrapper"></script>
<script>
  const faro = new GrafanaFaroWrapper.FaroService();
  faro.init({
    faroUrl: 'https://otlp.example.com/v1/logs',
    faroKey: 'your-key',
    app: { name: 'my-site' },
    instrumentations: GrafanaFaroWebSdk.getWebInstrumentations(),
  });
</script>
```

Всё, что пакет экспортирует, доступно в глобале `GrafanaFaroWrapper`.

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
- Остальные поля — обычный `BrowserConfig` Faro: `app`, `user`, `sessionTracking`, `batching` и т. д. Поля `url` и `apiKey` не передавайте: их заменяет
  собственный транспорт обёртки.
- Свои `transports` добавляются к OTLP-транспорту, а не заменяют его.

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

Свой санитайзер получает копию бикона и должен вернуть бикон. Санитайзеры выполняются по порядку после
встроенных:

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
import { MetricsService } from 'grafana-faro-wrapper';

const metrics = new MetricsService(faro);

metrics.sendCustomMetric({
  name: 'checkout',
  value: 1,
  description: 'Оформленный заказ',
  unit: 'EVENTS',
  type: 'counter',
  labels: { payment: 'card' },
  result: 'success',
});
```

| Поле          | Тип                                                | Описание                                                                                     |
| ------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `name`        | `string`                                           | Имя метрики                                                                                  |
| `value`       | `number \| string`                                 | Значение; строка приводится к числу, нечисловая даёт `0`                                     |
| `description` | `string`                                           | Описание                                                                                     |
| `unit`        | `MetricUnit`                                       | `BYTES`, `MILLISECONDS`, `SECONDS`, `REQUESTS`, `ERRORS`, `OPERATIONS`, `EVENTS`, `UNITLESS` |
| `type`        | `MetricType`                                       | `counter`, `gauge`, `histogram`                                                              |
| `labels`      | `Record<string, string \| Record<string, string>>` | Метки, необязательно                                                                         |
| `status`      | `string`                                           | Статус, необязательно                                                                        |
| `result`      | `string`                                           | Результат, попадает в тело лога, необязательно                                               |
| `buckets`     | `(number \| string)[]`                             | Границы бакетов гистограммы, необязательно                                                   |
| `timestamp`   | `number`                                           | Время события в мс, по умолчанию — момент вызова                                             |

Каждый вызов отправляет отдельное измерение, одинаковые метрики подряд не схлопываются. Поля попадают
в контекст измерения под ключами `measurement.*` — они экспортируются как `MEASUREMENT_KEYS`. Если Faro ещё
не инициализирован, метрика не отправляется, а в консоль выводится предупреждение.

## SLO-метрика из нескольких шагов

`MetricsCollector` ждёт, пока каждый шаг даст результат. Если все шаги прошли, вызывается `onSuccess`. Если
какой-то шаг провалился или истёк `failTime`, вызывается `onFail`, а шаги без результата считаются
проваленными. Время на паузе в длительность не входит.

```typescript
import { MetricsCollector } from 'grafana-faro-wrapper';

const pageReady = new MetricsCollector<'data' | 'render'>({
  steps: ['data', 'render'],
  failTime: 10_000,
  onSuccess: ({ duration }) =>
    metrics.sendCustomMetric({
      name: 'page_ready',
      value: duration,
      description: 'Время до готовности страницы',
      unit: 'MILLISECONDS',
      type: 'histogram',
      result: 'success',
    }),
  onFail: ({ duration, steps }) =>
    metrics.sendCustomMetric({
      name: 'page_ready',
      value: duration,
      description: 'Время до готовности страницы',
      unit: 'MILLISECONDS',
      type: 'histogram',
      result: 'fail',
      labels: {
        failed_steps: Object.entries(steps)
          .filter(([, passed]) => !passed)
          .map(([step]) => step)
          .join(','),
      },
    }),
});

pageReady.addMetricStep('data', async () => (await fetchData()).ok);
pageReady.addMetricStep(
  'render',
  () => true,
  () => isRendered(),
);
```

- Первый `addMetricStep` запускает отсчёт. Шаги не из `steps` и повторная регистрация шага игнорируются.
- Проверка шага запускается каждые 100 мс, пока не вернёт результат. Исключение или отклонённый промис
  считаются провалом.
- Третий аргумент — условие готовности: пока оно возвращает `false`, проверка не запускается. Если условие
  бросает исключение, шаг считается проваленным.
- `pause()` и `resume()` останавливают и продолжают отсчёт — например, пока вкладка скрыта.
- `reset()` сбрасывает результаты и останавливает таймеры, после него сбор можно запустить заново. Без `failTime`
  сборщик опрашивает незавершённые шаги до конца жизни страницы, поэтому при уходе со страницы, например
  при размонтировании компонента, вызывайте `reset()`.
- `getStatus()` возвращает `isRunning`, `isPaused`, `isDone`, `runningTime`, `pausedDuration`, `remainingTime`
  и списки `registeredMetrics`, `completedMetrics`, `pendingMetrics`.
- `log: true` пишет ход сбора в консоль.

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

`config` (тип `FaroServiceConfig`) — это `BrowserConfig` из Faro плюс `faroUrl`, `faroKey` и необязательный
`routerAdapter`.

### `MetricsService`

| Член                              | Описание                               |
| --------------------------------- | -------------------------------------- |
| `new MetricsService(faroService)` | Сервис поверх `FaroService`            |
| `sendCustomMetric(metric)`        | Отправляет метрику, поля — см. таблицу |

### `MetricsCollector<T>`

| Член                                                                  | Описание                                      |
| --------------------------------------------------------------------- | --------------------------------------------- |
| `new MetricsCollector({ steps, failTime?, onSuccess, onFail, log? })` | Сборщик для шагов `T`                         |
| `addMetricStep(step, check, isReady?)`                                | Регистрирует проверку шага и запускает отсчёт |
| `start()`, `pause()`, `resume()`, `reset()`                           | Управление отсчётом                           |
| `getStatus()`                                                         | Текущее состояние                             |

Колбэки получают `{ timestamp, duration, steps }`, где `steps` — результат по каждому шагу.

### Типы

`FaroServiceConfig`, `FaroConfig`, `Sanitizer`, `CustomMetricBase`, `MetricUnit`, `MetricType`, `MetricLabel`,
`MetricsCollectorConfig`, `MetricsCollectorCallback`, `MetricFn`, `ReadyToCheckConditionFn`.

## Миграция с 0.2

- `FaroRoute`, `FaroRoutes` и `withFaroRouterInstrumentation` больше не реэкспортируются — импортируйте их
  из `@grafana/faro-react`.
- Peer-зависимость `@grafana/faro-react` заменена на `@grafana/faro-web-sdk`.
- UMD-бандл переехал в `dist/index.umd.js` и называется `GrafanaFaroWrapper`.
- `timestamp` в `sendCustomMetric` стал необязательным и теперь действительно задаёт время метрики.
- `MetricsCollectorCallback.steps` типизирован по именам шагов.

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
