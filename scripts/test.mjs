import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function findTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findTests(path);
    return entry.isFile() && entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

const files = findTests(
  fileURLToPath(new URL("../test/", import.meta.url)),
).sort();
if (files.length === 0) throw new Error("No TypeScript tests found");

const require = createRequire(import.meta.url);
const result = spawnSync(
  process.execPath,
  [require.resolve("tsx/cli"), "--test", ...process.argv.slice(2), ...files],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
