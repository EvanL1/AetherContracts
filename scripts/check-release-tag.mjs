import { readFile } from "node:fs/promises";

const tag = process.env.AETHER_RELEASE_TAG ?? process.env.GITHUB_REF_NAME;
if (tag === undefined) {
  throw new Error("AETHER_RELEASE_TAG or GITHUB_REF_NAME is required");
}

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const expected = `v${packageJson.version}`;
if (tag !== expected) {
  throw new Error(`release tag ${tag} does not match ${expected}`);
}

process.stdout.write(`release tag ${tag} matches the contract version\n`);
