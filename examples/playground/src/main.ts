import {
  concurrencyLimit,
  debounce,
  debounceAsync,
  retry,
} from "@alsoftworks/temporize";

const $ = (id: string) => document.getElementById(id)!;
const item = (tag: string, text: string, className = "") =>
  Object.assign(document.createElement(tag), { textContent: text, className });

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });

const FRUIT = (
  "apple apricot banana blackberry blueberry cherry coconut grape kiwi lemon lime mango " +
  "melon orange papaya peach pear pineapple plum raspberry strawberry watermelon"
).split(" ");

// A pretend search endpoint.
async function searchFruit(query: string, signal?: AbortSignal): Promise<string[]> {
  await sleep(150, signal);
  return FRUIT.filter((fruit) => fruit.includes(query.toLowerCase()));
}

// 1. debounce: every caller gets a promise for the result of the call that actually ran.
{
  let keystrokes = 0;
  let requests = 0;
  const search = debounce((query: string) => {
    requests++;
    return searchFruit(query);
  }, 300);

  $("search").addEventListener("input", async (event) => {
    keystrokes++;
    const results = await search((event.target as HTMLInputElement).value);
    $("search-stats").textContent = `${keystrokes} keystrokes, ${requests} requests`;
    $("search-results").replaceChildren(...results.map((fruit) => item("li", fruit)));
  });
}

// 2. debounceAsync: the AbortSignal is passed in for you and left out of the call signature.
{
  let started = 0;
  let aborted = 0;
  const slowSearch = debounceAsync(
    async (query: string, signal: AbortSignal) => {
      started++;
      try {
        await sleep(800, signal);
      } catch (error) {
        aborted++;
        throw error;
      }
      return `${FRUIT.filter((fruit) => fruit.includes(query)).length} results for "${query}"`;
    },
    200,
    { overlap: "cancel-previous" },
  );

  $("slow-search").addEventListener("input", async (event) => {
    let text: string;
    try {
      text = await slowSearch((event.target as HTMLInputElement).value);
    } catch {
      text = "older request cancelled";
    }
    $("slow-stats").textContent = `${text} · started ${started}, aborted ${aborted}`;
  });
}

// 3. retry: exponential backoff with jitter. shouldRetry is a handy place to log failures.
{
  const log = $("retry-log");
  let attempt = 0;
  const callFlakyApi = retry(
    async () => {
      attempt++;
      await sleep(100);
      if (Math.random() < 0.66) throw new Error("503 Service Unavailable");
      return "200 OK";
    },
    {
      attempts: 5,
      baseDelay: 300,
      shouldRetry: (error) => {
        log.append(
          item("li", `attempt ${attempt} failed: ${(error as Error).message}`),
        );
        return true;
      },
    },
  );

  $("retry-run").addEventListener("click", async () => {
    log.replaceChildren();
    attempt = 0;
    try {
      const status = await callFlakyApi();
      log.append(item("li", `attempt ${attempt}: ${status}`, "done"));
    } catch {
      log.append(item("li", `gave up after ${attempt} attempts`, "failed"));
    }
  });
}

// 4. concurrencyLimit: extra calls wait in line, first come first served.
{
  const upload = concurrencyLimit(async (bar: HTMLElement) => {
    bar.className = "bar running";
    await sleep(600 + Math.random() * 900);
    bar.className = "bar done";
  }, 3);

  $("upload-run").addEventListener("click", async () => {
    const bars = Array.from({ length: 10 }, (_, i) =>
      item("div", `file ${i + 1}`, "bar"),
    );
    $("upload-bars").replaceChildren(...bars);
    await Promise.all(bars.map(upload));
  });
}
