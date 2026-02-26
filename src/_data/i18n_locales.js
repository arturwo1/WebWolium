import fs from "node:fs/promises";
import path from "node:path";

export default async function () {
  const dir = path.join(process.cwd(), "src/assets/locales");
  const files = await fs.readdir(dir);

  return files
    .filter(f => f.endsWith(".json"))
    .map(f => f.replace(".json", ""));
}