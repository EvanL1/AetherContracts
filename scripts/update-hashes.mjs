import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";

const repositoryRoot = new URL("../", import.meta.url);
const checkOnly = process.argv.includes("--check");
const mismatches = [];

const topLevelArtifacts = [
  ".node-version",
  "AGENTS.md",
  "CONTRIBUTING.md",
  "GOVERNANCE.md",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "ai/docs-manifest.json",
  "ai/invariants.md",
  "llms.txt",
];

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

async function releaseArtifactPaths() {
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
    ...topLevelArtifacts,
    ...compatibility.filter((path) => path.endsWith(".json")),
    ...fixtures.filter((path) => path.endsWith("/fixture-manifest.json")),
    ...profiles.filter((path) => path.endsWith(".json")),
    ...schemas.filter((path) => path.endsWith(".schema.json")),
    ...specifications.filter((path) => path.endsWith(".md")),
    ...tckLib.filter((path) => path.endsWith(".mjs")),
    ...tckScenarios.filter((path) => path.endsWith(".json")),
    ...tckTests.filter((path) => path.endsWith(".test.mjs")),
  ].sort();
}

async function sha256(relativePath, baseUrl = repositoryRoot) {
  const bytes = await readFile(new URL(relativePath, baseUrl));
  return createHash("sha256").update(bytes).digest("hex");
}

async function updateFixtureManifest(relativePath) {
  const url = new URL(relativePath, repositoryRoot);
  const manifest = JSON.parse(await readFile(url, "utf8"));

  for (const fixture of manifest.fixtures) {
    const actual = await sha256(fixture.file, url);
    if (fixture.sha256 !== actual) {
      mismatches.push(`${relativePath}:${fixture.file}`);
      fixture.sha256 = actual;
    }
  }

  if (!checkOnly) {
    await writeFile(url, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }
}

async function updateContractManifest() {
  const url = new URL("contract-manifest.json", repositoryRoot);
  const manifest = JSON.parse(await readFile(url, "utf8"));

  const declaredByPath = new Map(
    manifest.artifacts.map((artifact) => [artifact.path, artifact.sha256]),
  );
  const paths = await releaseArtifactPaths();
  const artifacts = [];
  for (const path of paths) {
    const actual = await sha256(path);
    if (declaredByPath.get(path) !== actual) {
      mismatches.push(`contract-manifest.json:${path}`);
    }
    artifacts.push({ path, sha256: actual });
  }
  for (const path of declaredByPath.keys()) {
    if (!paths.includes(path)) {
      mismatches.push(`contract-manifest.json:unexpected:${path}`);
    }
  }
  manifest.artifacts = artifacts;

  if (!checkOnly) {
    await writeFile(url, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }
}

for (const manifest of [
  "fixtures/cloudlink/v1alpha1/fixture-manifest.json",
  "fixtures/thing-model/v1alpha1/fixture-manifest.json",
]) {
  await updateFixtureManifest(manifest);
}
await updateContractManifest();

if (checkOnly && mismatches.length > 0) {
  throw new Error(`hash declarations are stale:\n${mismatches.join("\n")}`);
}

if (!checkOnly) {
  process.stdout.write(`updated ${mismatches.length} hash declaration(s)\n`);
}
