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
  assert.equal(
    gates.gates.find((gate) => gate.id === "shared-broker-authentication")
      ?.status,
    "proposal",
  );
  assert.equal(
    gates.gates.find((gate) => gate.id === "signed-durable-ack")?.status,
    "planned",
  );
});

test("MQTT prefix is an authorization namespace with exact principal scope, never authentication", async () => {
  const mqtt = await readJson("profiles/mqtt/v1alpha1/profile.json");

  assert.deepEqual(mqtt.namespace_authorization, {
    prefix_role: "authorization-namespace",
    gateway_id_uniqueness: "unique-within-one-prefix",
    multi_tenant_requirement:
      "tenant-and-project-isolated-prefix-or-cloud-global-gateway-id",
    broker_principal_scope: {
      publish: "exact-prefix-and-gateway-up-topics-only",
      subscribe: "exact-prefix-and-gateway-down-topics-only",
      cross_namespace: false,
      wildcard_gateway: false,
    },
  });
  assert.equal(mqtt.authentication.prefix_identity_is_authentication, false);
  assert.equal(mqtt.authentication.topic_identity_is_authentication, false);
});

test("the experimental origin profile freezes two distinct models and exact signing bytes", async () => {
  const authentication = await readJson(
    "profiles/cloudlink/v1alpha1/authentication.json",
  );

  assert.equal(authentication.status, "experimental");
  assert.equal(authentication.gate_status, "experimental");
  assert.deepEqual(authentication.activation, {
    default_enabled: false,
    selection: "explicit",
  });
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
    authentication.origin_models["gateway-signed"].challenge_request
      .wire_fields,
    [
      "schema",
      "protocol",
      "message_kind",
      "gateway_id",
      "credential_binding",
      "offered_protocol_versions",
      "client_nonce",
      "resume",
    ],
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
    authentication.origin_models["gateway-signed"].session_establishment
      .cloud_challenge_signing.wire_to_signing_projection,
    {
      schema: "literal:aether.cloudlink.session-challenge-signing.v1alpha1",
      gateway_id: "session-challenge.gateway_id",
      challenge_id: "session-challenge.challenge_id",
      cloud_nonce: "session-challenge.cloud_nonce",
      issued_at_ms: "session-challenge.issued_at_ms",
      expires_at_ms: "session-challenge.expires_at_ms",
    },
  );
  assert.deepEqual(
    authentication.origin_models["gateway-signed"].session_establishment
      .wire_to_signing_projection,
    {
      schema: "literal:aether.cloudlink.session-establishment-signing.v1alpha1",
      gateway_id: "session-hello.gateway_id",
      credential_id: "session-hello.credential_binding.credential_id",
      credential_generation: "session-hello.credential_binding.generation",
      gateway_key_id: "session-hello.gateway_key_id",
      challenge_id: "session-hello.challenge_id",
      cloud_nonce: "persisted-session-challenge.cloud_nonce",
      client_nonce: "session-hello.client_nonce",
      offered_protocol_versions: "session-hello.offered_protocol_versions",
      resume: "session-hello.resume",
    },
  );
  assert.equal(
    authentication.origin_models["gateway-signed"].session_establishment
      .replay_bounds.challenge_deadline_check,
    "evaluation_time_ms < expires_at_ms",
  );
  assert.equal(
    authentication.origin_models["gateway-signed"].session_establishment
      .replay_bounds.challenge_expiry_equality_is_expired,
    true,
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
    authentication.origin_models["gateway-signed"].per_uplink
      .delivery_immutable_replay_projection,
    {
      object_schema: "aether.cloudlink.immutable-delivery-replay.v1alpha1",
      object_fields: [
        "schema",
        "gateway_id",
        "credential_generation",
        "message_kind",
        "sent_at_ms",
        "expires_at_ms",
        "stream_id",
        "stream_epoch",
        "position",
        "batch_id",
        "business_digest",
      ],
      signing_to_immutable_projection: {
        schema: "literal:aether.cloudlink.immutable-delivery-replay.v1alpha1",
        gateway_id: "uplink-signing.gateway_id",
        credential_generation: "uplink-signing.credential_generation",
        message_kind: "uplink-signing.message_kind",
        sent_at_ms: "uplink-signing.sent_at_ms",
        expires_at_ms: "uplink-signing.expires_at_ms",
        stream_id: "uplink-signing.stream_id",
        stream_epoch: "uplink-signing.stream_epoch",
        position: "uplink-signing.position",
        batch_id: "uplink-signing.batch_id",
        business_digest: "uplink-signing.business_digest",
      },
      digest: "sha256:<lowercase-hex> over RFC 8785 JCS UTF-8 object bytes",
      session_independent: true,
    },
  );
  assert.deepEqual(
    authentication.origin_models["gateway-signed"].per_uplink.replay_bounds,
    {
      accepted_session_exact_match: true,
      credential_generation_exact_match: true,
      signature_scope: "one exact canonical signing object",
      validation_order:
        "signature, active key, Broker principal authorization namespace, accepted current session and Gateway identity, and credential generation before durable identity lookup, freshness, or replay",
      delivery: {
        first_acceptance_deadline_check:
          "evaluation_time_ms < expires_at_ms when expires_at_ms is present",
        first_acceptance_expiry_equality_failure: "MESSAGE_EXPIRED",
        replay_identity: [
          "gateway_id",
          "stream_id",
          "stream_epoch",
          "position",
        ],
        replay_state: [
          "authorization_namespace_partition",
          "replay_identity",
          "immutable_delivery_digest",
          "current_session_binding.session_id",
          "current_session_binding.session_epoch",
          "current_session_binding.exact_signing_object_digest",
        ],
        committed_record_semantics:
          "business-effect-and-replay-record-atomically-durable",
        durable_lookup_scope:
          "validated-authorization-namespace-partition-then-four-field-replay-identity",
        namespace_from_payload: false,
        global_unpartitioned_lookup: "forbidden",
        pending_authentication_record_bypasses_expiry: false,
        first_commit_before_receipt:
          "business-effect-and-replay-record-commit-atomically",
        rebind_commit_before_receipt:
          "updated-current-session-binding-is-durable",
        same_session_exact_replay:
          "idempotent-without-repeating-business-side-effects",
        higher_session_epoch_rebind:
          "update-only-current-session-binding-and-reissue-current-session-receipt-without-business-side-effects",
        committed_exact_delivery_after_expiry:
          "replay-or-higher-epoch-rebind-permitted-without-business-side-effects",
        same_epoch_different_session_id: "AUTHENTICATION_INVALID",
        session_epoch_rollback: "AUTHENTICATION_INVALID",
        credential_generation_rebind:
          "forbidden-in-alpha.4-use-future-stream-epoch-or-migration-contract",
        immutable_fields_include: [
          "gateway_id",
          "credential_generation",
          "message_kind",
          "sent_at_ms",
          "expires_at_ms",
          "stream_id",
          "stream_epoch",
          "position",
          "batch_id",
          "business_digest",
        ],
        sent_at_source: "persistent-edge-enqueue-fact",
        expires_at_retry_rule: "unchanged-from-persistent-edge-enqueue-fact",
        raw_signature_in_replay_digest: false,
        conflicting_signing_projection: "AUTHENTICATION_INVALID",
        conflict_precedes_committed_replay_expiry: true,
      },
      heartbeat: {
        heartbeat_interval_source: "accepted-session",
        future_check:
          "observed_at_ms <= evaluation_time_ms + heartbeat_interval_ms",
        stale_check:
          "evaluation_time_ms < observed_at_ms + 3 * heartbeat_interval_ms",
        stale_equality_failure: "MESSAGE_EXPIRED",
        excessive_future_failure: "AUTHENTICATION_INVALID",
        arithmetic_overflow: "AUTHENTICATION_INVALID",
        replay_state: [
          "highest_accepted_observed_at_ms",
          "exact_signing_object_digest",
        ],
        exact_replay: "idempotent-and-never-refreshes-server-liveness",
        same_time_conflicting_projection: "AUTHENTICATION_INVALID",
        lower_observed_at_ms: "AUTHENTICATION_INVALID-without-liveness-refresh",
        higher_fresh_observed_at_ms:
          "advance-replay-state-and-refresh-server-liveness",
      },
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

test("unsigned uncorrelated session acceptance and unsigned durable ACK both block production authentication", async () => {
  const [authentication, acceptedSchema, gates] = await Promise.all([
    readJson("profiles/cloudlink/v1alpha1/authentication.json"),
    readJson("schemas/cloudlink/v1alpha1/session-accepted.schema.json"),
    readJson("compatibility/cloudlink-v1alpha1-gates.json"),
  ]);

  for (const field of [
    "challenge_id",
    "client_nonce",
    "cloud_key_id",
    "cloud_signature",
  ]) {
    assert.equal(Object.hasOwn(acceptedSchema.properties, field), false);
  }
  assert.deepEqual(authentication.production_blockers, {
    session_accepted_response:
      "alpha.4 is unsigned and carries neither challenge_id nor client_nonce, so protocol-level correlation cannot exclude a delayed or replayed response from another handshake; a signed correlated response is planned for the next protocol version",
    durable_ack:
      "alpha.4 application durable ACK is unsigned; its signing projection and production fact/outbox transaction remain planned",
  });
  assert.equal(
    gates.gates.find((gate) => gate.id === "signed-correlated-session-accepted")
      ?.status,
    "planned-next-protocol-version",
  );
  assert.equal(
    gates.gates.find((gate) => gate.id === "signed-durable-ack")?.status,
    "planned",
  );
});

test("alpha.4 keeps the application ACK unsigned and binds the complete accepted delivery", async () => {
  const [ackSchema, profile] = await Promise.all([
    readJson("schemas/cloudlink/v1alpha1/durable-ack.schema.json"),
    readJson("profiles/cloudlink/v1alpha1/core.json"),
  ]);

  assert.equal(profile.acknowledgement.signature, "absent-in-alpha.4");
  assert.equal(
    profile.acknowledgement.persistence,
    "success means the application fact and receipt are durable before publication",
  );
  assert.match(
    profile.acknowledgement.production_crash_durability,
    /^unproven-/u,
  );
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
  const model = await readJson(
    "fixtures/thing-model/v1alpha1/valid/voltage-battery.golden.json",
  );

  for (const capability of model.capabilities) {
    assert.equal(capability.execution, "governed-job");
    assert.equal(capability.default_authorization, "deny");
    assert.equal(capability.edge_final_decision, true);
  }
});

test("deployment observation keeps Desired, Reported, and Applied as distinct facts", async () => {
  const schema = await readJson(
    "schemas/thing-model/v1alpha1/deployment-observation.schema.json",
  );
  assert.deepEqual(schema.required, [
    "schema",
    "gateway_id",
    "desired",
    "reported",
    "applied",
    "observed_at_ms",
  ]);
  assert.notEqual(
    schema.properties.desired.$ref,
    schema.properties.reported.$ref,
  );
  assert.notEqual(
    schema.properties.reported.$ref,
    schema.properties.applied.$ref,
  );
});

test("cross-language failure codes define canonical and range failures separately", async () => {
  const taxonomy = await readJson("compatibility/failure-codes.json");
  const codes = new Map(
    taxonomy.failures.map((failure) => [failure.code, failure]),
  );

  assert.deepEqual(codes.get("INTEGER_NON_CANONICAL")?.examples, [
    "",
    "-1",
    "+1",
    "01",
    "1.0",
    "abc",
  ]);
  assert.equal(
    codes.get("INTEGER_OUT_OF_RANGE")?.maximum,
    "18446744073709551615",
  );
  assert.equal(codes.get("INVALID_ARGUMENT")?.scope, "binding-api-misuse-only");
});

test("every fixture and scenario failure uses the published taxonomy", async () => {
  const [taxonomy, cloudLink, integrationControl, thingModel, scenarios] =
    await Promise.all([
      readJson("compatibility/failure-codes.json"),
      readJson("fixtures/cloudlink/v1alpha1/fixture-manifest.json"),
      readJson("fixtures/integration-control/v1alpha1/fixture-manifest.json"),
      readJson("fixtures/thing-model/v1alpha1/fixture-manifest.json"),
      readJson("tck/scenarios/core.json"),
    ]);
  const published = new Set(taxonomy.failures.map((failure) => failure.code));
  const used = [
    ...cloudLink.fixtures.map((fixture) => fixture.failure_code),
    ...integrationControl.fixtures.map((fixture) => fixture.failure_code),
    ...thingModel.fixtures.map((fixture) => fixture.failure_code),
    ...scenarios.scenarios.map((scenario) => scenario.expected.failure_code),
  ].filter((code) => typeof code === "string");

  assert.deepEqual(
    [...new Set(used)].filter((code) => !published.has(code)),
    [],
  );
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
