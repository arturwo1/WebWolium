import fs from "node:fs";
import path from "node:path";

export default function () {
  const filePath = path.resolve("src/assets/icons/icons.svg");
  return fs.readFileSync(filePath, "utf8");
}