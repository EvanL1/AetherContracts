import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  evaluateIntegrationActionOfferContext,
  evaluateIntegrationActionReceiptContext,
  integrationActionIntentDigest,
} from "../lib/integration-control-context.mjs";
import { decodeJson } from "../lib/strict-json.mjs";

const repositoryRoot = new URL("../../", import.meta.url);
const fixtureDirectory = "fixtures/integration-control/v1alpha1/";

async function readJson(relativePath) {
  return decodeJson(await readFile(new URL(relativePath, repositoryRoot)));
}

async function validators() {
  const schemaDirectories = [
    "schemas/cloudlink/v1alpha1/",
    "schemas/integration-control/v1alpha1/",
  ];
  const paths = [];
  for (const directory of schemaDirectories) {
    const names = (await readdir(new URL(directory, repositoryRoot)))
      .filter((name) => name.endsWith(".schema.json"))
      .sort();
    paths.push(...names.map((name) => `${directory}${name}`));
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  for (const schema of await Promise.all(paths.map(readJson))) {
    ajv.addSchema(schema);
  }
  return ajv;
}

function currentSession(message) {
  return {
    gateway_id: message.gateway_id,
    session_id: message.session_id,
    session_epoch: message.session_epoch,
    credential_generation: message.credential_generation,
  };
}

function withIntent(offer, mutate) {
  const candidate = structuredClone(offer);
  mutate(candidate.intent);
  candidate.intent_digest = integrationActionIntentDigest(candidate.intent);
  return candidate;
}

test("Integration Control entry schemas accept only the fixed power action and provider receipt", async () => {
  const [ajv, offer, receipt, manifest] = await Promise.all([
    validators(),
    readJson(`${fixtureDirectory}action-offer.valid.json`),
    readJson(`${fixtureDirectory}action-receipt-provider-accepted.valid.json`),
    readJson(`${fixtureDirectory}fixture-manifest.json`),
  ]);
  const validateOffer = ajv.getSchema("integration-action-offer.schema.json");
  const validateReceipt = ajv.getSchema("integration-action-receipt.schema.json");
  assert.ok(validateOffer);
  assert.ok(validateReceipt);

  assert.equal(validateOffer(offer), true, JSON.stringify(validateOffer.errors));
  assert.equal(
    validateReceipt(receipt),
    true,
    JSON.stringify(validateReceipt.errors),
  );
  assert.equal(offer.intent.capability_id, "device.power.set.v1");
  assert.deepEqual(offer.intent.arguments, { value: true });

  for (const entry of manifest.fixtures.filter(
    (fixture) => fixture.expectation === "wire-invalid",
  )) {
    const fixture = await readJson(`${fixtureDirectory}${entry.file}`);
    const validate = ajv.getSchema(entry.schema_id);
    assert.ok(validate, entry.schema_id);
    assert.equal(validate(fixture), false, entry.file);
  }

  const overlongFailureCode = await readJson(
    `${fixtureDirectory}invalid/action-receipt-overlong-failure-code.json`,
  );
  assert.equal(overlongFailureCode.payload.failure_code.length > 128, true);
  assert.equal(validateReceipt(overlongFailureCode), false);
});

test("public control messages cannot carry provider calls, secrets, or arbitrary arguments", async () => {
  const [ajv, offer] = await Promise.all([
    validators(),
    readJson(`${fixtureDirectory}action-offer.valid.json`),
  ]);
  const validateOffer = ajv.getSchema("integration-action-offer.schema.json");
  assert.ok(validateOffer);

  for (const forbidden of [
    ["domain", "light"],
    ["service", "turn_on"],
    ["service_data", { brightness: 255 }],
    ["url", "https://home-assistant.invalid"],
    ["token", "not-a-real-token"],
  ]) {
    const candidate = structuredClone(offer);
    candidate.intent.arguments[forbidden[0]] = forbidden[1];
    assert.equal(validateOffer(candidate), false, forbidden[0]);
  }

  const arbitraryArgument = structuredClone(offer);
  arbitraryArgument.intent.arguments.payload = { nested: ["arbitrary"] };
  assert.equal(validateOffer(arbitraryArgument), false);

  const unknownAction = structuredClone(offer);
  unknownAction.intent.capability_id = "home-assistant.call-service.v1";
  assert.equal(validateOffer(unknownAction), false);
});

test("Integration Control is a separate default-off, edge-first extension", async () => {
  const [cloudLinkProfile, homeAssistantProfile, core] = await Promise.all([
    readJson("profiles/cloudlink/v1alpha1/integration-control.json"),
    readJson("profiles/integration-control/v1alpha1/home-assistant.json"),
    readJson("profiles/cloudlink/v1alpha1/core.json"),
  ]);

  assert.equal(
    cloudLinkProfile.schema,
    "aether.cloudlink.integration-control.v1alpha1",
  );
  assert.equal(cloudLinkProfile.activation.default_enabled, false);
  assert.equal(
    cloudLinkProfile.activation.required_runtime_protocol,
    cloudLinkProfile.schema,
  );
  assert.equal(
    cloudLinkProfile.activation.base_protocol_negotiation_alone_is_sufficient,
    false,
  );
  assert.equal(cloudLinkProfile.activation.edge_first_rollout, true);
  assert.deepEqual(homeAssistantProfile.actions, ["device.power.set.v1"]);
  assert.deepEqual(
    homeAssistantProfile.power_set.supported_entity_kinds,
    ["fan", "light", "switch"],
  );
  assert.equal(homeAssistantProfile.power_set.point_key, "is_on");
  assert.equal(homeAssistantProfile.provider_result.success_stage, "provider-accepted");
  assert.equal(homeAssistantProfile.provider_result.physical_completion, "unknown");
  assert.equal(
    core.extensions["aether.cloudlink.integration-control.v1alpha1"].activation,
    "explicit-default-off",
  );
  assert.equal(core.physical_control, "forbidden");
});

test("offer signing freezes every authority, session, job, time, and intent binding", async () => {
  const profile = await readJson(
    "profiles/cloudlink/v1alpha1/integration-control.json",
  );

  assert.deepEqual(profile.offer_authentication.signed_object_fields, [
    "schema",
    "protocol",
    "protocol_version",
    "extension",
    "message_kind",
    "gateway_id",
    "session_id",
    "session_epoch",
    "credential_generation",
    "job_id",
    "issued_at_ms",
    "expires_at_ms",
    "intent_digest",
    "intent",
  ]);
  assert.equal(
    profile.offer_authentication.canonicalization,
    "RFC 8785 JCS UTF-8 bytes",
  );
  assert.equal(profile.offer_authentication.requirement, "every-offer");
});

test("offer context is default deny and binds the exact accepted topology target", async () => {
  const [offer, topology] = await Promise.all([
    readJson(`${fixtureDirectory}action-offer.valid.json`),
    readJson("fixtures/integration/v1alpha1/valid/home-assistant-topology.json"),
  ]);
  const authorized = {
    currentSession: currentSession(offer),
    evaluationTimeMs: "1784217601000",
    topology,
    extensionEnabled: true,
    cloudAuthenticationVerified: true,
    confirmationVerified: true,
    localPolicyAuthorized: true,
  };

  assert.equal(
    integrationActionIntentDigest(offer.intent),
    offer.intent_digest,
  );
  assert.deepEqual(evaluateIntegrationActionOfferContext(offer, authorized), {
    accepted: true,
    state_changed: true,
    execution_permitted: true,
    edge_final_decision_required: true,
  });
  assert.deepEqual(
    evaluateIntegrationActionOfferContext(offer, {
      ...authorized,
      extensionEnabled: false,
    }),
    {
      accepted: false,
      failure_code: "CAPABILITY_DENIED",
      state_changed: false,
      execution_permitted: false,
    },
  );
  assert.deepEqual(
    evaluateIntegrationActionOfferContext(offer, {
      ...authorized,
      localPolicyAuthorized: false,
    }),
    {
      accepted: false,
      failure_code: "CAPABILITY_DENIED",
      state_changed: false,
      execution_permitted: false,
    },
  );

  const stale = withIntent(offer, (intent) => {
    intent.target.snapshot_generation = "0";
  });
  assert.deepEqual(evaluateIntegrationActionOfferContext(stale, authorized), {
    accepted: false,
    failure_code: "TOPOLOGY_GENERATION_STALE",
    state_changed: false,
    execution_permitted: false,
  });

  const missingEntity = withIntent(offer, (intent) => {
    intent.target.entity_id = "entity-registry-missing";
  });
  assert.deepEqual(
    evaluateIntegrationActionOfferContext(missingEntity, authorized),
    {
      accepted: false,
      failure_code: "REFERENCE_NOT_FOUND",
      state_changed: false,
      execution_permitted: false,
    },
  );

  const unsupportedEntity = withIntent(offer, (intent) => {
    intent.target.entity_id = "entity-registry-climate-living";
    intent.target.point_key = "current_temperature";
  });
  assert.deepEqual(
    evaluateIntegrationActionOfferContext(unsupportedEntity, authorized),
    {
      accepted: false,
      failure_code: "CAPABILITY_DENIED",
      state_changed: false,
      execution_permitted: false,
    },
  );
});

test("job replay never repeats provider execution and conflicting intent is rejected", async () => {
  const [offer, topology] = await Promise.all([
    readJson(`${fixtureDirectory}action-offer.valid.json`),
    readJson("fixtures/integration/v1alpha1/valid/home-assistant-topology.json"),
  ]);
  const context = {
    currentSession: currentSession(offer),
    evaluationTimeMs: "1784217601000",
    topology,
    extensionEnabled: true,
    cloudAuthenticationVerified: true,
    confirmationVerified: true,
    localPolicyAuthorized: true,
    priorAcceptedOffer: offer,
  };

  assert.deepEqual(evaluateIntegrationActionOfferContext(offer, context), {
    accepted: true,
    state_changed: false,
    execution_permitted: false,
    receipt_replay_required: true,
  });

  const conflict = withIntent(offer, (intent) => {
    intent.arguments.value = false;
  });
  assert.deepEqual(evaluateIntegrationActionOfferContext(conflict, context), {
    accepted: false,
    failure_code: "DIGEST_CONFLICT",
    state_changed: false,
    execution_permitted: false,
  });
});

test("Home Assistant acceptance never becomes physical completion or job success", async () => {
  const [offer, receipt] = await Promise.all([
    readJson(`${fixtureDirectory}action-offer.valid.json`),
    readJson(`${fixtureDirectory}action-receipt-provider-accepted.valid.json`),
  ]);

  assert.deepEqual(evaluateIntegrationActionReceiptContext(receipt, offer), {
    accepted: true,
    provider_accepted: true,
    physical_completed: false,
    job_succeeded: false,
  });
  assert.equal(receipt.payload.stage, "provider-accepted");
  assert.equal(receipt.payload.physical_outcome, "unknown");
  assert.equal("succeeded" in receipt.payload, false);
  assert.equal("physical-confirmed" in receipt.payload, false);
});
