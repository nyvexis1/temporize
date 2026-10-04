import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Each error class must be defined in exactly one file per module format.
// A copy inlined into an adapter entry breaks `instanceof` checks against the
// class exported from the core entry.
const errorClasses = ["TemporizeAbortError", "TemporizeTimeoutError"];
const formats = [".js", ".cjs"];

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

const files = listFiles("dist");
let failed = false;

for (const format of formats) {
  const sources = files
    .filter((file) => file.endsWith(format))
    .map((file) => [file, readFileSync(file, "utf8")]);
  for (const name of errorClasses) {
    const definitions = sources
      .filter(([, source]) => source.includes(`.name="${name}"`))
      .map(([file]) => file);
    console.log(`${name} (${format}): defined in ${definitions.join(", ")}`);
    if (definitions.length !== 1) {
      failed = true;
      console.error(
        `${name} must be defined in exactly one ${format} file, found ${definitions.length}`,
      );
    }
  }
}

if (failed) process.exitCode = 1;
