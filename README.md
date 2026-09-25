# grafana-faro-wrapper

[![npm](https://img.shields.io/npm/v/grafana-faro-wrapper)](https://www.npmjs.com/package/grafana-faro-wrapper)
[![CI](https://github.com/expatriate/grafana-faro-wrapper/actions/workflows/ci.yml/badge.svg)](https://github.com/expatriate/grafana-faro-wrapper/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/grafana-faro-wrapper)](LICENSE)

Обёртка над [Grafana Faro](https://grafana.com/oss/faro/) для React-приложений: инициализация одним вызовом,
очистка URL от идентификаторов и пользовательские метрики.

## Возможности

- Инициализация Faro с OTLP HTTP-транспортом; тела логов для измерений и ошибок — в logfmt
- Санитизация: идентификаторы в URL страниц и ресурсов заменяются на `:id`, query и hash отбрасываются
- Пользовательские метрики с единицей, типом и метками — `MetricsService`
- SLO-метрика из нескольких шагов с таймаутом и паузой — `MetricsCollector`
- Инструментация React Router v4–v7 через `routerAdapter`

## Установка

```bash
npm install grafana-faro-wrapper @grafana/faro-react @grafana/faro-transport-otlp-http
```

### Peer Dependencies

```json
{
  "@grafana/faro-react": "^1.19.0 || ^2.0.0",
  "@grafana/faro-transport-otlp-http": "^1.19.0 || ^2.0.0"
}
```

## Использование

### Инициализация Faro

```tsx
import { createReactRouterV6Options, ReactIntegration } from '@grafana/faro-react';
import { FaroRoutes, FaroService } from 'grafana-faro-wrapper';
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
  timestamp: Date.now(),
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
- `destroy()`: Очистка ресурсов

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
