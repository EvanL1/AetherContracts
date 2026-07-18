import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  evaluateCloudLinkIntegrationContext,
  integrationStreamBinding,
} from "../lib/cloudlink-integration-context.mjs";
import {
  businessDigestForEnvelope,
  durableAckMatchesAcceptedDelivery,
} from "../lib/scenario-runner.mjs";
import { decodeJson } from "../lib/strict-json.mjs";

const repositoryRoot = new URL("../../", import.meta.url);
const cloudLinkSchemaDirectory = "schemas/cloudlink/v1alpha1/";
const integrationSchemaDirectory = "schemas/integration/v1alpha1/";
const fixtureDirectory = "fixtures/cloudlink-integration/v1alpha1/";

async function readJson(relativePath) {
  return decodeJson(await readFile(new URL(relativePath, repositoryRoot)));
}

async function validators() {
  const cloudLinkSchemaNames = (
    await readdir(new URL(cloudLinkSchemaDirectory, repositoryRoot))
  )
    .filter((name) => name.endsWith(".schema.json"))
    .sort();
  const schemaPaths = [
    ...cloudLinkSchemaNames.map((name) => `${cloudLinkSchemaDirectory}${name}`),
    `${integrationSchemaDirectory}observed-value.schema.json`,
    `${integrationSchemaDirectory}integration-topology-snapshot.schema.json`,
    `${integrationSchemaDirectory}integration-observation-batch.schema.json`,
  ];
  const schemas = await Promise.all(schemaPaths.map(readJson));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  for (const schema of schemas) {
    ajv.addSchema(schema);
  }
  return ajv;
}

test("CloudLink Integration wrappers preserve the public payloads byte-for-value", async () => {
  const [ajv, topologyEnvelope, observationEnvelope, topology, observations] =
    await Promise.all([
      validators(),
      readJson(`${fixtureDirectory}integration-topology.valid.json`),
      readJson(`${fixtureDirectory}integration-observations.valid.json`),
      readJson("fixtures/integration/v1alpha1/valid/home-assistant-topology.json"),
      readJson("fixtures/integration/v1alpha1/valid/home-assistant-observations.json"),
    ]);
  const validateTopology = ajv.getSchema(
    "integration-topology-snapshot.schema.json",
  );
  const validateObservations = ajv.getSchema(
    "integration-observation-batch.schema.json",
  );

  assert.ok(validateTopology);
  assert.ok(validateObservations);
  assert.equal(
    validateTopology(topologyEnvelope),
    true,
    JSON.stringify(validateTopology.errors),
  );
  assert.equal(
    validateObservations(observationEnvelope),
    true,
    JSON.stringify(validateObservations.errors),
  );
  assert.deepEqual(topologyEnvelope.payload, topology);
  assert.deepEqual(observationEnvelope.payload, observations);
  assert.equal(
    topologyEnvelope.delivery.digest,
    businessDigestForEnvelope(topologyEnvelope),
  );
  assert.equal(
    observationEnvelope.delivery.digest,
    businessDigestForEnvelope(observationEnvelope),
  );
});

test("CloudLink Integration entry schemas reject cross-kind payloads and secrets", async () => {
  const [ajv, topologyEnvelope, observationEnvelope, secretEnvelope] =
    await Promise.all([
      validators(),
      readJson(`${fixtureDirectory}integration-topology.valid.json`),
      readJson(`${fixtureDirectory}integration-observations.valid.json`),
      readJson(`${fixtureDirectory}integration-topology-secret.invalid.json`),
    ]);
  const validateTopology = ajv.getSchema(
    "integration-topology-snapshot.schema.json",
  );
  const validateObservations = ajv.getSchema(
    "integration-observation-batch.schema.json",
  );
  assert.ok(validateTopology);
  assert.ok(validateObservations);

  assert.equal(validateTopology(observationEnvelope), false);
  assert.equal(validateObservations(topologyEnvelope), false);
  assert.equal(validateTopology(secretEnvelope), false);
});

