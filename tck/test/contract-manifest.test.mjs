import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { decodeJson } from "../lib/strict-json.mjs";

const manifestUrl = new URL("../../contract-manifest.json", import.meta.url);
const repositoryRoot = new URL("../../", import.meta.url);

async function readManifest() {
  return decodeJson(await readFile(manifestUrl));
}

async function filesBelow(relativeDirectory) {
  const entries = await readdir(new URL(`${relativeDirectory}/`, repositoryRoot), {
    withFileTypes: true,
  });
  const files = [];
  for (const entry of entries) {
    const path = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await filesBelow(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

async function expectedArtifactPaths() {
  const [compatibility, fixtures, profiles, schemas, specifications, tckLib, tckScenarios, tckTests] =
    await Promise.all([
      filesBelow("compatibility"),
      filesBelow("fixtures"),
      filesBelow("profiles"),
      filesBelow("schemas"),
      filesBelow("spec"),
      filesBelow("tck/lib"),
      filesBelow("tck/scenarios"),
      filesBelow("tck/test"),
    ]);

  return [
    ".node-version",
    "AGENTS.md",
    "CONTRIBUTING.md",
    "GOVERNANCE.md",
    "LICENSE",
    "README.md",
    "SECURITY.md",
    ".github/actions/verify-consumer/action.yml",
    "ai/docs-manifest.json",
    "ai/invariants.md",
    "llms.txt",
    "scripts/verify-consumer-lock.mjs",
    ...compatibility.filter((path) => path.endsWith(".json")),
    ...fixtures.filter((path) => path.endsWith(".json")),
    ...profiles.filter((path) => path.endsWith(".json")),
    ...schemas.filter((path) => path.endsWith(".schema.json")),
    ...specifications.filter((path) => path.endsWith(".md")),
    ...tckLib.filter((path) => path.endsWith(".mjs")),
    ...tckScenarios.filter((path) => path.endsWith(".json")),
    ...tckTests.filter((path) => path.endsWith(".test.mjs")),
  ].sort();
}

test("contract manifest declares language-neutral authority", async () => {
  const manifest = await readManifest();

  assert.equal(manifest.contract, "aether.contracts");
  assert.equal(manifest.release_version, "0.1.0-alpha.2");
  assert.equal(manifest.source_authority, "spec-schema-fixtures-tck");
  assert.equal(manifest.bindings.c.status, "experimental");
  assert.equal(manifest.bindings.cpp.status, "experimental");
  assert.equal(manifest.production_release, false);
  assert.equal(manifest.modules.cloudlink.status, "experimental-auth-unresolved");
  assert.equal(manifest.modules.thing_model.status, "experimental");
  assert.equal(manifest.legacy_default, true);
  assert.equal(manifest.physical_control, false);
});

test("every release artifact has the declared sha256", async () => {
  const manifest = await readManifest();

  assert.ok(manifest.artifacts.length > 0);

  for (const artifact of manifest.artifacts) {
    const bytes = await readFile(new URL(artifact.path, repositoryRoot));
    const actual = createHash("sha256").update(bytes).digest("hex");
    assert.equal(actual, artifact.sha256, artifact.path);
  }
});

test("release artifact manifest covers the exact normative surface", async () => {
  const manifest = await readManifest();
  const declared = manifest.artifacts.map((artifact) => artifact.path);

  assert.equal(new Set(declared).size, declared.length, "artifact paths must be unique");
  assert.deepEqual(declared, await expectedArtifactPaths());
});
