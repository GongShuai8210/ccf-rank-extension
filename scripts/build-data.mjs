import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadAndValidateData, ROOT } from "./validate-data.mjs";

const OUTPUT_PATH = path.join(ROOT, "extension", "data", "ccf-2026.js");

export async function buildDataModule() {
  const data = await loadAndValidateData();
  const contents = [
    "/* Generated from data/ccf-2026.json. Do not edit by hand. */",
    `globalThis.CCF_RANK_DATA = ${JSON.stringify(data)};`,
    "",
  ].join("\n");
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, contents, "utf8");
  return { data, outputPath: OUTPUT_PATH, bytes: Buffer.byteLength(contents) };
}
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  const result = await buildDataModule();
  console.log(
    JSON.stringify(
      {
        venues: result.data.venues.length,
        output: path.relative(ROOT, result.outputPath),
        bytes: result.bytes,
      },
      null,
      2,
    ),
  );
}
