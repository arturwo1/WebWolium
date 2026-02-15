import fs from "node:fs/promises";
import path from "node:path";

async function copy(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
  console.log(`[postbuild] ${src} -> ${dest}`);
}

const root = process.cwd();
const outDir = path.resolve(root, "_site");

await copy(path.resolve(root, "src", "sw.js"), path.resolve(outDir, "sw.js"));
await copy(path.resolve(root, "src", "assets", "config.js"), path.resolve(outDir, "assets", "config.js"));