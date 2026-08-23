import { generateFakeServersData } from "@/lib/demo/fakeServers.js";
import { createRng } from "@/lib/demo/rng.js";

export default function () {
  return generateFakeServersData(createRng(Date.now()));
}