test("Integration stream and batch bindings fail closed", async () => {
  const [topology, observations] = await Promise.all([
    readJson(`${fixtureDirectory}integration-topology.valid.json`),
    readJson(`${fixtureDirectory}integration-observations.valid.json`),
  ]);
  const expectedTopologyStream = integrationStreamBinding(topology);
  const expectedObservationStream = integrationStreamBinding(observations);

  assert.deepEqual(
    evaluateCloudLinkIntegrationContext(topology, {
      expectedStreamBinding: expectedTopologyStream,
    }),
    { accepted: true, state_changed: true },
  );
  assert.deepEqual(
    evaluateCloudLinkIntegrationContext(topology, {
      expectedStreamBinding: {
        ...expectedTopologyStream,
        integration_id: "home-assistant.other",
      },
    }),
    {
      accepted: false,
      failure_code: "STREAM_BINDING_CONFLICT",
      state_changed: false,
      successful_receipt_permitted: false,
    },
  );

  const wrongBatch = structuredClone(observations);
  wrongBatch.delivery.batch_id = "different-batch";
  assert.deepEqual(
    evaluateCloudLinkIntegrationContext(wrongBatch, {
      acceptedTopologyDelivery: topology,
      expectedStreamBinding: expectedObservationStream,
    }),
    {
      accepted: false,
      failure_code: "BATCH_ID_MISMATCH",
      state_changed: false,
      successful_receipt_permitted: false,
    },
  );
});

test("topology generation and observation batch replay bindings are immutable", async () => {
  const [topology, observations] = await Promise.all([
    readJson(`${fixtureDirectory}integration-topology.valid.json`),
    readJson(`${fixtureDirectory}integration-observations.valid.json`),
  ]);

  assert.deepEqual(
    evaluateCloudLinkIntegrationContext(topology, {
      acceptedTopologyDelivery: topology,
      expectedStreamBinding: integrationStreamBinding(topology),
    }),
    { accepted: true, state_changed: false },
  );

  const sameGenerationAtNewPosition = structuredClone(topology);
  sameGenerationAtNewPosition.delivery.position = "2";
  assert.deepEqual(
    evaluateCloudLinkIntegrationContext(sameGenerationAtNewPosition, {
      acceptedTopologyDelivery: topology,
      expectedStreamBinding: integrationStreamBinding(topology),
    }),
    {
      accepted: false,
      failure_code: "TOPOLOGY_GENERATION_CONFLICT",
      state_changed: false,
      successful_receipt_permitted: false,
    },
  );

  const staleTopology = structuredClone(topology);
  staleTopology.payload.snapshot_generation = "0";
  staleTopology.delivery.position = "2";
  staleTopology.delivery.batch_id = "topology-0";
  staleTopology.delivery.digest = businessDigestForEnvelope(staleTopology);
  const currentTopology = structuredClone(topology);
  currentTopology.payload.snapshot_generation = "2";
  currentTopology.delivery.batch_id = "topology-2";
  currentTopology.delivery.digest = businessDigestForEnvelope(currentTopology);
  assert.deepEqual(
    evaluateCloudLinkIntegrationContext(staleTopology, {
      acceptedTopologyDelivery: currentTopology,
      expectedStreamBinding: integrationStreamBinding(topology),
    }),
    {
      accepted: false,
      failure_code: "TOPOLOGY_GENERATION_STALE",
      state_changed: false,
      successful_receipt_permitted: false,
    },
  );

  assert.deepEqual(
    evaluateCloudLinkIntegrationContext(observations, {
      acceptedTopologyDelivery: topology,
      expectedStreamBinding: integrationStreamBinding(observations),
      priorBatchDelivery: observations,
    }),
    { accepted: true, state_changed: false },
  );

  const batchAtNewPosition = structuredClone(observations);
  batchAtNewPosition.delivery.position = "2";
  assert.deepEqual(
    evaluateCloudLinkIntegrationContext(batchAtNewPosition, {
      acceptedTopologyDelivery: topology,
      expectedStreamBinding: integrationStreamBinding(observations),
      priorBatchDelivery: observations,
    }),
    {
      accepted: false,
      failure_code: "BATCH_ID_CONFLICT",
      state_changed: false,
      successful_receipt_permitted: false,
    },
  );
});

