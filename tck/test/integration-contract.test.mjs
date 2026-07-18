import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  evaluateIntegrationObservationContext,
  evaluateIntegrationTopologyContext,
} from "../lib/integration-context.mjs";
import { decodeJson } from "../lib/strict-json.mjs";

const repositoryRoot = new URL("../../", import.meta.url);
const schemaDirectory = "schemas/integration/v1alpha1/";
const fixtureDirectory = "fixtures/integration/v1alpha1/";

async function readJson(relativePath) {
  return decodeJson(await readFile(new URL(relativePath, repositoryRoot)));
}

async function integrationValidators() {
  const files = (await readdir(new URL(schemaDirectory, repositoryRoot)))
    .filter((file) => file.endsWith(".schema.json"))
    .sort();
  const schemas = await Promise.all(
    files.map((file) => readJson(`${schemaDirectory}${file}`)),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  for (const schema of schemas) {
    ajv.addSchema(schema);
  }
  return ajv;
}

test("Integration schemas accept the multi-point golden fixtures", async () => {
  const [ajv, topology, batch] = await Promise.all([
    integrationValidators(),
    readJson(`${fixtureDirectory}valid/home-assistant-topology.json`),
    readJson(`${fixtureDirectory}valid/home-assistant-observations.json`),
  ]);
  const validateTopology = ajv.getSchema(
    "https://contracts.aether.dev/schemas/integration/v1alpha1/integration-topology-snapshot.schema.json",
  );
  const validateBatch = ajv.getSchema(
    "https://contracts.aether.dev/schemas/integration/v1alpha1/integration-observation-batch.schema.json",
  );

  assert.ok(validateTopology);
  assert.ok(validateBatch);
  assert.equal(validateTopology(topology), true, JSON.stringify(validateTopology.errors));
  assert.equal(validateBatch(batch), true, JSON.stringify(validateBatch.errors));
  assert.ok(
    topology.entities.some((entity) => entity.points.length > 1),
    "at least one provider entity must expose multiple normalized points",
  );
});

test("Integration wire-invalid fixtures fail their declared closed schemas", async () => {
  const [ajv, manifest] = await Promise.all([
    integrationValidators(),
    readJson(`${fixtureDirectory}fixture-manifest.json`),
  ]);

  for (const entry of manifest.fixtures.filter(
    (fixture) => fixture.expectation === "wire-invalid",
  )) {
    const fixture = await readJson(`${fixtureDirectory}${entry.file}`);
    const validate = ajv.getSchema(entry.schema_id);
    assert.ok(validate, entry.schema_id);
    assert.equal(validate(fixture), false, entry.file);
  }
});

test("Integration topology context rejects duplicate identities and dangling references", async () => {
  const [duplicate, dangling] = await Promise.all([
    readJson(`${fixtureDirectory}invalid/topology-duplicate-entity.json`),
    readJson(`${fixtureDirectory}invalid/topology-dangling-device-area.json`),
  ]);

  assert.deepEqual(evaluateIntegrationTopologyContext(duplicate), {
    accepted: false,
    failure_code: "IDENTITY_CONFLICT",
  });
  assert.deepEqual(evaluateIntegrationTopologyContext(dangling), {
    accepted: false,
    failure_code: "REFERENCE_NOT_FOUND",
  });
});

test("Integration observation context binds generation, entity, point, type, and quality", async () => {
  const [topology, valid, dangling, mismatch, missingValue, unavailableValue] =
    await Promise.all([
      readJson(`${fixtureDirectory}valid/home-assistant-topology.json`),
      readJson(`${fixtureDirectory}valid/home-assistant-observations.json`),
      readJson(`${fixtureDirectory}invalid/observation-dangling-point.json`),
      readJson(`${fixtureDirectory}invalid/observation-type-mismatch.json`),
      readJson(`${fixtureDirectory}invalid/observation-good-without-value.json`),
      readJson(`${fixtureDirectory}invalid/observation-unavailable-with-value.json`),
    ]);

  assert.deepEqual(evaluateIntegrationObservationContext(topology, valid), {
    accepted: true,
  });
  assert.deepEqual(evaluateIntegrationObservationContext(topology, dangling), {
    accepted: false,
    failure_code: "REFERENCE_NOT_FOUND",
  });
  assert.deepEqual(evaluateIntegrationObservationContext(topology, mismatch), {
    accepted: false,
    failure_code: "VALUE_TYPE_MISMATCH",
  });
  assert.deepEqual(evaluateIntegrationObservationContext(topology, missingValue), {
    accepted: false,
    failure_code: "OBSERVATION_VALUE_INVALID",
  });
  assert.deepEqual(evaluateIntegrationObservationContext(topology, unavailableValue), {
    accepted: false,
    failure_code: "OBSERVATION_VALUE_INVALID",
  });
});

test("ObservedValue freezes integer, decimal, and bytes boundaries", async () => {
  const ajv = await integrationValidators();
  const validate = ajv.getSchema(
    "https://contracts.aether.dev/schemas/integration/v1alpha1/observed-value.schema.json",
  );
  assert.ok(validate);

  for (const value of [
    { type: "int64", value: "-9223372036854775808" },
    { type: "int64", value: "9223372036854775807" },
    { type: "uint64", value: "0" },
    { type: "uint64", value: "18446744073709551615" },
    { type: "decimal", value: "-0.0000001" },
    { type: "decimal", value: "999999999999999999.125" },
    { type: "bytes", encoding: "base64url", value: "" },
    { type: "bytes", encoding: "base64url", value: "AAECAwQF" },
  ]) {
    assert.equal(validate(value), true, `${JSON.stringify(value)}: ${JSON.stringify(validate.errors)}`);
  }

  for (const value of [
    { type: "int64", value: "-9223372036854775809" },
    { type: "int64", value: "9223372036854775808" },
    { type: "uint64", value: "-1" },
    { type: "uint64", value: "18446744073709551616" },
    { type: "decimal", value: "01.0" },
    { type: "decimal", value: "1.2300" },
    { type: "bytes", encoding: "base64url", value: "AQIDBA==" },
    { type: "bytes", encoding: "base64url", value: "AB" },
  ]) {
    assert.equal(validate(value), false, JSON.stringify(value));
  }
});

test("Integration display and evidence text reject blank and control-only content", async () => {
  const [ajv, topology, batch] = await Promise.all([
    integrationValidators(),
    readJson(`${fixtureDirectory}valid/home-assistant-topology.json`),
    readJson(`${fixtureDirectory}valid/home-assistant-observations.json`),
  ]);
  const validateTopology = ajv.getSchema(
    "https://contracts.aether.dev/schemas/integration/v1alpha1/integration-topology-snapshot.schema.json",
  );
  const validateBatch = ajv.getSchema(
    "https://contracts.aether.dev/schemas/integration/v1alpha1/integration-observation-batch.schema.json",
  );
  assert.ok(validateTopology);
  assert.ok(validateBatch);

  const displayMutations = [
    (candidate, value) => {
      candidate.areas[0].name = value;
    },
    (candidate, value) => {
      candidate.devices[0].name = value;
    },
    (candidate, value) => {
      candidate.devices[0].manufacturer = value;
    },
    (candidate, value) => {
      candidate.devices[0].model = value;
    },
    (candidate, value) => {
      candidate.devices[0].software_version = value;
    },
    (candidate, value) => {
      candidate.devices[0].hardware_version = value;
    },
    (candidate, value) => {
      candidate.entities[0].name = value;
    },
    (candidate, value) => {
      candidate.entities[0].points[0].title = value;
    },
  ];
  for (const mutate of displayMutations) {
    for (const invalidName of [
      "   ",
      "\t",
      "Living\u0000room",
      "Living\u007froom",
    ]) {
      const candidate = structuredClone(topology);
      mutate(candidate, invalidName);
      assert.equal(validateTopology(candidate), false, JSON.stringify(invalidName));
    }
  }

  for (const invalidDiagnostic of ["   ", "\n", "retry\u0007pending", "retry\u007fpending"]) {
    const candidate = structuredClone(batch);
    candidate.observations[4].diagnostic = invalidDiagnostic;
    assert.equal(validateBatch(candidate), false, JSON.stringify(invalidDiagnostic));
  }
});
