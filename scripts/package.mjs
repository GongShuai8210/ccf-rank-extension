import { readdir, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import JSZip from "jszip";

import { buildExtension } from "./build.mjs";
import { ROOT } from "./validate-data.mjs";

const ARTIFACT_DIR = path.join(ROOT, "artifacts");
const ARCHIVE_DATE = new Date("2026-03-17T00:00:00.000Z");

async function addDirectory(zip, rootDirectory, currentDirectory = rootDirectory) {
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
  for (const entry of entries) {
    const absolutePath = path.join(currentDirectory, entry.name);
    if (entry.isDirectory()) {
      await addDirectory(zip, rootDirectory, absolutePath);
    } else if (entry.isFile()) {
      const relativePath = path.relative(rootDirectory, absolutePath).split(path.sep).join("/");
      zip.file(relativePath, await readFile(absolutePath), {
        date: ARCHIVE_DATE,
        unixPermissions: 0o100644,
      });
    }
  }
}
export async function packageExtension() {
  const build = await buildExtension();
  const resolvedArtifacts = path.resolve(ARTIFACT_DIR);
  const expectedArtifacts = path.resolve(ROOT, "artifacts");
  if (resolvedArtifacts !== expectedArtifacts) {
    throw new Error(`Unexpected artifact directory: ${resolvedArtifacts}`);
  }
  await rm(resolvedArtifacts, { recursive: true, force: true });
  await mkdir(resolvedArtifacts, { recursive: true });

  const outputs = [];
  for (const [browser, directory] of Object.entries(build.targets)) {
    const zip = new JSZip();
    await addDirectory(zip, directory);
    const bytes = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
      platform: "UNIX",
    });
    const outputPath = path.join(
      resolvedArtifacts,
      `ccf-rank-${build.version}-${browser}.zip`,
    );
    await writeFile(outputPath, bytes);
    outputs.push({ browser, outputPath, bytes: bytes.length });
  }
  return outputs;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  const outputs = await packageExtension();
  console.log(
    JSON.stringify(
      outputs.map((output) => ({
        browser: output.browser,
        file: path.relative(ROOT, output.outputPath),
        bytes: output.bytes,
      })),
      null,
      2,
    ),
  );
}
