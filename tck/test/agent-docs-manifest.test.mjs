import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { decodeJson } from "../lib/strict-json.mjs";
import { canonicalDocumentUrl } from "../../scripts/update-agent-docs.mjs";

const repositoryRoot = new URL("../../", import.meta.url);
const canonicalSchemaUrl =
  "https://raw.githubusercontent.com/EvanL1/AetherContracts/main/ai/docs-manifest.schema.json";
const documentationBaseUrl =
  "https://docs.aetheriot.dev/aethercontracts";
const githubBlobBaseUrl =
  "https://github.com/EvanL1/AetherContracts/blob/main";
const githubRawBaseUrl =
  "https://raw.githubusercontent.com/EvanL1/AetherContracts/main";

function isPublishedEnglishMarkdown(path) {
  return (
    path.endsWith(".md") &&
    (path.startsWith("docs/") ||
      path.startsWith("spec/") ||
      /^packages\/[^/]+\/README\.md$/.test(path) ||
      ["GOVERNANCE.md", "MIGRATION.md", "SECURITY.md"].includes(path))
  );
}

function expectedCanonicalUrl(path) {
  if (isPublishedEnglishMarkdown(path)) {
    const destination = path.startsWith("docs/")
      ? path.slice("docs/".length)
      : path.endsWith("/README.md")
        ? `${path.slice(0, -"/README.md".length)}.md`
        : path;
    const slug = destination.replace(/\.md$/i, "").toLowerCase();
    return `${documentationBaseUrl}/${slug}.md`;
  }
  if (path.endsWith(".md")) {
    return `${githubBlobBaseUrl}/${path}`;
  }
  return `${githubRawBaseUrl}/${path}`;
}

async function readText(relativePath) {
  return readFile(new URL(relativePath, repositoryRoot), "utf8");
}

async function readJson(relativePath) {
  return decodeJson(await readFile(new URL(relativePath, repositoryRoot)));
}

test("canonical URLs distinguish published Markdown from machine resources", () => {
  assert.equal(
    canonicalDocumentUrl("docs/getting-started.md"),
    `${documentationBaseUrl}/getting-started.md`,
  );
  assert.equal(
    canonicalDocumentUrl("packages/rust/README.md"),
    `${documentationBaseUrl}/packages/rust.md`,
  );
  assert.equal(
    canonicalDocumentUrl("AGENTS.md"),
    `${githubBlobBaseUrl}/AGENTS.md`,
  );
  assert.equal(
    canonicalDocumentUrl("docs/status.json"),
    `${githubRawBaseUrl}/docs/status.json`,
  );
  assert.equal(
    canonicalDocumentUrl("scripts/verify-consumer-lock.mjs"),
    `${githubRawBaseUrl}/scripts/verify-consumer-lock.mjs`,
  );
});

test("the agent document catalog is a schema-valid v3 task index", async () => {
  const [schema, manifest] = await Promise.all([
    readJson("ai/docs-manifest.schema.json"),
    readJson("ai/docs-manifest.json"),
  ]);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  assert.equal(validate(manifest), true, JSON.stringify(validate.errors, null, 2));
  assert.equal(schema.$id, canonicalSchemaUrl);
  assert.equal(manifest.$schema, canonicalSchemaUrl);
  assert.equal(manifest.schema_version, 3);
  assert.equal(manifest.latest_published_release, "v0.1.0-alpha.3");
  assert.equal(manifest.development_target, "0.1.0-alpha.4");
  assert.equal(manifest.production_ready, false);
  assert.equal(manifest.legacy_default, true);
  assert.equal(manifest.release_closure_authority, "contract-manifest.json");
  assert.equal("artifacts" in manifest, false, "the document catalog must not copy release hashes");

  const ids = manifest.documents.map(({ id }) => id);
  const paths = manifest.documents.map(({ path }) => path);
  assert.equal(new Set(ids).size, ids.length, "document ids must be unique");
  assert.equal(new Set(paths).size, paths.length, "document paths must be unique");

  for (const document of manifest.documents) {
    await access(new URL(document.path, repositoryRoot));
    assert.equal(
      document.canonical_url,
      expectedCanonicalUrl(document.path),
      `${document.id}: incorrect canonical_url`,
    );
    assert.equal(new URL(document.canonical_url).protocol, "https:");
    if (document.translation_of !== null) {
      assert.ok(ids.includes(document.translation_of), `${document.id}: unknown translation_of`);
    }
  }
});

test("the catalog preserves every authority and adds the missing agent routes", async () => {
  const manifest = await readJson("ai/docs-manifest.json");
  const paths = new Set(manifest.documents.map(({ path }) => path));
  const requiredPaths = [
    "README.md",
    "AGENTS.md",
    "GOVERNANCE.md",
    "SECURITY.md",
    "MIGRATION.md",
    "docs/migrations/alpha3-to-alpha4.md",
    "docs/getting-started.md",
    "docs/integration.md",
    "docs/conformance.md",
    "docs/compatibility.md",
    "ai/invariants.md",
    "contract-manifest.json",
    "spec/foundation.md",
    "spec/thing-model-v1alpha1.md",
    "spec/integration-v1alpha1.md",
    "spec/integration-control-v1alpha1.md",
    "spec/cloudlink-v1alpha1.md",
    "spec/tck-v1alpha1.md",
    "spec/distribution-v1alpha1.md",
    "compatibility/product-matrix.json",
    "compatibility/cloudlink-v1alpha1-gates.json",
    "compatibility/integration-v1alpha1.json",
    "compatibility/integration-control-v1alpha1.json",
    "compatibility/thing-model-v1alpha1.json",
    "compatibility/failure-codes.json",
  ];

  for (const path of requiredPaths) {
    assert.ok(paths.has(path), `missing agent route: ${path}`);
  }
});

