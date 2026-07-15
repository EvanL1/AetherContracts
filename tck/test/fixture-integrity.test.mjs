import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { decodeJson } from "../lib/strict-json.mjs";

const repositoryRoot = new URL("../../", import.meta.url);

async function readJson(relativePath) {
  return decodeJson(await readFile(new URL(relativePath, repositoryRoot)));
}

for (const manifestPath of [
  "fixtures/cloudlink/v1alpha1/fixture-manifest.json",
  "fixtures/thing-model/v1alpha1/fixture-manifest.json",
]) {
  test(`${manifestPath} pins every fixture byte sequence`, async () => {
    const manifest = await readJson(manifestPath);
    const baseUrl = new URL(manifestPath, repositoryRoot);

    for (const fixture of manifest.fixtures) {
      const bytes = await readFile(new URL(fixture.file, baseUrl));
      const actual = createHash("sha256").update(bytes).digest("hex");
      assert.equal(actual, fixture.sha256, fixture.file);
    }
  });
}

test("Voltage migration records provenance without importing the product catalog", async () => {
  const provenance = await readJson("fixtures/thing-model/v1alpha1/voltage/provenance.json");

  assert.equal(provenance.source.repository, "https://github.com/EvanL1/voltage-product-lib");
  assert.equal(provenance.source.license_evidence, "README-only-MIT-claim");
  assert.equal(provenance.catalog_copied, false);
  assert.deepEqual(provenance.mapping, {
    P: "properties",
    M: "points",
    A: "capabilities",
  });
  assert.deepEqual(
    provenance.manual_resolutions.map((resolution) => resolution.diagnostic),
    [
      "AMBIGUOUS_NUMERIC_TYPE",
      "AMBIGUOUS_NUMERIC_TYPE",
      "LEGACY_ACTION_TYPE_NOT_PARAMETER_SCHEMA",
      "UNIT_NORMALIZED",
    ],
  );
});
