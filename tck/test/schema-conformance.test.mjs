import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { decodeJson } from "../lib/strict-json.mjs";

const repositoryRoot = new URL("../../", import.meta.url);

async function readJson(relativePath) {
  return decodeJson(await readFile(new URL(relativePath, repositoryRoot)));
}

async function loadSchemas(directory) {
  const directoryUrl = new URL(directory, repositoryRoot);
  const files = (await readdir(directoryUrl)).filter((file) => file.endsWith(".schema.json"));
  return Promise.all(files.map((file) => readJson(`${directory}${file}`)));
}

test("all normative JSON Schemas compile under Draft 2020-12", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  const schemas = [
    ...(await loadSchemas("schemas/thing-model/v1alpha1/")),
    ...(await loadSchemas("schemas/cloudlink/v1alpha1/")),
    ...(await loadSchemas("schemas/tck/v1alpha1/")),
  ];

  for (const schema of schemas) {
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    ajv.addSchema(schema);
  }

  for (const schema of schemas) {
    assert.doesNotThrow(() => ajv.getSchema(schema.$id), schema.$id);
    assert.ok(ajv.getSchema(schema.$id), schema.$id);
  }
});

test("Thing Model accepts the Voltage migration golden model and rejects unsafe action semantics", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schema = await readJson("schemas/thing-model/v1alpha1/thing-model.schema.json");
  const valid = await readJson("fixtures/thing-model/v1alpha1/valid/voltage-battery.golden.json");
  const invalid = await readJson("fixtures/thing-model/v1alpha1/invalid/direct-action-execution.json");
  const validate = ajv.compile(schema);

  assert.equal(validate(valid), true, JSON.stringify(validate.errors));
  assert.equal(validate(invalid), false);
  assert.ok(validate.errors?.some((error) => error.instancePath.includes("/capabilities/0")));
});

test("Thing Model rejects unknown core fields and non-canonical revisions", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schema = await readJson("schemas/thing-model/v1alpha1/thing-model.schema.json");
  const unknown = await readJson("fixtures/thing-model/v1alpha1/invalid/unknown-core-field.json");
  const revision = await readJson("fixtures/thing-model/v1alpha1/invalid/noncanonical-revision.json");
  const validate = ajv.compile(schema);

  assert.equal(validate(unknown), false);
  assert.equal(validate(revision), false);
});

test("CloudLink imported valid fixtures validate and wire-invalid fixtures fail structurally", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schemas = await loadSchemas("schemas/cloudlink/v1alpha1/");
  for (const schema of schemas) {
    ajv.addSchema(schema);
  }

  const manifest = await readJson("fixtures/cloudlink/v1alpha1/fixture-manifest.json");
  for (const entry of manifest.fixtures) {
    if (entry.expectation === "context-invalid") {
      continue;
    }
    const fixture = await readJson(`fixtures/cloudlink/v1alpha1/${entry.file}`);
    const validate = ajv.getSchema(entry.schema_id);
    assert.ok(validate, entry.schema_id);
    const accepted = validate(fixture);
    assert.equal(accepted, entry.expectation === "valid", entry.file);
  }
});

test("CloudLink envelope fixtures use message-kind-specific entry schemas", async () => {
  const manifest = await readJson("fixtures/cloudlink/v1alpha1/fixture-manifest.json");

  for (const entry of manifest.fixtures) {
    if (!entry.schema_id) {
      continue;
    }
    assert.notEqual(entry.schema_id, "envelope.schema.json", entry.file);
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schemas = await loadSchemas("schemas/cloudlink/v1alpha1/");
  for (const schema of schemas) {
    ajv.addSchema(schema);
  }

  const telemetry = await readJson("fixtures/cloudlink/v1alpha1/telemetry-batch.valid.json");
  const mismatched = { ...telemetry, message_kind: "data-loss" };
  const validate = ajv.getSchema("telemetry-batch.schema.json");
  assert.ok(validate);
  assert.equal(validate(telemetry), true, JSON.stringify(validate.errors));
  assert.equal(validate(mismatched), false);
});

test("Runtime Manifest accepts only SemVer 2.0.0 versions", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schemas = await loadSchemas("schemas/cloudlink/v1alpha1/");
  for (const schema of schemas) {
    ajv.addSchema(schema);
  }

  const fixture = await readJson(
    "fixtures/cloudlink/v1alpha1/runtime-manifest-report.valid.json",
  );
  const validate = ajv.getSchema("runtime-manifest-report.schema.json");
  assert.ok(validate);

  for (const version of [
    "1.0.0-..",
    "1.0.0-01",
    "1.0.0+..",
    "01.0.0",
  ]) {
    const candidate = structuredClone(fixture);
    candidate.payload.manifest.aether_version = version;
    assert.equal(validate(candidate), false, version);
  }

  for (const version of ["0.1.0", "1.0.0-alpha.1", "1.0.0+build.7"]) {
    const candidate = structuredClone(fixture);
    candidate.payload.manifest.aether_version = version;
    assert.equal(validate(candidate), true, `${version}: ${JSON.stringify(validate.errors)}`);
  }
});

test("deployment observations require positive revisions and state-consistent applied evidence", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schema = await readJson(
    "schemas/thing-model/v1alpha1/deployment-observation.schema.json",
  );
  const validate = ajv.compile(schema);
  const model = {
    model_id: "aether.energy.battery",
    revision: "1",
    digest: `sha256:${"a".repeat(64)}`,
  };
  const base = {
    schema: "aether.thing-model.deployment-observation.v1alpha1",
    gateway_id: "33333333-3333-4333-8333-333333333333",
    desired: { state: "desired", model, updated_at_ms: "1721000000000" },
    reported: { state: "reported", supported_models: [model], reported_at_ms: "1721000000001" },
    observed_at_ms: "1721000000002",
  };

  assert.equal(
    validate({
      ...base,
      applied: {
        state: "applied",
        model,
        evidence: "receipt:deployment-1",
        applied_at_ms: "1721000000002",
      },
    }),
    true,
    JSON.stringify(validate.errors),
  );
  assert.equal(
    validate({
      ...base,
      applied: { state: "not-applied", model: null, evidence: "not commissioned" },
    }),
    true,
    JSON.stringify(validate.errors),
  );
  assert.equal(
    validate({
      ...base,
      applied: {
        state: "applied",
        model: null,
        evidence: "missing model",
        applied_at_ms: "1721000000002",
      },
    }),
    false,
  );
  assert.equal(
    validate({
      ...base,
      applied: {
        state: "applying",
        model,
        evidence: "in progress",
        applied_at_ms: "1721000000002",
      },
    }),
    false,
  );
  assert.equal(
    validate({
      ...base,
      desired: {
        ...base.desired,
        model: { ...model, revision: "0" },
      },
      applied: { state: "not-applied", model: null, evidence: "not commissioned" },
    }),
    false,
  );
  assert.equal(
    validate({
      ...base,
      reported: {
        ...base.reported,
        supported_models: [model, model],
      },
      applied: { state: "not-applied", model: null, evidence: "not commissioned" },
    }),
    false,
  );
  assert.equal(
    validate({
      ...base,
      desired: {
        ...base.desired,
        model: { ...model, model_id: `a.${"b".repeat(159)}` },
      },
      applied: { state: "not-applied", model: null, evidence: "not commissioned" },
    }),
    false,
  );
});
