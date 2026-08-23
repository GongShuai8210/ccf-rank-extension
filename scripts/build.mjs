import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildDataModule } from "./build-data.mjs";
import { ROOT } from "./validate-data.mjs";

const EXTENSION_DIR = path.join(ROOT, "extension");
const DIST_DIR = path.join(ROOT, "dist");

function assertInside(parent, target) {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing operation outside ${parent}: ${target}`);
  }
}
async function writeManifest(targetDirectory, transform = (manifest) => manifest) {
  const manifestPath = path.join(targetDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await writeFile(
    manifestPath,
    `${JSON.stringify(transform(manifest), null, 2)}\n`,
    "utf8",
  );
}

export async function buildExtension() {
  const packageJson = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const sourceManifest = JSON.parse(
    await readFile(path.join(EXTENSION_DIR, "manifest.json"), "utf8"),
  );
  if (packageJson.version !== sourceManifest.version) {
    throw new Error(
      `package.json version ${packageJson.version} differs from manifest ${sourceManifest.version}`,
    );
  }

  await buildDataModule();
  await mkdir(DIST_DIR, { recursive: true });
  const targets = {
    chrome: path.join(DIST_DIR, "chrome"),
    firefox: path.join(DIST_DIR, "firefox"),
  };
  for (const target of Object.values(targets)) {
    assertInside(DIST_DIR, target);
    await rm(target, { recursive: true, force: true });
    await cp(EXTENSION_DIR, target, { recursive: true });
  }

  await writeManifest(targets.chrome, (manifest) => {
    delete manifest.browser_specific_settings;
    return manifest;
  });
  await writeManifest(targets.firefox);

  return { version: packageJson.version, targets };
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  const result = await buildExtension();
  console.log(
    JSON.stringify(
      {
        version: result.version,
        chrome: path.relative(ROOT, result.targets.chrome),
        firefox: path.relative(ROOT, result.targets.firefox),
      },
      null,
      2,
    ),
  );
}
