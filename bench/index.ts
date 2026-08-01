import { Bench } from "tinybench";
import lodashDebounce from "lodash.debounce";
import lodashThrottle from "lodash.throttle";
import { debounce, throttle } from "../src";

const bench = new Bench({ time: 0, iterations: 10_000, warmup: false });
const noop = (): void => {};
const temporizeDebounced = debounce(noop, 60_000, { leading: true, trailing: false });
const lodashDebounced = lodashDebounce(noop, 60_000, {
  leading: true,
  trailing: false,
});
const temporizeThrottled = throttle(noop, 60_000, { leading: true, trailing: false });
const lodashThrottled = lodashThrottle(noop, 60_000, {
  leading: true,
  trailing: false,
});

bench
  .add(
    "temporize debounce dispatch",
    () => {
      void temporizeDebounced();
    },
    {
      afterEach: () => void temporizeDebounced.flush(),
    },
  )
  .add(
    "lodash debounce dispatch",
    () => {
      lodashDebounced();
    },
    {
      afterEach: () => lodashDebounced.cancel(),
    },
  )
  .add(
    "temporize throttle dispatch",
    () => {
      void temporizeThrottled();
    },
    {
      afterEach: () => void temporizeThrottled.flush(),
    },
  )
  .add(
    "lodash throttle dispatch",
    () => {
      lodashThrottled();
    },
    {
      afterEach: () => lodashThrottled.cancel(),
    },
  );

await bench.run();
console.table(
  bench.tasks.map(({ name, result }) => ({
    name,
    "ops/sec": Math.round(result?.hz ?? 0).toLocaleString(),
    "mean (ns)": Math.round((result?.mean ?? 0) * 1e6).toLocaleString(),
  })),
);

temporizeDebounced.cancel();
lodashDebounced.cancel();
temporizeThrottled.cancel();
lodashThrottled.cancel();
