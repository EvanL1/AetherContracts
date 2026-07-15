import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { decodeJson } from "../lib/strict-json.mjs";

const repositoryRoot = new URL("../../", import.meta.url);

async function readJson(relativePath) {
  return decodeJson(await readFile(new URL(relativePath, repositoryRoot)));
}

test("CloudLink authentication remains experimental until key lifecycle exists", async () => {
  const gates = await readJson("compatibility/cloudlink-v1alpha1-gates.json");

  assert.equal(gates.status, "experimental-auth-proposal");
  assert.equal(gates.default_mode, "legacy");
  assert.equal(gates.physical_control, "forbidden");
  assert.equal(gates.gates.find((gate) => gate.id === "shared-broker-authentication")?.status, "proposal");
  assert.equal(gates.gates.find((gate) => gate.id === "signed-durable-ack")?.status, "planned");
});

test("the experimental origin profile freezes two distinct models and exact signing bytes", async () => {
  const authentication = await readJson(
    "profiles/cloudlink/v1alpha1/authentication.json",
  );

  assert.equal(authentication.status, "experimental");
  assert.equal(authentication.gate_status, "experimental");
  assert.deepEqual(Object.keys(authentication.origin_models), [
    "gateway-signed",
    "trusted-connector-broker-attestation",
  ]);
  assert.equal(
    authentication.origin_models["gateway-signed"].session_establishment
      .canonicalization,
    "RFC 8785 JCS UTF-8 bytes",
  );
  assert.deepEqual(
    authentication.origin_models["gateway-signed"].session_establishment
      .cloud_challenge_signing.signed_object_fields,
    [
      "schema",
      "gateway_id",
      "challenge_id",
      "cloud_nonce",
      "issued_at_ms",
      "expires_at_ms",
    ],
  );
  assert.deepEqual(
    authentication.origin_models["gateway-signed"].session_establishment
      .signed_object_fields,
    [
      "schema",
      "gateway_id",
      "credential_id",
      "credential_generation",
      "gateway_key_id",
      "challenge_id",
      "cloud_nonce",
      "client_nonce",
      "offered_protocol_versions",
      "resume",
    ],
  );
  assert.deepEqual(
    authentication.origin_models["gateway-signed"].per_uplink
      .signed_object_fields,
    [
      "schema",
      "gateway_id",
      "credential_generation",
      "session_id",
      "session_epoch",
      "message_kind",
      "sent_at_ms",
      "expires_at_ms",
      "stream_id",
      "stream_epoch",
      "position",
      "batch_id",
      "business_digest",
    ],
  );
  assert.equal(
    authentication.origin_models["gateway-signed"].per_uplink.requirement,
    "every-uplink",
  );
  assert.deepEqual(
    authentication.origin_models["gateway-signed"].per_uplink.replay_bounds,
    {
      accepted_session_exact_match: true,
      credential_generation_exact_match: true,
      deadline_check: "evaluation_time_ms < expires_at_ms when expires_at_ms is present",
      signature_scope: "one exact canonical signing object",
      replay_identity: ["gateway_id", "stream_id", "stream_epoch", "position"],
      stable_bindings: ["batch_id", "business_digest"],
    },
  );
  assert.equal(
    authentication.origin_models["trusted-connector-broker-attestation"]
      .attestation_location,
    "outside-payload-ingress-metadata",
  );
  assert.equal(
    authentication.origin_models["trusted-connector-broker-attestation"]
      .required_for_every_publish,
    true,
  );
  assert.deepEqual(authentication.insufficient_origin_evidence, [
    "topic",
    "payload-identity",
    "mqtt-credential-alone",
  ]);
  assert.equal(authentication.payload_supplied_attestation, "reject");
});