test("llms.txt is generated as an English Markdown task router", async () => {
  const [manifest, llms] = await Promise.all([
    readJson("ai/docs-manifest.json"),
    readText("llms.txt"),
  ]);
  const requiredSections = [
    "Agent Task Manual",
    "Deployment and Operations",
    "Safety and Governance",
    "Recovery",
    "Platform Reference",
    "Compatibility and Status",
    "Optional",
  ];

  assert.match(llms, /^# AetherContracts\n\n> [^\n]+/);
  assert.match(llms, /Latest published release: `v0\.1\.0-alpha\.3`\./);
  assert.match(llms, /Development target: `0\.1\.0-alpha\.4` \(unpublished\)\./);
  assert.doesNotMatch(llms, /^- [^[]/m, "file-list items must be Markdown links");

  const headings = [...llms.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(headings, requiredSections);

  const links = [...llms.matchAll(/^- \[([^\]]+)\]\((https:\/\/[^)]+)\): ([^\n]+)$/gm)];
  assert.ok(links.length > 0);
  const linkedUrls = links.map((match) => match[2]);
  assert.equal(new Set(linkedUrls).size, linkedUrls.length, "llms links must be unique");
  assert.doesNotMatch(llms, /\]\((?:\.\/|\/(?!\/))/, "llms links must not be relative");

  const catalogUrls = new Set(manifest.documents.map(({ canonical_url }) => canonical_url));
  for (const url of linkedUrls) {
    assert.ok(catalogUrls.has(url), `llms link missing from catalog: ${url}`);
  }
  assert.deepEqual(
    new Set(linkedUrls),
    catalogUrls,
    "every catalog document must be reachable from llms.txt",
  );

  const check = spawnSync(process.execPath, ["scripts/update-agent-docs.mjs", "--check"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
});

test("published and development versions are verified against real Git tags", async () => {
  const manifest = await readJson("ai/docs-manifest.json");
  const publishedCommit = execFileSync(
    "git",
    ["rev-parse", "--verify", `refs/tags/${manifest.latest_published_release}^{commit}`],
    { cwd: repositoryRoot, encoding: "utf8" },
  ).trim();
  assert.match(publishedCommit, /^[0-9a-f]{40}$/);

  const tags = execFileSync("git", ["tag", "--list", "v*", "--sort=-version:refname"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  assert.equal(tags[0], manifest.latest_published_release);

  const developmentTag = spawnSync(
    "git",
    ["rev-parse", "--verify", `refs/tags/v${manifest.development_target}^{commit}`],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.notEqual(
    developmentTag.status,
    0,
    "an existing development tag must be promoted to latest_published_release",
  );
});

test("alpha.4 is described as a development target, never as a published release", async () => {
  const publicStatusDocuments = [
    "README.md",
    "README-CN.md",
    "MIGRATION.md",
    "SECURITY.md",
    "docs/getting-started.md",
    "docs/compatibility.md",
  ];

  for (const path of publicStatusDocuments) {
    const content = await readText(path);
    assert.doesNotMatch(
      content,
      /(?:current release is|current `?v?0\.1\.0-alpha\.4`? release|this `?0\.1\.0-alpha\.4`? release)/i,
      path,
    );
    assert.doesNotMatch(content, /git checkout v0\.1\.0-alpha\.4/, path);
    assert.doesNotMatch(content, /当前版本是 \*\*0\.1\.0-alpha\.4\*\*/, path);
  }
});

test("the product matrix reports only evidenced compatibility facts", async () => {
  const [manifest, matrix] = await Promise.all([
    readJson("ai/docs-manifest.json"),
    readJson("compatibility/product-matrix.json"),
  ]);

  assert.equal(matrix.latest_published_contract_release, manifest.latest_published_release);
  assert.equal(matrix.development_contract_target, manifest.development_target);
  assert.equal(matrix.production_ready, false);
  assert.equal(matrix.legacy_default, true);
  assert.deepEqual(
    matrix.products.map(({ product }) => product).sort(),
    ["AetherCloud", "AetherContracts", "AetherEdge"],
  );

  for (const product of matrix.products) {
    assert.match(product.product_commit, /^(?:unknown|[0-9a-f]{40})$/);
    assert.match(product.verified_contract_release, /^(?:unknown|v\d+\.\d+\.\d+-.+)$/);
    assert.equal(product.development_contract_target, manifest.development_target);
    assert.ok(Array.isArray(product.passed_gates));
    assert.ok(product.open_gates.length > 0);
    assert.ok(product.evidence.length > 0);
  }
});

test("the alpha.3 to alpha.4 migration has rollout and rollback routes", async () => {
  const migration = await readText("docs/migrations/alpha3-to-alpha4.md");

  assert.match(migration, /Latest published release.*`v0\.1\.0-alpha\.3`/);
  assert.match(migration, /Development target.*`0\.1\.0-alpha\.4`/);
  assert.match(migration, /^## Cloud-first rollout$/m);
  assert.match(migration, /^## Rollback$/m);
  assert.match(migration, /must not pin|do not pin/i);
  assert.match(migration, /legacy/i);
});
