import { execFileSync, spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { decodeJson } from "../tck/lib/strict-json.mjs";

const repositoryRoot = new URL("../", import.meta.url);
const repositoryPath = fileURLToPath(repositoryRoot);
const manifestUrl = new URL("ai/docs-manifest.json", repositoryRoot);
const schemaUrl = new URL("ai/docs-manifest.schema.json", repositoryRoot);
const llmsUrl = new URL("llms.txt", repositoryRoot);
const canonicalSchemaUrl =
  "https://raw.githubusercontent.com/EvanL1/AetherContracts/main/ai/docs-manifest.schema.json";
const documentationBaseUrl =
  "https://docs.aetheriot.workers.dev/en/aethercontracts";
const githubBlobBaseUrl =
  "https://github.com/EvanL1/AetherContracts/blob/main";
const githubRawBaseUrl =
  "https://raw.githubusercontent.com/EvanL1/AetherContracts/main";

const sectionOrder = [
  "Agent Task Manual",
  "Deployment and Operations",
  "Safety and Governance",
  "Recovery",
  "Platform Reference",
  "Compatibility and Status",
  "Optional",
];

const sectionByRole = {
  "agent-task": "Agent Task Manual",
  operations: "Deployment and Operations",
  safety: "Safety and Governance",
  decision: "Safety and Governance",
  recovery: "Recovery",
  reference: "Platform Reference",
  status: "Compatibility and Status",
};

async function readJson(url) {
  return decodeJson(await readFile(url));
}

function escapeMarkdownLabel(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function isPublishedEnglishMarkdown(path) {
  return (
    path.endsWith(".md") &&
    (path.startsWith("docs/") ||
      path.startsWith("spec/") ||
      /^packages\/[^/]+\/README\.md$/.test(path) ||
      ["GOVERNANCE.md", "MIGRATION.md", "SECURITY.md"].includes(path))
  );
}

export function canonicalDocumentUrl(path) {
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

function generateManifest(source) {
  const { $schema: _schema, documents, ...metadata } = source;
  return {
    $schema: canonicalSchemaUrl,
    ...metadata,
    documents: documents.map((document) => {
      const { id, path, canonical_url: _canonicalUrl, ...fields } = document;
      return {
        id,
        path,
        canonical_url: canonicalDocumentUrl(path),
        ...fields,
      };
    }),
  };
}

function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function renderLlms(manifest) {
  const grouped = Object.fromEntries(sectionOrder.map((section) => [section, []]));

  for (const document of manifest.documents) {
    const section =
      document.priority === "optional" ? "Optional" : sectionByRole[document.document_role];
    if (section === undefined) {
      throw new Error(`${document.id}: no llms.txt section for ${document.document_role}`);
    }
    grouped[section].push(
      `- [${escapeMarkdownLabel(document.title)}](${document.canonical_url}): ${document.description}`,
    );
  }

  const lines = [
    "# AetherContracts",
    "",
    "> Public, language-neutral interoperability authority for AetherCloud, AetherEdge, and independent implementations. Normative English specifications, closed JSON Schemas, fixtures, and the black-box TCK are authoritative together; language bindings never redefine the contract.",
    "",
    `Latest published release: \`${manifest.latest_published_release}\`. Development target: \`${manifest.development_target}\` (unpublished). Production readiness: false. Legacy transport remains the default.`,
    "",
    "Read the agent instructions before making any change. Treat `contract-manifest.json` as the exact release-closure and artifact-hash authority; this document index only routes tasks.",
    "",
    "Never describe proposal authentication as production-ready, an unsigned response or ACK as signed, provider acceptance as physical completion, distribution evidence as product conformance, or an experimental fixture binding as a complete production codec.",
  ];

  for (const section of sectionOrder) {
    lines.push("", `## ${section}`, "", ...grouped[section]);
  }

  return `${lines.join("\n")}\n`;
}

async function validateSchema(manifest) {
  const schema = await readJson(schemaUrl);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(manifest)) {
    throw new Error(`ai/docs-manifest.json failed schema validation:\n${JSON.stringify(validate.errors, null, 2)}`);
  }
}

async function validateDocumentCatalog(manifest) {
  const ids = new Set();
  const paths = new Set();

  for (const document of manifest.documents) {
    if (ids.has(document.id)) {
      throw new Error(`duplicate document id: ${document.id}`);
    }
    if (paths.has(document.path)) {
      throw new Error(`duplicate document path: ${document.path}`);
    }
    ids.add(document.id);
    paths.add(document.path);

    try {
      await readFile(new URL(document.path, repositoryRoot));
    } catch (error) {
      throw new Error(`${document.id}: missing ${document.path}`, { cause: error });
    }
  }

  for (const document of manifest.documents) {
    if (document.translation_of !== null && !ids.has(document.translation_of)) {
      throw new Error(`${document.id}: unknown translation_of ${document.translation_of}`);
    }
  }
}

function resolveTagCommit(tag) {
  return execFileSync("git", ["rev-parse", "--verify", `refs/tags/${tag}^{commit}`], {
    cwd: repositoryPath,
    encoding: "utf8",
  }).trim();
}

async function validateReleaseFacts(manifest) {
  const tagType = execFileSync(
    "git",
    ["cat-file", "-t", `refs/tags/${manifest.latest_published_release}`],
    { cwd: repositoryPath, encoding: "utf8" },
  ).trim();
  if (tagType !== "tag") {
    throw new Error(`${manifest.latest_published_release} must be an annotated Git tag`);
  }
  resolveTagCommit(manifest.latest_published_release);

  const tags = execFileSync("git", ["tag", "--list", "v*", "--sort=-version:refname"], {
    cwd: repositoryPath,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  if (tags[0] !== manifest.latest_published_release) {
    throw new Error(
      `latest_published_release is ${manifest.latest_published_release}, but the newest Git tag is ${tags[0] ?? "missing"}`,
    );
  }

  const developmentTag = spawnSync(
    "git",
    ["rev-parse", "--verify", `refs/tags/v${manifest.development_target}^{commit}`],
    { cwd: repositoryPath, encoding: "utf8" },
  );
  if (developmentTag.status === 0) {
    throw new Error(
      `v${manifest.development_target} exists and must be promoted from development_target to latest_published_release`,
    );
  }

  const contractManifest = await readJson(new URL(manifest.release_closure_authority, repositoryRoot));
  if (contractManifest.release_version !== manifest.development_target) {
    throw new Error(
      `contract-manifest.json targets ${contractManifest.release_version}, expected ${manifest.development_target}`,
    );
  }
}

async function validateProductMatrix(manifest) {
  const matrix = await readJson(new URL("compatibility/product-matrix.json", repositoryRoot));
  const expectedFacts = {
    latest_published_contract_release: manifest.latest_published_release,
    development_contract_target: manifest.development_target,
    production_ready: manifest.production_ready,
    legacy_default: manifest.legacy_default,
  };

  for (const [field, expected] of Object.entries(expectedFacts)) {
    if (matrix[field] !== expected) {
      throw new Error(`compatibility/product-matrix.json:${field} must equal ${JSON.stringify(expected)}`);
    }
  }

  const products = new Set(matrix.products.map(({ product }) => product));
  for (const product of ["AetherContracts", "AetherEdge", "AetherCloud"]) {
    if (!products.has(product)) {
      throw new Error(`compatibility/product-matrix.json is missing ${product}`);
    }
  }
}

export async function validateAgentDocs({ checkGenerated = true } = {}) {
  const currentManifest = await readJson(manifestUrl);
  const manifest = generateManifest(currentManifest);
  await validateSchema(manifest);
  await validateDocumentCatalog(manifest);
  await validateReleaseFacts(manifest);
  await validateProductMatrix(manifest);

  const rendered = renderLlms(manifest);
  if (/[一-龥]/u.test(rendered)) {
    throw new Error("llms.txt must contain English routing metadata only");
  }

  if (checkGenerated) {
    const [currentManifestText, currentLlms] = await Promise.all([
      readFile(manifestUrl, "utf8"),
      readFile(llmsUrl, "utf8"),
    ]);
    if (currentManifestText !== serializeManifest(manifest)) {
      throw new Error("ai/docs-manifest.json is stale; run `pnpm agent-docs:update`");
    }
    if (currentLlms !== rendered) {
      throw new Error("llms.txt is stale; run `pnpm agent-docs:update`");
    }
  }

  return { manifest, rendered, serializedManifest: serializeManifest(manifest) };
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "--check" && mode !== "--write") {
    throw new Error("usage: node scripts/update-agent-docs.mjs --check|--write");
  }

  const { rendered, serializedManifest } = await validateAgentDocs({
    checkGenerated: mode === "--check",
  });
  if (mode === "--write") {
    await writeFile(manifestUrl, serializedManifest, "utf8");
    await writeFile(llmsUrl, rendered, "utf8");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
