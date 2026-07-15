import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { decodeJson } from "../lib/strict-json.mjs";

const repositoryRoot = new URL("../../", import.meta.url);

async function readText(relativePath) {
  return readFile(new URL(relativePath, repositoryRoot), "utf8");
}

async function readJson(relativePath) {
  return decodeJson(await readFile(new URL(relativePath, repositoryRoot)));
}

test("every release-facing surface declares one version", async () => {
  const rootPackage = await readJson("package.json");
  const expected = rootPackage.version;
  const [typescriptPackage, contractManifest, scenarioSet, scenarioSchema] =
    await Promise.all([
      readJson("packages/typescript/package.json"),
      readJson("contract-manifest.json"),
      readJson("tck/scenarios/core.json"),
      readJson("schemas/tck/v1alpha1/scenario.schema.json"),
    ]);

  assert.equal(typescriptPackage.version, expected);
  assert.equal(contractManifest.release_version, expected);
  assert.equal(scenarioSet.contract_version, expected);
  assert.equal(scenarioSchema.properties.contract_version.const, expected);

  const cargo = await readText("Cargo.toml");
  assert.match(cargo, new RegExp(`^version = "${expected.replaceAll(".", "\\.")}"$`, "m"));

  const cmake = await readText("CMakeLists.txt");
  assert.match(
    cmake,
    new RegExp(`set\\(AETHER_CONTRACTS_CONTRACT_VERSION "${expected.replaceAll(".", "\\.")}"\\)`),
  );
  assert.match(
    cmake,
    new RegExp(
      `set\\(AETHER_CONTRACTS_CMAKE_COMPAT_VERSION "${expected
        .split("-")[0]
        .replaceAll(".", "\\.")}"\\)`,
    ),
  );

  const specifications = (await readdir(new URL("spec/", repositoryRoot))).filter((name) =>
    name.endsWith(".md"),
  );
  for (const specification of specifications) {
    assert.match(await readText(`spec/${specification}`), new RegExp(`^version: ${expected}$`, "m"));
  }
});
