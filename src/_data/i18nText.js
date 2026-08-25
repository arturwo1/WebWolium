import fs from "node:fs";
import path from "node:path";

const en = JSON.parse(
  fs.readFileSync(path.resolve(".", "src/assets/locales/en.json"), "utf-8")
);

export function t(key) {
  return en[key] || key;
}