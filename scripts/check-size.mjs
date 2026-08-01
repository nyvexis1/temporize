import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const exportsToCheck = [
  "debounce",
  "throttle",
  "rafThrottle",
  "throttlePromise",
  "debounceAsync",
  "batch",
  "retry",
  "idle",
  "concurrencyLimit",
  "TemporizeAbortError",
  "TemporizeTimeoutError",
];
const budget = 1_000;
let failed = false;

for (const name of exportsToCheck) {
  const result = await build({
    stdin: {
      contents: `export { ${name} } from "./src/index.ts";`,
      resolveDir: process.cwd(),
      sourcefile: `${name}.ts`,
    },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "neutral",
    target: "es2020",
    treeShaking: true,
    write: false,
  });
  const bytes = gzipSync(result.outputFiles[0].contents, { level: 9 }).byteLength;
  console.log(`${name}: ${bytes} B gzipped`);
  if (bytes > budget) {
    failed = true;
    console.error(`${name} exceeds the ${budget} B core export budget`);
  }
}

if (failed) process.exitCode = 1;

for (const [name, entry, peer] of [
  ["react adapter", "src/react/index.ts", "react"],
  ["vue adapter", "src/vue/index.ts", "vue"],
]) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    external: [peer],
    minify: true,
    format: "esm",
    platform: "neutral",
    target: "es2020",
    treeShaking: true,
    write: false,
  });
  const bytes = gzipSync(result.outputFiles[0].contents, { level: 9 }).byteLength;
  console.log(`${name}: ${bytes} B gzipped`);
  if (bytes > 1_500) {
    process.exitCode = 1;
    console.error(`${name} exceeds the 1500 B adapter budget`);
  }
}
