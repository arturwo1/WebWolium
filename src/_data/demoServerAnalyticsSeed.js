import { generateFakeServerAnalytics } from "@/lib/demo/fakeServer.js";
import { createRng } from "@/lib/demo/rng.js";

export default function () {
  return generateFakeServerAnalytics(createRng(Date.now()));
}