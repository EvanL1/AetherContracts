import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import { decodeJson } from "../lib/strict-json.mjs";

const repositoryRoot = new URL("../../", import.meta.url);
const manifests = [
  "fixtures/cloudlink/v1alpha1/fixture-manifest.json",
  "fixtures/thing-model/v1alpha1/fixture-manifest.json",
];

async function readJson(relativePath) {
  return decodeJson(await readFile(new URL(relativePath, repositoryRoot)));
}

async function fixtureFiles(directory, prefix = "") {
  const entries = await readdir(new URL(`${directory}${prefix}`, repositoryRoot), {
    withFileTypes: true,
  });
  const files = [];
  for (const entry of entries) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await fixtureFiles(directory, `${relative}/`)));
    } else if (entry.isFile() && entry.name.endsWith(".json") && entry.name !== "fixture-manifest.json") {
      files.push(relative);
    }
  }
  return files;
}

test("fixture manifests validate against the shared closed schema", async () => {
  const schema = await readJson("schemas/tck/v1alpha1/fixture-manifest.schema.json");
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

  for (const path of manifests) {
    assert.equal(validate(await readJson(path)), true, `${path}: ${JSON.stringify(validate.errors)}`);
  }
});

for (const path of manifests) {
  test(`${path} is a unique exact set of on-disk fixture JSON`, async () => {
    const manifest = await readJson(path);
    const directory = path.slice(0, -"fixture-manifest.json".length);
    const declared = manifest.fixtures.map((fixture) => fixture.file);

    assert.equal(new Set(declared).size, declared.length, "duplicate manifest fixture path");
    assert.deepEqual(declared.toSorted(), (await fixtureFiles(directory)).toSorted());

    for (const file of declared) {
      assert.match(file, /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\).+\.json$/);
    }
    for (const file of manifest.derived_fixtures ?? []) {
      assert.equal(declared.includes(file), true, `undeclared derived fixture: ${file}`);
    }
  });
}