test("alpha.3 keeps the application ACK unsigned and binds the complete accepted delivery", async () => {
  const [ackSchema, profile] = await Promise.all([
    readJson("schemas/cloudlink/v1alpha1/durable-ack.schema.json"),
    readJson("profiles/cloudlink/v1alpha1/core.json"),
  ]);

  assert.equal(profile.acknowledgement.signature, "absent-in-alpha.3");
  assert.equal(
    profile.acknowledgement.persistence,
    "success means the application fact and receipt are durable before publication",
  );
  assert.match(profile.acknowledgement.production_crash_durability, /^unproven-/u);
  assert.deepEqual(profile.acknowledgement.accepted_delivery_binding, [
    "gateway_id",
    "session_id",
    "session_epoch",
    "credential_generation",
    "stream_id",
    "stream_epoch",
    "acknowledged_position",
    "batch_id",
    "digest",
    "receipt_id",
  ]);
  assert.equal(Object.hasOwn(ackSchema.properties, "cloud_signature"), false);
  assert.equal(Object.hasOwn(ackSchema.properties, "cloud_key_id"), false);
});

test("Thing Model capability declarations are deny-by-default and never direct operations", async () => {
  const model = await readJson("fixtures/thing-model/v1alpha1/valid/voltage-battery.golden.json");

  for (const capability of model.capabilities) {
    assert.equal(capability.execution, "governed-job");
    assert.equal(capability.default_authorization, "deny");
    assert.equal(capability.edge_final_decision, true);
  }
});

test("deployment observation keeps Desired, Reported, and Applied as distinct facts", async () => {
  const schema = await readJson("schemas/thing-model/v1alpha1/deployment-observation.schema.json");
  assert.deepEqual(schema.required, ["schema", "gateway_id", "desired", "reported", "applied", "observed_at_ms"]);
  assert.notEqual(schema.properties.desired.$ref, schema.properties.reported.$ref);
  assert.notEqual(schema.properties.reported.$ref, schema.properties.applied.$ref);
});

test("cross-language failure codes define canonical and range failures separately", async () => {
  const taxonomy = await readJson("compatibility/failure-codes.json");
  const codes = new Map(taxonomy.failures.map((failure) => [failure.code, failure]));

  assert.deepEqual(codes.get("INTEGER_NON_CANONICAL")?.examples, ["", "-1", "+1", "01", "1.0", "abc"]);
  assert.equal(codes.get("INTEGER_OUT_OF_RANGE")?.maximum, "18446744073709551615");
  assert.equal(codes.get("INVALID_ARGUMENT")?.scope, "binding-api-misuse-only");
});

test("every fixture and scenario failure uses the published taxonomy", async () => {
  const [taxonomy, cloudLink, thingModel, scenarios] = await Promise.all([
    readJson("compatibility/failure-codes.json"),
    readJson("fixtures/cloudlink/v1alpha1/fixture-manifest.json"),
    readJson("fixtures/thing-model/v1alpha1/fixture-manifest.json"),
    readJson("tck/scenarios/core.json"),
  ]);
  const published = new Set(taxonomy.failures.map((failure) => failure.code));
  const used = [
    ...cloudLink.fixtures.map((fixture) => fixture.failure_code),
    ...thingModel.fixtures.map((fixture) => fixture.failure_code),
    ...scenarios.scenarios.map((scenario) => scenario.expected.failure_code),
  ].filter((code) => typeof code === "string");

  assert.deepEqual([...new Set(used)].filter((code) => !published.has(code)), []);
});

test("CloudLink core freezes primary position identity and digest projection", async () => {
  const profile = await readJson("profiles/cloudlink/v1alpha1/core.json");

  assert.deepEqual(profile.replay.position_identity, [
    "gateway_id",
    "delivery.stream_id",
    "delivery.stream_epoch",
    "delivery.position",
  ]);
  assert.deepEqual(profile.replay.required_stable_bindings, [
    "delivery.batch_id",
    "delivery.digest",
  ]);
  assert.deepEqual(Object.keys(profile.business_digest.projection), [
    "protocol_version",
    "message_kind",
    "payload",
  ]);
  assert.equal(profile.authentication.shared_broker_profile, "experimental");
  assert.equal(profile.physical_control, "forbidden");
});
