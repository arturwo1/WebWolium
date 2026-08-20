import { generateFakeProfileData, createRng } from "@/lib/demo/fakeProfile.js";

export default function () {
  return generateFakeProfileData(createRng(Date.now()), "desktop");
}