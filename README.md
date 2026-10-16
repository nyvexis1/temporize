# temporize

[![npm version](https://img.shields.io/npm/v/%40alsoftworks%2Ftemporize)](https://www.npmjs.com/package/@alsoftworks/temporize)
[![npm downloads](https://img.shields.io/npm/dm/%40alsoftworks%2Ftemporize)](https://www.npmjs.com/package/@alsoftworks/temporize)
[![CI](https://github.com/nyvexis1/temporize/actions/workflows/ci.yml/badge.svg)](https://github.com/nyvexis1/temporize/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/bundlephobia/minzip/%40alsoftworks%2Ftemporize)](https://bundlephobia.com/package/@alsoftworks/temporize)

Debounce, throttle, retry, timeouts, polling and concurrency limits that
actually understand promises.

If you've ever installed `p-debounce`, `p-limit`, `p-retry` and `p-timeout` in
the same project, temporize is all of that in one package. Every function keeps
your types, returns a promise you can `await`, and can be cancelled. Each one is
under 1 kB gzipped, with no dependencies, and it works with both `import` and
`require`.

**[Try it in your browser →](https://stackblitz.com/github/nyvexis1/temporize/tree/main/examples/playground?file=src/main.ts)**

```sh
npm install @alsoftworks/temporize
```

## The problem it solves

`lodash.debounce` was written before promises were everywhere. Wrap an async
function with it and you lose the result:

```ts
import debounce from "lodash.debounce";

const search = debounce(fetchResults, 300);
const results = await search("cats"); // undefined, or a stale result from an earlier call
```

With temporize, every call gets the result of the call that actually ran, and
errors reject like you'd expect:

```ts
import { debounce } from "@alsoftworks/temporize";

const search = debounce(fetchResults, 300);
const results = await search("cats"); // typed as whatever fetchResults returns
```

## What's inside

| Function           | Use it to…                                                  | Size  |
| ------------------ | ----------------------------------------------------------- | ----- |
| `debounce`         | wait until calls stop, then run once                        | 724 B |
| `debounceAsync`    | debounce, and decide what happens when a slow call overlaps | 999 B |
| `throttle`         | run at most once per window                                 | 762 B |
| `throttlePromise`  | queue every call and start one per window (rate limiting)   | 559 B |
| `rafThrottle`      | run at most once per animation frame                        | 236 B |
| `sample`           | render the latest value on a fixed clock                    | 303 B |
| `batch`            | collect calls and send them as one request                  | 511 B |
| `concurrencyLimit` | run at most N at once, queue the rest                       | 525 B |
| `retry`            | retry failures with exponential backoff and jitter          | 661 B |
| `timeout`          | give up on calls that take too long                         | 501 B |
| `poll`             | call something repeatedly until a condition is true         | 745 B |
| `once`             | share one initialization between every caller               | 462 B |
| `idle`             | defer non-urgent work until the browser is idle             | 242 B |

Sizes are minified and gzipped, measured per function when tree-shaken. There
are also [React hooks and Vue composables](#react-and-vue).

## A quick tour

**Cancel stale requests.** When a new search starts, abort the one still in
flight so an old response can never overwrite a newer one. The `AbortSignal` is
passed in for you and left out of the function you call:

```ts
import { debounceAsync } from "@alsoftworks/temporize";

const loadUser = debounceAsync(
  async (id: string, signal: AbortSignal) => {
    const response = await fetch(`/api/users/${id}`, { signal });
    return response.json() as Promise<User>;
  },
  200,
  { overlap: "cancel-previous" },
);

const user = await loadUser("user_123");
```

**Retry a flaky API**, but stop right away on errors that won't fix themselves:

```ts
import { retry } from "@alsoftworks/temporize";

const getReport = retry(fetchReport, {
  attempts: 4,
  baseDelay: 250,
  shouldRetry: (error) => !(error instanceof NotFoundError),
});
```

**Upload 100 files, three at a time:**

```ts
import { concurrencyLimit } from "@alsoftworks/temporize";

const upload = concurrencyLimit(uploadFile, 3);
await Promise.all(files.map(upload));
```

**Give up after two seconds**, and actually stop the request:

```ts
import { timeout } from "@alsoftworks/temporize";

const fetchWithin2s = timeout(
  (url: string, signal?: AbortSignal) => fetch(url, { signal }),
  2_000,
);
```

**Wait for a background job to finish:**

```ts
import { poll } from "@alsoftworks/temporize";

const waitForJob = poll(getJob, 500, {
  until: (job) => job.status === "done",
  timeout: 30_000,
});
```

**Turn many small calls into one request:**

```ts
import { batch } from "@alsoftworks/temporize";

const markRead = batch(async (calls: Array<[id: string]>) => {
  await api.markRead(calls.map(([id]) => id));
}, 50);

markRead("a");
markRead("b"); // both end up in a single api.markRead(["a", "b"])
```

Anything that waits can be cancelled with `.cancel()` or an `AbortSignal`, and
cancelled calls reject with a `TemporizeAbortError` so nothing hangs forever.
The [full API docs](https://github.com/nyvexis1/temporize/blob/main/docs/API.md)
cover every option.

## React and Vue

Optional adapters live in their own entry points, so the core never loads
React or Vue code.

```tsx
import { useEffect, useState } from "react";
import { useDebouncedValue } from "@alsoftworks/temporize/react";

function Search() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);

  useEffect(() => {
    if (debouncedQuery) void fetch(`/api/search?q=${debouncedQuery}`);
  }, [debouncedQuery]);

  return <input value={query} onChange={(e) => setQuery(e.target.value)} />;
}
```

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useDebouncedRef } from "@alsoftworks/temporize/vue";

const query = ref("");
const debouncedQuery = useDebouncedRef(query, 300);
</script>
```

Both adapters export `useDebounce`, `useThrottle` and `useRafThrottle`. React
also has `useDebouncedValue`, and Vue has `useDebouncedRef`. Pending work is
cancelled when the component unmounts.

## How it compares

|                                     | temporize                     | lodash                      | p-\* packages                                     |
| ----------------------------------- | ----------------------------- | --------------------------- | ------------------------------------------------- |
| Debounce/throttle an async function | Every caller gets the result  | Stale result or `undefined` | `p-debounce`, `p-throttle`                        |
| Concurrency limit                   | `concurrencyLimit`            | —                           | `p-limit`                                         |
| Retry with backoff                  | `retry`                       | —                           | `p-retry`                                         |
| Timeout                             | `timeout`                     | —                           | `p-timeout`                                       |
| Poll until ready                    | `poll`                        | —                           | `p-wait-for`                                      |
| Cancellation                        | `.cancel()` and `AbortSignal` | `.cancel()`                 | Varies by package                                 |
| `import` and `require`              | Both                          | Both                        | `import` only; latest versions need Node 20 or 22 |
| Packages to install                 | 1                             | 1, or 1 per function        | 1 per function                                    |

To be fair to the alternatives:

- **lodash is faster** when you don't need the result. temporize creates a
  promise for every call. For hot paths like scroll handlers, `rafThrottle`
  doesn't, and plain `lodash.throttle` is fine too.
- **`p-throttle` can allow N calls per interval.** `throttlePromise` starts one
  call per window.
- **`p-retry` and `p-limit` have more knobs**, such as hooks on each failed
  attempt and changing the limit at runtime. temporize keeps the API small.
- **DataLoader gives each caller its own result.** In temporize's `batch`,
  every caller in a batch gets the same result.

## Scope

temporize is only about _when_, _how often_ and _for how long_ code runs. It
won't grow array, object or string helpers. That's on purpose.

## Contributing

Bug reports and pull requests are welcome. See
[CONTRIBUTING.md](./CONTRIBUTING.md) for setup and checks, and
[CHANGELOG.md](./CHANGELOG.md) for what changed in each release.

## License

MIT. See [LICENSE](LICENSE). Development and benchmark references are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); none of them ship in the
package.
