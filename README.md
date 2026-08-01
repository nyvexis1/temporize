# temporize

[![npm version](https://img.shields.io/npm/v/%40alsoftworks%2Ftemporize)](https://www.npmjs.com/package/@alsoftworks/temporize)
[![npm downloads](https://img.shields.io/npm/dm/%40alsoftworks%2Ftemporize)](https://www.npmjs.com/package/@alsoftworks/temporize)
[![CI](https://github.com/nyvexis1/temporize/actions/workflows/ci.yml/badge.svg)](https://github.com/nyvexis1/temporize/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/bundlephobia/minzip/%40alsoftworks%2Ftemporize)](https://bundlephobia.com/package/@alsoftworks/temporize)

Small, strongly typed timing and concurrency utilities for modern TypeScript.
Every scheduled call returns a real promise for the wrapped function's actual
result. There are no runtime dependencies, and the package ships as ESM and
CommonJS.

## Install

```sh
npm install @alsoftworks/temporize
```

## Why temporize?

| Capability                                   | temporize                          | lodash.debounce / lodash.throttle      |
| -------------------------------------------- | ---------------------------------- | -------------------------------------- |
| Inferred arguments and resolved return value | Full generic inference             | Types available separately             |
| Per-call return                              | `Promise<Awaited<R>>`              | Last synchronous result or `undefined` |
| Async error propagation                      | Native promise rejection           | Caller manages returned value          |
| Cancellation                                 | `.cancel()` and `AbortSignal`      | `.cancel()`                            |
| Maximum debounce wait                        | Yes                                | Yes                                    |
| Promise queue rate limiter                   | `throttlePromise`                  | No                                     |
| Async overlap policy                         | `debounceAsync`                    | No                                     |
| Animation-frame throttling                   | Browser API plus Node fallback     | No                                     |
| Multi-call argument batching                 | `batch`                            | No                                     |
| Exponential-backoff retries                  | `retry`                            | No                                     |
| Idle-period scheduling                       | `idle` with Safari/Node fallback   | No                                     |
| Concurrent promise limiting                  | `concurrencyLimit` with FIFO queue | No                                     |
| Runtime dependencies                         | Zero                               | Zero for per-method packages           |
| Modules                                      | ESM and CommonJS                   | CommonJS per-method packages           |

### Scope

temporize deliberately focuses on controlling when and how often work runs.
Debouncing, throttling, batching, retry timing, frame scheduling, and idle
scheduling all belong to that family. Object, array, string, and other general
utility helpers are intentionally out of scope; that boundary is a design
decision, not an omission.

## Usage

### `debounce`

```ts
import { debounce } from "@alsoftworks/temporize";

const search = debounce(
  async (query: string) => {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    return response.json() as Promise<{ total: number }>;
  },
  250,
  { maxWait: 1_000 },
);

const result = await search("type inference");
console.log(result.total);

search.pending();
await search.flush();
search.cancel();
```

Several calls coalesced into one invocation each receive a separate promise
settled with that invocation's result. A leading-only debounce resolves calls
suppressed within the window with the leading invocation's result.

### `throttle`

```ts
import { throttle } from "@alsoftworks/temporize";

const savePosition = throttle(
  (x: number, y: number) => ({ x, y, savedAt: Date.now() }),
  100,
  { leading: true, trailing: true },
);

const saved = await savePosition(120, 80);
```

Regular throttling coalesces excess calls and uses the latest arguments for a
trailing invocation.

### `rafThrottle`

```ts
import { rafThrottle } from "@alsoftworks/temporize";

const updateLayout = rafThrottle((width: number) => {
  document.documentElement.style.setProperty("--viewport-width", `${width}px`);
});

window.addEventListener("resize", () => updateLayout(window.innerWidth));

// Discard a frame that has been requested but has not run.
updateLayout.cancel();
```

In browsers, `rafThrottle` uses `requestAnimationFrame`. During SSR and in Node,
it falls back to a 16 ms `setTimeout`, so importing and calling it is safe when
animation-frame globals do not exist.

### `debounceAsync`

```ts
import { debounceAsync } from "@alsoftworks/temporize";

const loadUser = debounceAsync(
  async (id: string, signal: AbortSignal) => {
    const response = await fetch(`/api/users/${id}`, { signal });
    return response.json() as Promise<{ id: string; name: string }>;
  },
  200,
  { overlap: "cancel-previous" },
);

// The AbortSignal parameter is supplied internally and omitted from this call.
const user = await loadUser("user_123");
```

The overlap policies are:

- `"queue"` (default): keep each fired invocation and start it after active
  work settles.
- `"drop"`: do not start the overlapping invocation; its callers adopt the
  active invocation's promise.
- `"cancel-previous"`: abort the active invocation's internally supplied
  signal and immediately start the new invocation. JavaScript functions that
  do not declare a signal safely ignore the extra argument.

For typed signal injection, declare a required `AbortSignal` as the wrapped
function's final parameter. `debounceAsync` removes that parameter from the
returned function's call signature. Cancellation is cooperative: an async
operation must observe the signal to stop its in-flight work.

### `throttlePromise`

```ts
import { throttlePromise } from "@alsoftworks/temporize";

const sendRequest = throttlePromise(
  async (path: string) => fetch(path).then((response) => response.status),
  100,
);

const requests = [
  sendRequest("/api/one"),
  sendRequest("/api/two"),
  sendRequest("/api/three"),
];

console.log(sendRequest.queued());
console.log(await Promise.all(requests));
```

Every call enters a FIFO queue and starts at least one window after the prior
start. The queue limits dispatch rate, not concurrency: a slow promise may
still be active when the next window begins.

### `batch`

```ts
import { batch } from "@alsoftworks/temporize";

const markNotificationsRead = batch(
  async (calls: Array<[notificationId: string]>) => {
    const ids = calls.map(([notificationId]) => notificationId);
    const response = await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!response.ok) throw new Error("Could not mark notifications as read");
    return ids.length;
  },
  50,
  { maxSize: 100 },
);

const first = markNotificationsRead("notification_1");
const second = markNotificationsRead("notification_2");

// Both promises resolve to 2 because both calls shared one batch invocation.
console.log(await first, await second);
```

Unlike `debounce`, `batch` retains every argument tuple. The wrapped function
runs once with the complete array, and every caller in that batch receives the
same result or error.

### `retry`

```ts
import { retry } from "@alsoftworks/temporize";

const controller = new AbortController();
const fetchJson = retry(
  async (url: string) => {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json() as Promise<unknown>;
  },
  {
    attempts: 4,
    baseDelay: 250,
    maxDelay: 2_000,
    signal: controller.signal,
  },
);

const data = await fetchJson("/api/flaky-report");
```

Retries use exponential backoff and randomized jitter by default. Supply
`shouldRetry` when permanent errors should stop immediately.

### `idle`

```ts
import { idle } from "@alsoftworks/temporize";

const recordAnalytics = idle(
  (eventName: string, properties: object) => {
    navigator.sendBeacon("/analytics", JSON.stringify({ eventName, properties }));
  },
  { timeout: 2_000 },
);

recordAnalytics("dashboard_viewed", { source: "navigation" });
```

Rapid calls are coalesced using the latest arguments and deferred until the
browser is idle. Safari, Node, and other environments without
`requestIdleCallback` use a 1 ms timer fallback.

### `concurrencyLimit`

```ts
import { concurrencyLimit } from "@alsoftworks/temporize";

const upload = concurrencyLimit(async (file: File) => {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/uploads", { method: "POST", body });
  if (!response.ok) throw new Error(`Upload failed: ${file.name}`);
  return response.json();
}, 3);

const uploaded = await Promise.all(files.map(upload));
console.log(upload.pending(), upload.queued());
```

At most three uploads start together. Excess calls wait in FIFO order.
`upload.cancel()` rejects queued calls, but deliberately lets uploads already in
flight finish because the wrapped function may not be cancellable. Later calls
can be queued normally; aborting the configured signal also rejects future calls.

## Framework Adapters

React and Vue adapters are optional subpath exports. Installing
`@alsoftworks/temporize`
does not install either framework, and importing the core package does not load
adapter code. Add only the peer your application already uses.

### React

```sh
npm install @alsoftworks/temporize react
```

Import hooks from `@alsoftworks/temporize/react`:

```tsx
import { useEffect, useState } from "react";
import { useDebouncedValue } from "@alsoftworks/temporize/react";

export function Search(): JSX.Element {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);

  useEffect(() => {
    if (!debouncedQuery) return;
    void fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`);
  }, [debouncedQuery]);

  return (
    <input
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      placeholder="Search"
    />
  );
}
```

Use `useThrottle` for high-frequency browser events. The hook keeps a stable
function identity, invokes the latest callback closure, and cancels pending
trailing work when the component unmounts.

```tsx
import { useEffect, useState } from "react";
import { TemporizeAbortError } from "@alsoftworks/temporize";
import { useThrottle } from "@alsoftworks/temporize/react";

export function ScrollPosition(): JSX.Element {
  const [position, setPosition] = useState(0);
  const updatePosition = useThrottle((next: number) => {
    setPosition(next);
  }, 100);

  useEffect(() => {
    const handleScroll = () => {
      void updatePosition(window.scrollY).catch((error: unknown) => {
        if (!(error instanceof TemporizeAbortError)) throw error;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [updatePosition]);

  return <output>{position}</output>;
}
```

The React entry point exports `useDebounce`, `useThrottle`,
`useDebouncedValue`, and `useRafThrottle`. Every function wrapper exposes the
same `cancel`, `flush`, and `pending` methods as its core equivalent;
`useRafThrottle` exposes `cancel`.

### Vue

```sh
npm install @alsoftworks/temporize vue
```

Import composables from `@alsoftworks/temporize/vue`. `useDebouncedRef` accepts
a raw value, ref, computed ref, or getter and returns a normal writable ref.

```vue
<script setup lang="ts">
import { ref, watch } from "vue";
import { useDebouncedRef } from "@alsoftworks/temporize/vue";

const query = ref("");
const debouncedQuery = useDebouncedRef(query, 300);

watch(debouncedQuery, (value) => {
  if (!value) return;
  void fetch(`/api/search?q=${encodeURIComponent(value)}`);
});
</script>

<template>
  <input v-model="query" placeholder="Search" />
</template>
```

Use the Vue throttle composable for scroll handling. Pending work is cancelled
through Vue's `onUnmounted` lifecycle automatically.

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { TemporizeAbortError } from "@alsoftworks/temporize";
import { useThrottle } from "@alsoftworks/temporize/vue";

const position = ref(0);
const updatePosition = useThrottle((next: number) => {
  position.value = next;
}, 100);

const handleScroll = () => {
  void updatePosition(window.scrollY).catch((error: unknown) => {
    if (!(error instanceof TemporizeAbortError)) throw error;
  });
};

onMounted(() => window.addEventListener("scroll", handleScroll, { passive: true }));
onUnmounted(() => window.removeEventListener("scroll", handleScroll));
</script>

<template>
  <output>{{ position }}</output>
</template>
```

The Vue entry point exports `useDebounce`, `useThrottle`, `useDebouncedRef`,
and `useRafThrottle`. React and Vue are optional peer dependencies, so the core
library retains zero framework and runtime dependencies.

## API reference

### `debounce(fn, wait, options?)`

Returns `(...args) => Promise<Awaited<R>>` with:

- `cancel(): void` clears the timer and rejects calls waiting to run with a
  `TemporizeAbortError`. It does not stop work already invoked.
- `flush(): Promise<Awaited<R>> | undefined` immediately runs pending trailing
  work and returns the shared result promise. It returns the most recent result
  when no work is pending, or `undefined` before any invocation exists.
- `pending(): boolean` reports whether trailing work is waiting to run.

`DebounceOptions`:

| Option     | Default | Meaning                                                                                         |
| ---------- | ------- | ----------------------------------------------------------------------------------------------- |
| `leading`  | `false` | Invoke at the beginning of the quiet window.                                                    |
| `trailing` | `true`  | Invoke with the latest arguments at its end.                                                    |
| `maxWait`  | none    | Force an invocation during a continuous call stream. Values below `wait` are clamped to `wait`. |
| `signal`   | none    | Cancel pending work on abort and reject calls made after abort.                                 |

Negative and non-finitely falsy waits are treated as zero. A zero-wait trailing
call still runs in a later timer task.

### `throttle(fn, wait, options?)`

Returns the same promise function and lifecycle methods as `debounce`.
`ThrottleOptions`:

| Option     | Default | Meaning                                                         |
| ---------- | ------- | --------------------------------------------------------------- |
| `leading`  | `true`  | Invoke at the beginning of the first window.                    |
| `trailing` | `true`  | Invoke at the end with the latest suppressed call.              |
| `signal`   | none    | Cancel pending work on abort and reject calls made after abort. |

### `rafThrottle(fn)`

Returns a void function with `cancel(): void`. Repeated calls before a frame are
coalesced and the latest arguments and `this` value are used.

### `debounceAsync(fn, wait, options?)`

Returns the same lifecycle shape as `debounce`. `DebounceAsyncOptions` includes
all `DebounceOptions` plus:

| Option    | Default   | Meaning                                                                             |
| --------- | --------- | ----------------------------------------------------------------------------------- |
| `overlap` | `"queue"` | Use `"queue"`, `"drop"`, or `"cancel-previous"` when a firing overlaps active work. |

Calling `.cancel()` rejects scheduled debounce work and overlap jobs that are
queued but not started. It does not implicitly abort active work; the
`"cancel-previous"` policy aborts active work when its replacement starts.

### `throttlePromise(fn, wait, options?)`

Returns `(...args) => Promise<Awaited<R>>` with:

- `cancel(): void` rejects every queued call and clears the drain timer.
- `flush(): Promise<Awaited<R>> | undefined` immediately starts the next item.
- `pending(): boolean` reports a queued item or scheduled drain.
- `queued(): number` returns the number of calls not yet started.

`ThrottlePromiseOptions`:

| Option    | Default | Meaning                                                               |
| --------- | ------- | --------------------------------------------------------------------- |
| `leading` | `true`  | Start the first queued call immediately; when false, wait one window. |
| `signal`  | none    | Cancel queued work on abort and reject calls made after abort.        |

### `batch(fn, wait, options?)`

Returns `(...args) => Promise<R>` with:

- `cancel(): void` rejects all calls still queued in the current batch.
- `flush(): Promise<R> | undefined` immediately invokes queued work and returns
  the shared result promise.
- `pending(): boolean` reports whether the current batch contains calls.
- `size(): number` returns the number of queued argument tuples.

`BatchOptions`:

| Option    | Default   | Meaning                                                                         |
| --------- | --------- | ------------------------------------------------------------------------------- |
| `maxSize` | unlimited | Fire immediately when the queue reaches this size. Values below `1` become `1`. |
| `signal`  | none      | Cancel queued work on abort and reject calls made after abort.                  |

The wrapped function receives `Args[]`, preserving every call's complete
argument tuple. It runs only once per batch, so all callers in that batch settle
with the same result or error.

### `retry(fn, options?)`

Returns an async function with the same inferred arguments and resolved result.
The first successful attempt resolves the call. Exhaustion rejects with a
`TemporizeTimeoutError` whose `attempts` and `cause` expose the attempt count
and last failure. Aborting rejects immediately with `TemporizeAbortError`.

`RetryOptions`:

| Option        | Default           | Meaning                                                                  |
| ------------- | ----------------- | ------------------------------------------------------------------------ |
| `attempts`    | `3`               | Maximum total invocations, including the first.                          |
| `baseDelay`   | `200`             | Delay in milliseconds after the first failure.                           |
| `maxDelay`    | `5000`            | Maximum delay between attempts.                                          |
| `factor`      | `2`               | Exponential multiplier for each subsequent delay.                        |
| `jitter`      | `true`            | Randomize each delay between zero and its calculated value.              |
| `shouldRetry` | retry every error | Decide whether a failure and its one-based attempt number are retryable. |
| `signal`      | none              | Abort an active wait and prevent future attempts.                        |

### `idle(fn, options?)`

Returns a void function with `cancel(): void`. Calls before the idle callback
runs are coalesced using the latest arguments and `this` value.

`IdleOptions`:

| Option    | Default         | Meaning                                               |
| --------- | --------------- | ----------------------------------------------------- |
| `timeout` | browser default | Native `requestIdleCallback` timeout in milliseconds. |

When idle callbacks are unavailable, scheduling falls back to `setTimeout(fn,
1)`.

### `concurrencyLimit(fn, max, options?)`

Returns `(...args) => Promise<R>` with:

- `cancel(): void` rejects queued calls without interrupting work already in
  flight; later calls remain usable.
- `pending(): number` returns the number of running calls.
- `queued(): number` returns the number of calls waiting for a slot.

Calls start in FIFO order as slots become available. `max` must be a positive
integer and invalid values throw a synchronous `TypeError`. Passing
`{ signal }` applies the same queued-only cancellation rule and preserves the
signal's abort reason on `TemporizeAbortError.reason`.

### Errors

`TemporizeAbortError` identifies cancellation by `.cancel()` or an
`AbortSignal`. Its `reason` and `cause` preserve a supplied signal reason.
`TemporizeTimeoutError` identifies exhausted retries and exposes `attempts`
plus the last underlying error through `cause`.

## Size and builds

`npm run build` emits minified ESM, CommonJS, and declarations in `dist/`.
The implementation is tree-shakeable (`sideEffects: false`) and has no runtime
dependencies. The core exports are designed to remain below 1 kB each after
minification and gzip when consumed individually. Current tree-shaken ESM
measurements with esbuild are: `debounce` 721 B, `throttle` 759 B,
`rafThrottle` 236 B, `throttlePromise` 559 B, `debounceAsync` 997 B, `batch`
512 B, `retry` 662 B, `idle` 241 B, and `concurrencyLimit` 526 B.
`debounceAsync` is closest to the budget because its concurrency state machine
and internal AbortController must cover all three overlap policies.

Use a bundle analyzer in the final application because shared helpers, module
format wrappers, and bundler chunking affect attributed per-export sizes.

The optional adapters are measured as independent, minified ESM bundles with
their framework peer externalized. The React entry is 1,169 B gzipped and the
Vue entry is 1,089 B gzipped. Both include the core scheduling code they use
and remain below the separate 1.5 kB adapter budget.

## Development

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run size
npm run bench
```

Use `npm run build:core` or `npm run test:core` when working only on the
framework-free entry point. `npm publish` runs the complete tests, strict type
check, and all three builds automatically through `prepublishOnly`.

React, Vue, jsdom, and their testing utilities are repository-only development
dependencies. npm does not support installing only a named subset of one
package's `devDependencies`, so contributors running a normal `npm install`
receive the adapter test stack. Package consumers do not: React and Vue are
optional peers, stay external in adapter builds, and never enter the core
bundle.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution requirements and
[CHANGELOG.md](./CHANGELOG.md) for release history.

The tinybench benchmark measures raw wrapper dispatch overhead against the
standalone `lodash.debounce` and `lodash.throttle` packages. It intentionally
does not claim behavioral equivalence: temporize allocates a real promise for
every call, which is part of its contract and part of the measured cost.

## License

MIT. See [LICENSE](LICENSE). Third-party development and benchmark references
are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); they are not
included in Temporize's runtime bundles.
