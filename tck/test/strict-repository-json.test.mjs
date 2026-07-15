import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { decodeJson } from "../lib/strict-json.mjs";

const repositoryRoot = new URL("../../", import.meta.url);

async function jsonFiles(relativePath) {
  const entries = await readdir(new URL(relativePath, repositoryRoot), {
    withFileTypes: true,
  });
  const files = [];
  for (const entry of entries) {
    const child = `${relativePath}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await jsonFiles(`${child}/`)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(child);
    }
  }
  return files;
}

test("all repository contract JSON passes the strict raw preflight", async () => {
  const files = [
    "contract-manifest.json",
    ...(await jsonFiles("compatibility/")),
    ...(await jsonFiles("fixtures/")),
    ...(await jsonFiles("profiles/")),
    ...(await jsonFiles("schemas/")),
    ...(await jsonFiles("tck/scenarios/")),
  ];

  assert.ok(files.length > 0);
  for (const file of files.sort()) {
    const bytes = await readFile(new URL(file, repositoryRoot));
    assert.doesNotThrow(
      () => decodeJson(bytes),
      file,
    );
  }
});