test("observations require the exact accepted topology generation", async () => {
  const [topology, observations] = await Promise.all([
    readJson(`${fixtureDirectory}integration-topology.valid.json`),
    readJson(`${fixtureDirectory}integration-observations.valid.json`),
  ]);
  const context = {
    expectedStreamBinding: integrationStreamBinding(observations),
  };

  assert.deepEqual(
    evaluateCloudLinkIntegrationContext(observations, context),
    {
      accepted: false,
      failure_code: "REFERENCE_NOT_FOUND",
      state_changed: false,
      successful_receipt_permitted: false,
    },
  );

  const newerTopology = structuredClone(topology);
  newerTopology.payload.snapshot_generation = "2";
  newerTopology.delivery.batch_id = "topology-2";
  newerTopology.delivery.digest = businessDigestForEnvelope(newerTopology);
  assert.deepEqual(
    evaluateCloudLinkIntegrationContext(observations, {
      ...context,
      acceptedTopologyDelivery: newerTopology,
    }),
    {
      accepted: false,
      failure_code: "TOPOLOGY_GENERATION_STALE",
      state_changed: false,
      successful_receipt_permitted: false,
    },
  );

  const otherGatewayTopology = structuredClone(topology);
  otherGatewayTopology.gateway_id = "77777777-7777-4777-8777-777777777777";
  assert.deepEqual(
    evaluateCloudLinkIntegrationContext(observations, {
      ...context,
      acceptedTopologyDelivery: otherGatewayTopology,
    }),
    {
      accepted: false,
      failure_code: "REFERENCE_NOT_FOUND",
      state_changed: false,
      successful_receipt_permitted: false,
    },
  );

  const otherGatewayBatch = structuredClone(observations);
  otherGatewayBatch.gateway_id = "77777777-7777-4777-8777-777777777777";
  assert.deepEqual(
    evaluateCloudLinkIntegrationContext(observations, {
      ...context,
      acceptedTopologyDelivery: topology,
      priorBatchDelivery: otherGatewayBatch,
    }),
    { accepted: true, state_changed: true },
  );
});

test("existing durable ACK binds every Integration delivery field", async () => {
  const [ajv, topology, topologyAck, observations, observationAck] =
    await Promise.all([
      validators(),
      readJson(`${fixtureDirectory}integration-topology.valid.json`),
      readJson(`${fixtureDirectory}integration-topology-ack.valid.json`),
      readJson(`${fixtureDirectory}integration-observations.valid.json`),
      readJson(`${fixtureDirectory}integration-observations-ack.valid.json`),
    ]);
  const validateAck = ajv.getSchema("durable-ack.schema.json");
  assert.ok(validateAck);
  assert.equal(validateAck(topologyAck), true, JSON.stringify(validateAck.errors));
  assert.equal(
    validateAck(observationAck),
    true,
    JSON.stringify(validateAck.errors),
  );

  assert.equal(durableAckMatchesAcceptedDelivery(topologyAck, topology), true);
  assert.equal(
    durableAckMatchesAcceptedDelivery(observationAck, observations),
    true,
  );
  assert.equal(
    durableAckMatchesAcceptedDelivery(
      { ...observationAck, batch_id: "other-batch" },
      observations,
    ),
    false,
  );
});

test("Integration CloudLink profile freezes rollout and complete-message budgets", async () => {
  const [profile, mqtt, topologyEnvelope] = await Promise.all([
    readJson("profiles/cloudlink/v1alpha1/integration.json"),
    readJson("profiles/mqtt/v1alpha1/profile.json"),
    readJson(`${fixtureDirectory}integration-topology.valid.json`),
  ]);

  assert.equal(profile.base_protocol_version, "1.0");
  assert.equal(profile.activation.required_runtime_protocol, profile.schema);
  assert.equal(profile.activation.cloud_first_rollout, true);
  assert.equal(profile.transport.maximum_message_bytes, 262_144);
  assert.equal(
    profile.transport.maximum_message_bytes,
    mqtt.transport.maximum_message_bytes,
  );
  assert.equal(profile.transport.topology_fragmentation, "forbidden");
  assert.equal(profile.security.provider_credentials, "edge-local-only");

  const oversizedTopology = structuredClone(topologyEnvelope);
  oversizedTopology.payload.areas.push(
    ...Array.from({ length: 1_200 }, (_, index) => ({
      area_id: `oversized-area-${String(index)}`,
      name: `Area ${String(index)} ${"x".repeat(220)}`,
    })),
  );
  const encoded = JSON.stringify(oversizedTopology);
  assert.ok(new TextEncoder().encode(encoded).byteLength > 262_144);
  assert.throws(
    () => decodeJson(encoded),
    (error) => error?.code === "FIELD_BOUND",
  );
});
