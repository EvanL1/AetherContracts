import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { decodeJson } from "../lib/strict-json.mjs";

const repositoryRoot = new URL("../../", import.meta.url);

async function readJson(relativePath) {
  return decodeJson(await readFile(new URL(relativePath, repositoryRoot)));
}

test("CloudLink interoperability gates keep authentication unresolved and legacy default", async () => {
  const gates = await readJson("compatibility/cloudlink-v1alpha1-gates.json");

  assert.equal(gates.status, "experimental-auth-unresolved");
  assert.equal(gates.default_mode, "legacy");
  assert.equal(gates.physical_control, "forbidden");
  assert.equal(gates.gates.find((gate) => gate.id === "shared-broker-authentication")?.status, "proposal");
  assert.equal(gates.gates.find((gate) => gate.id === "signed-durable-ack")?.status, "planned");
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
  assert.equal(profile.authentication.shared_broker_profile, "unresolved");
  assert.equal(profile.physical_control, "forbidden");
});
