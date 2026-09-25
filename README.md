# grafana-faro-wrapper

[![npm](https://img.shields.io/npm/v/grafana-faro-wrapper)](https://www.npmjs.com/package/grafana-faro-wrapper)
[![CI](https://github.com/expatriate/grafana-faro-wrapper/actions/workflows/ci.yml/badge.svg)](https://github.com/expatriate/grafana-faro-wrapper/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/grafana-faro-wrapper)](LICENSE)

Обёртка над [Grafana Faro](https://grafana.com/oss/faro/) для обычных веб-страниц и React-приложений:
инициализация одним вызовом, очистка URL от идентификаторов и пользовательские метрики.

## Возможности

- Инициализация Faro с OTLP HTTP-транспортом; тела логов для измерений и ошибок — в logfmt
- Санитизация: идентификаторы в URL страниц и ресурсов заменяются на `:id`, query и hash отбрасываются
- Пользовательские метрики с единицей, типом и метками — `MetricsService`
- SLO-метрика из нескольких шагов с таймаутом и паузой — `MetricsCollector`
- Инструментация React Router v4–v7 через `routerAdapter` — для React-приложений

## Установка

```bash
npm install grafana-faro-wrapper @grafana/faro-web-sdk @grafana/faro-transport-otlp-http
```

В React-приложении для инструментации роутера нужен ещё `@grafana/faro-react` той же версии, что и
`@grafana/faro-web-sdk`.

### Peer Dependencies

```json
{
  "@grafana/faro-transport-otlp-http": "^1.19.0 || ^2.0.0",
  "@grafana/faro-web-sdk": "^1.19.0 || ^2.0.0"
}
```

### Без сборщика

UMD-бандл берёт Faro из глобалов его собственных IIFE-бандлов, поэтому они подключаются раньше:

```html
<script src="https://unpkg.com/@grafana/faro-web-sdk/dist/bundle/faro-web-sdk.iife.js"></script>
<script src="https://unpkg.com/@grafana/faro-transport-otlp-http/dist/bundle/faro-transport-otlp-http.iife.js"></script>
<script src="https://unpkg.com/grafana-faro-wrapper"></script>
<script>
  const faro = new GrafanaFaroWrapper.FaroService();
  faro.init({
    faroUrl: 'https://otlp.example.com/v1/logs',
    faroKey: 'your-key',
    app: { name: 'my-site' },
  });
</script>
```

## Использование

### Инициализация Faro

```typescript
import { FaroService } from 'grafana-faro-wrapper';

const faro = new FaroService();

faro.init({
  faroUrl: 'https://otlp.example.com/v1/logs',
  faroKey: 'your-key',
  app: { name: 'my-app', version: '1.0.0' },
});
```

### React Router

```tsx
import { createReactRouterV6Options, FaroRoutes, ReactIntegration } from '@grafana/faro-react';
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
  app: { name: 'my-app', version: '1.0.0' },
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

Маршруты оборачиваются в `FaroRoutes` вместо `Routes`.

### Отправка метрик

```typescript
import { MetricsService } from 'grafana-faro-wrapper';

const metrics = new MetricsService(faro);

metrics.sendCustomMetric({
  name: 'user_action',
  description: 'Клик по кнопке',
  value: 1,
  unit: 'EVENTS',
  type: 'counter',
  labels: {
    action: 'click',
    component: 'button',
  },
});
```

### SLO-метрика из нескольких шагов

`MetricsCollector` ждёт, пока все шаги дадут результат, и вызывает `onSuccess`, если все прошли, или `onFail`,
если какой-то провалился или истёк `failTime`. Время на паузе в длительность не входит.

```typescript
import { MetricsCollector } from 'grafana-faro-wrapper';

const pageReady = new MetricsCollector<'data' | 'render'>({
  steps: ['data', 'render'],
  failTime: 10_000,
  onSuccess: ({ duration, steps }) => {
    /* отправить метрику */
  },
  onFail: ({ duration, steps }) => {
    /* отправить метрику */
  },
});

pageReady.addMetricStep('data', async () => (await fetchData()).ok);
pageReady.addMetricStep(
  'render',
  () => true,
  () => isRendered(),
);
```

Первый `addMetricStep` запускает отсчёт. Шаг проверяется каждые 100 мс, пока не вернёт результат;
третий аргумент — условие готовности к проверке. Есть `pause()`, `resume()`, `reset()` и `getStatus()`.

### Кастомная санитизация URL

```typescript
faro.addSanitizer((beacon) => {
  // Пользовательская логика санитизации
  return sanitizedBeacon;
});
```

## API

### FaroService

Основной сервис для интеграции с Grafana Faro.

Методы:

- `init(config)`: Инициализация сервиса
- `addSanitizer(fn)`: Добавление пользовательской функции санитизации
- `getInstance()`: Получение инстанса Faro
- `destroy()`: Остановка отправки и сброс пользовательских санитайзеров

Faro регистрируется один раз на страницу, поэтому `destroy()` ставит его на паузу, а следующий `init()` снимает
паузу с того же инстанса. Из новой конфигурации применяется только `beforeSend`; при смене `faroUrl`, `faroKey`
или `app` выводится предупреждение, остальные опции остаются от первого `init()`.

### MetricsService

Сервис для работы с метриками.

Методы:

- `sendCustomMetric(metric)`: Отправка пользовательской метрики

### MetricsCollector

Сбор SLO-метрики из нескольких шагов, см. пример выше.

### Типы метрик

```typescript
type MetricUnit =
  | 'BYTES'
  | 'MILLISECONDS'
  | 'SECONDS'
  | 'REQUESTS'
  | 'ERRORS'
  | 'OPERATIONS'
  | 'EVENTS'
  | 'UNITLESS';
type MetricType = 'histogram' | 'counter' | 'gauge';
```

## Разработка

```bash
npm install
npm run dev          # сборка в watch-режиме
npm run typecheck
npm test
npm run build
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
