import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  acceptGatewaySignedDelivery,
  acceptGatewaySignedHeartbeat,
  acceptSessionHello,
  digestUplinkSigningObject,
  issueOrRetrySessionChallenge,
  projectImmutableDeliveryReplayObject,
  projectUplinkSigningObject,
} from "../lib/cloudlink-authentication-context.mjs";
import { durableAckMatchesAcceptedDelivery } from "../lib/scenario-runner.mjs";
import { decodeJson } from "../lib/strict-json.mjs";

const repositoryRoot = new URL("../../", import.meta.url);

async function readJson(relativePath) {
  return decodeJson(await readFile(new URL(relativePath, repositoryRoot)));
}

const messageAuthentication = {
  key_id: "development-gateway-key-1",
  algorithm: "Ed25519",
  signature:
    "EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE",
};

const authorizationNamespace = "tenants/tenant-a/projects/project-a";

function acceptedSession(message, heartbeatIntervalMs = "30000") {
  return {
    authorization_namespace: authorizationNamespace,
    gateway_id: message.gateway_id,
    session_id: message.session_id,
    session_epoch: message.session_epoch,
    credential_generation: message.credential_generation,
    gateway_key_id: messageAuthentication.key_id,
    heartbeat_interval_ms: heartbeatIntervalMs,
  };
}

function authenticated(message) {
  return {
    ...message,
    message_authentication: messageAuthentication,
  };
}

function verifiedContext(message, overrides = {}) {
  return {
    accepted_session: acceptedSession(message),
    accepted_session_active: true,
    broker_principal_authorized: true,
    evaluation_time_ms: message.observed_at_ms ?? message.sent_at_ms,
    gateway_key_active: true,
    gateway_signature_verified: true,
    received_authorization_namespace: authorizationNamespace,
    ...overrides,
  };
}

test("delivery and heartbeat wire messages have exact non-guessable uplink signing projections", async () => {
  const [profile, telemetry, topology, observations, receipt, heartbeat] =
    await Promise.all([
      readJson("profiles/cloudlink/v1alpha1/authentication.json"),
      readJson("fixtures/cloudlink/v1alpha1/telemetry-batch.valid.json"),
      readJson(
        "fixtures/cloudlink-integration/v1alpha1/integration-topology.valid.json",
      ),
      readJson(
        "fixtures/cloudlink-integration/v1alpha1/integration-observations.valid.json",
      ),
      readJson(
        "fixtures/integration-control/v1alpha1/action-receipt-provider-accepted.valid.json",
      ),
      readJson("fixtures/cloudlink/v1alpha1/heartbeat.valid.json"),
    ]);

  assert.deepEqual(
    profile.origin_models["gateway-signed"].per_uplink
      .wire_to_signing_projections,
    {
      delivery: {
        applies_to: [
          "core-envelope",
          "integration-topology-snapshot",
          "integration-observation-batch",
          "integration-action-receipt",
        ],
        projection: {
          schema: "literal:aether.cloudlink.uplink-signing.v1alpha1",
          gateway_id: "uplink.gateway_id",
          credential_generation: "uplink.credential_generation",
          session_id: "uplink.session_id",
          session_epoch: "uplink.session_epoch",
          message_kind: "uplink.message_kind",
          sent_at_ms: "uplink.sent_at_ms",
          expires_at_ms: "uplink.expires_at_ms-or-JSON-null",
          stream_id: "uplink.delivery.stream_id",
          stream_epoch: "uplink.delivery.stream_epoch",
          position: "uplink.delivery.position",
          batch_id: "uplink.delivery.batch_id",
          business_digest: "uplink.delivery.digest",
        },
      },
      heartbeat: {
        applies_to: ["heartbeat"],
        projection: {
          schema: "literal:aether.cloudlink.uplink-signing.v1alpha1",
          gateway_id: "heartbeat.gateway_id",
          credential_generation: "heartbeat.credential_generation",
          session_id: "heartbeat.session_id",
          session_epoch: "heartbeat.session_epoch",
          message_kind: "heartbeat.message_kind",
          sent_at_ms: "heartbeat.observed_at_ms",
          expires_at_ms: "literal:JSON-null",
          stream_id: "literal:JSON-null",
          stream_epoch: "literal:JSON-null",
          position: "literal:JSON-null",
          batch_id: "literal:JSON-null",
          business_digest: "literal:JSON-null",
        },
      },
    },
  );

  for (const delivery of [telemetry, topology, observations, receipt]) {
    assert.deepEqual(projectUplinkSigningObject(delivery), {
      schema: "aether.cloudlink.uplink-signing.v1alpha1",
      gateway_id: delivery.gateway_id,
      credential_generation: delivery.credential_generation,
      session_id: delivery.session_id,
      session_epoch: delivery.session_epoch,
      message_kind: delivery.message_kind,
      sent_at_ms: delivery.sent_at_ms,
      expires_at_ms: delivery.expires_at_ms ?? null,
      stream_id: delivery.delivery.stream_id,
      stream_epoch: delivery.delivery.stream_epoch,
      position: delivery.delivery.position,
      batch_id: delivery.delivery.batch_id,
      business_digest: delivery.delivery.digest,
    });
    assert.deepEqual(projectImmutableDeliveryReplayObject(delivery), {
      schema: "aether.cloudlink.immutable-delivery-replay.v1alpha1",
      gateway_id: delivery.gateway_id,
      credential_generation: delivery.credential_generation,
      message_kind: delivery.message_kind,
      sent_at_ms: delivery.sent_at_ms,
      expires_at_ms: delivery.expires_at_ms ?? null,
      stream_id: delivery.delivery.stream_id,
      stream_epoch: delivery.delivery.stream_epoch,
      position: delivery.delivery.position,
      batch_id: delivery.delivery.batch_id,
      business_digest: delivery.delivery.digest,
    });
  }

  assert.deepEqual(projectUplinkSigningObject(heartbeat), {
    schema: "aether.cloudlink.uplink-signing.v1alpha1",
    gateway_id: heartbeat.gateway_id,
    credential_generation: heartbeat.credential_generation,
    session_id: heartbeat.session_id,
    session_epoch: heartbeat.session_epoch,
    message_kind: heartbeat.message_kind,
    sent_at_ms: heartbeat.observed_at_ms,
    expires_at_ms: null,
    stream_id: null,
    stream_epoch: null,
    position: null,
    batch_id: null,
    business_digest: null,
  });
});

test("heartbeat acceptance freezes future skew, strict expiry, and authentication precedence", async () => {
  const fixture = await readJson(
    "fixtures/cloudlink/v1alpha1/heartbeat.valid.json",
  );
  const heartbeat = authenticated(fixture);
  const observedAt = BigInt(heartbeat.observed_at_ms);
  const interval = 30_000n;

  for (const evaluationTime of [
    observedAt - interval,
    observedAt + 3n * interval - 1n,
  ]) {
    const accepted = acceptGatewaySignedHeartbeat(
      heartbeat,
      verifiedContext(heartbeat, {
        evaluation_time_ms: evaluationTime.toString(),
      }),
    );
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.replayed, false);
    assert.equal(accepted.refresh_server_liveness, true);
  }

  const tooFarFuture = acceptGatewaySignedHeartbeat(
    heartbeat,
    verifiedContext(heartbeat, {
      evaluation_time_ms: (observedAt - interval - 1n).toString(),
    }),
  );
  assert.equal(tooFarFuture.accepted, false);
  assert.equal(tooFarFuture.failure_code, "AUTHENTICATION_INVALID");
  assert.equal(tooFarFuture.refresh_server_liveness, false);

  const expiredAtEquality = acceptGatewaySignedHeartbeat(
    heartbeat,
    verifiedContext(heartbeat, {
      evaluation_time_ms: (observedAt + 3n * interval).toString(),
    }),
  );
  assert.equal(expiredAtEquality.accepted, false);
  assert.equal(expiredAtEquality.failure_code, "MESSAGE_EXPIRED");
  assert.equal(expiredAtEquality.refresh_server_liveness, false);

  for (const authenticationOverride of [
    { gateway_signature_verified: false },
    { gateway_key_active: false },
    { accepted_session_active: false },
    { broker_principal_authorized: false },
    {
      received_authorization_namespace: "tenants/tenant-b/projects/project-a",
    },
    {
      accepted_session: {
        ...acceptedSession(heartbeat),
        session_id: "22222222-2222-4222-8222-222222222222",
      },
    },
    {
      accepted_session: {
        ...acceptedSession(heartbeat),
        credential_generation: "4",
      },
    },
  ]) {
    const rejectedBeforeExpiry = acceptGatewaySignedHeartbeat(
      heartbeat,
      verifiedContext(heartbeat, {
        evaluation_time_ms: (observedAt + 3n * interval).toString(),
        ...authenticationOverride,
      }),
    );
    assert.equal(rejectedBeforeExpiry.accepted, false);
    assert.equal(rejectedBeforeExpiry.failure_code, "AUTHENTICATION_INVALID");
  }
});

test("heartbeat exact replay is idempotent without refreshing liveness, while lower and conflicting replay fail closed", async () => {
  const fixture = await readJson(
    "fixtures/cloudlink/v1alpha1/heartbeat.valid.json",
  );
  const heartbeat = authenticated(fixture);
  const first = acceptGatewaySignedHeartbeat(
    heartbeat,
    verifiedContext(heartbeat),
  );
  assert.equal(first.accepted, true);
  assert.equal(first.replayed, false);
  assert.equal(first.refresh_server_liveness, true);
  assert.deepEqual(first.next_heartbeat_replay_state, {
    highest_accepted_observed_at_ms: heartbeat.observed_at_ms,
    exact_signing_object_digest: digestUplinkSigningObject(
      projectUplinkSigningObject(heartbeat),
    ),
  });

  const replay = acceptGatewaySignedHeartbeat(
    heartbeat,
    verifiedContext(heartbeat, {
      evaluation_time_ms: (BigInt(heartbeat.observed_at_ms) + 1n).toString(),
      heartbeat_replay_state: first.next_heartbeat_replay_state,
    }),
  );
  assert.equal(replay.accepted, true);
  assert.equal(replay.replayed, true);
  assert.equal(replay.refresh_server_liveness, false);
  assert.deepEqual(
    replay.next_heartbeat_replay_state,
    first.next_heartbeat_replay_state,
  );

  const conflictingProjection = authenticated({
    ...fixture,
    message_kind: "heartbeat-ack",
  });
  const conflict = acceptGatewaySignedHeartbeat(
    conflictingProjection,
    verifiedContext(conflictingProjection, {
      heartbeat_replay_state: first.next_heartbeat_replay_state,
    }),
  );
  assert.equal(conflict.accepted, false);
  assert.equal(conflict.failure_code, "AUTHENTICATION_INVALID");
  assert.equal(conflict.refresh_server_liveness, false);
  assert.deepEqual(
    conflict.next_heartbeat_replay_state,
    first.next_heartbeat_replay_state,
  );

  const lowerHeartbeat = authenticated({
    ...fixture,
    observed_at_ms: (BigInt(fixture.observed_at_ms) - 1n).toString(),
  });
  const lower = acceptGatewaySignedHeartbeat(
    lowerHeartbeat,
    verifiedContext(lowerHeartbeat, {
      evaluation_time_ms: fixture.observed_at_ms,
      heartbeat_replay_state: first.next_heartbeat_replay_state,
    }),
  );
  assert.equal(lower.accepted, false);
  assert.equal(lower.failure_code, "AUTHENTICATION_INVALID");
  assert.equal(lower.refresh_server_liveness, false);
  assert.deepEqual(
    lower.next_heartbeat_replay_state,
    first.next_heartbeat_replay_state,
  );
});

test("heartbeat uint64 arithmetic overflow always fails closed without advancing replay or liveness", async () => {
  const fixture = await readJson(
    "fixtures/cloudlink/v1alpha1/heartbeat.valid.json",
  );
  const heartbeat = authenticated(fixture);
  const maximum = "18446744073709551615";
  const priorState = {
    highest_accepted_observed_at_ms: fixture.observed_at_ms,
    exact_signing_object_digest: digestUplinkSigningObject(
      projectUplinkSigningObject(heartbeat),
    ),
  };
  const maximumHeartbeat = authenticated({
    ...fixture,
    observed_at_ms: maximum,
  });

  for (const { message, context } of [
    {
      message: heartbeat,
      context: verifiedContext(heartbeat, {
        accepted_session: acceptedSession(heartbeat, "1"),
        evaluation_time_ms: maximum,
        heartbeat_replay_state: priorState,
      }),
    },
    {
      message: maximumHeartbeat,
      context: verifiedContext(maximumHeartbeat, {
        accepted_session: acceptedSession(maximumHeartbeat, "1"),
        evaluation_time_ms: (BigInt(maximum) - 1n).toString(),
        heartbeat_replay_state: priorState,
      }),
    },
    {
      message: heartbeat,
      context: verifiedContext(heartbeat, {
        accepted_session: acceptedSession(heartbeat, maximum),
        heartbeat_replay_state: priorState,
      }),
    },
  ]) {
    const rejected = acceptGatewaySignedHeartbeat(message, context);
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.failure_code, "AUTHENTICATION_INVALID");
    assert.equal(rejected.refresh_server_liveness, false);
    assert.deepEqual(rejected.next_heartbeat_replay_state, priorState);
  }
});

test("delivery replay stores one immutable digest and one current-session binding", async () => {
  const fixture = await readJson(
    "fixtures/cloudlink/v1alpha1/telemetry-batch.valid.json",
  );
  const delivery = authenticated(fixture);
  const first = acceptGatewaySignedDelivery(
    delivery,
    verifiedContext(delivery),
  );
  assert.equal(first.accepted, true);
  assert.equal(first.replayed, false);
  assert.equal(first.session_rebound, false);
  assert.equal(first.apply_business_effect, true);
  assert.deepEqual(first.next_committed_delivery, {
    authorization_namespace_partition: authorizationNamespace,
    replay_identity: {
      gateway_id: delivery.gateway_id,
      stream_id: delivery.delivery.stream_id,
      stream_epoch: delivery.delivery.stream_epoch,
      position: delivery.delivery.position,
    },
    immutable_delivery_digest: digestUplinkSigningObject(
      projectImmutableDeliveryReplayObject(delivery),
    ),
    current_session_binding: {
      session_id: delivery.session_id,
      session_epoch: delivery.session_epoch,
      exact_signing_object_digest: digestUplinkSigningObject(
        projectUplinkSigningObject(delivery),
      ),
    },
  });

  const replay = acceptGatewaySignedDelivery(
    delivery,
    verifiedContext(delivery, {
      committed_delivery: first.next_committed_delivery,
    }),
  );
  assert.equal(replay.accepted, true);
  assert.equal(replay.replayed, true);
  assert.equal(replay.session_rebound, false);
  assert.equal(replay.apply_business_effect, false);
  assert.deepEqual(
    replay.next_committed_delivery,
    first.next_committed_delivery,
  );

  const sameProjectionWithAnotherVerifiedSignature = {
    ...delivery,
    message_authentication: {
      ...delivery.message_authentication,
      signature: "F".repeat(86),
    },
  };
  const resignedReplay = acceptGatewaySignedDelivery(
    sameProjectionWithAnotherVerifiedSignature,
    verifiedContext(sameProjectionWithAnotherVerifiedSignature, {
      committed_delivery: first.next_committed_delivery,
    }),
  );
  assert.equal(resignedReplay.accepted, true);
  assert.equal(resignedReplay.replayed, true);
  assert.equal(resignedReplay.session_rebound, false);
  assert.equal(resignedReplay.apply_business_effect, false);
  assert.deepEqual(
    resignedReplay.next_committed_delivery,
    first.next_committed_delivery,
  );

  const secondNamespace = "tenants/tenant-b/projects/project-a";
  const secondNamespaceSession = {
    ...acceptedSession(delivery),
    authorization_namespace: secondNamespace,
  };
  const independentSecondNamespace = acceptGatewaySignedDelivery(
    delivery,
    verifiedContext(delivery, {
      accepted_session: secondNamespaceSession,
      received_authorization_namespace: secondNamespace,
    }),
  );
  assert.equal(independentSecondNamespace.accepted, true);
  assert.equal(independentSecondNamespace.apply_business_effect, true);
  assert.equal(
    independentSecondNamespace.next_committed_delivery
      .authorization_namespace_partition,
    secondNamespace,
  );
  assert.deepEqual(
    independentSecondNamespace.next_committed_delivery.replay_identity,
    first.next_committed_delivery.replay_identity,
  );

  const crossNamespaceReplay = acceptGatewaySignedDelivery(
    delivery,
    verifiedContext(delivery, {
      accepted_session: secondNamespaceSession,
      committed_delivery: first.next_committed_delivery,
      received_authorization_namespace: secondNamespace,
    }),
  );
  assert.equal(crossNamespaceReplay.accepted, false);
  assert.equal(crossNamespaceReplay.failure_code, "AUTHENTICATION_INVALID");
  assert.equal(crossNamespaceReplay.apply_business_effect, false);
  assert.deepEqual(
    crossNamespaceReplay.next_committed_delivery,
    first.next_committed_delivery,
  );
});

test("a durable delivery safely rebinds only to a current higher session epoch, including after restart and expiry", async () => {
  const [fixture, durableAckFixture] = await Promise.all([
    readJson("fixtures/cloudlink/v1alpha1/telemetry-batch.valid.json"),
    readJson("fixtures/cloudlink/v1alpha1/durable-ack.valid.json"),
  ]);
  const delivery = authenticated(fixture);
  const first = acceptGatewaySignedDelivery(
    delivery,
    verifiedContext(delivery),
  );
  const stateAfterRestart = JSON.parse(
    JSON.stringify(first.next_committed_delivery),
  );
  const nextSessionDelivery = authenticated({
    ...fixture,
    session_id: "55555555-5555-4555-8555-555555555555",
    session_epoch: "8",
  });

  const rebound = acceptGatewaySignedDelivery(
    nextSessionDelivery,
    verifiedContext(nextSessionDelivery, {
      evaluation_time_ms: nextSessionDelivery.expires_at_ms,
      committed_delivery: stateAfterRestart,
    }),
  );
  assert.equal(rebound.accepted, true);
  assert.equal(rebound.replayed, true);
  assert.equal(rebound.session_rebound, true);
  assert.equal(rebound.apply_business_effect, false);
  assert.equal(
    rebound.next_committed_delivery.immutable_delivery_digest,
    stateAfterRestart.immutable_delivery_digest,
  );
  assert.deepEqual(rebound.next_committed_delivery.current_session_binding, {
    session_id: nextSessionDelivery.session_id,
    session_epoch: nextSessionDelivery.session_epoch,
    exact_signing_object_digest: digestUplinkSigningObject(
      projectUplinkSigningObject(nextSessionDelivery),
    ),
  });
  const currentSessionAck = {
    ...durableAckFixture,
    session_id: nextSessionDelivery.session_id,
    session_epoch: nextSessionDelivery.session_epoch,
  };
  assert.equal(
    durableAckMatchesAcceptedDelivery(currentSessionAck, nextSessionDelivery),
    true,
  );
  assert.equal(
    durableAckMatchesAcceptedDelivery(durableAckFixture, nextSessionDelivery),
    false,
  );

  const reboundStateAfterRestart = JSON.parse(
    JSON.stringify(rebound.next_committed_delivery),
  );
  const replayAfterRestart = acceptGatewaySignedDelivery(
    nextSessionDelivery,
    verifiedContext(nextSessionDelivery, {
      evaluation_time_ms: nextSessionDelivery.expires_at_ms,
      committed_delivery: reboundStateAfterRestart,
    }),
  );
  assert.equal(replayAfterRestart.accepted, true);
  assert.equal(replayAfterRestart.replayed, true);
  assert.equal(replayAfterRestart.session_rebound, false);
  assert.equal(replayAfterRestart.apply_business_effect, false);
  assert.deepEqual(
    replayAfterRestart.next_committed_delivery,
    reboundStateAfterRestart,
  );

  const oldSessionReplay = acceptGatewaySignedDelivery(
    delivery,
    verifiedContext(delivery, {
      accepted_session: acceptedSession(nextSessionDelivery),
      evaluation_time_ms: nextSessionDelivery.expires_at_ms,
      committed_delivery: reboundStateAfterRestart,
    }),
  );
  assert.equal(oldSessionReplay.accepted, false);
  assert.equal(oldSessionReplay.failure_code, "AUTHENTICATION_INVALID");
  assert.equal(oldSessionReplay.apply_business_effect, false);
  assert.deepEqual(
    oldSessionReplay.next_committed_delivery,
    reboundStateAfterRestart,
  );

  for (const rejectedSession of [
    authenticated({
      ...fixture,
      session_id: "66666666-6666-4666-8666-666666666666",
      session_epoch: "8",
    }),
    authenticated({
      ...fixture,
      session_id: "77777777-7777-4777-8777-777777777777",
      session_epoch: "7",
    }),
    authenticated({
      ...fixture,
      session_id: "88888888-8888-4888-8888-888888888888",
      session_epoch: "9",
      credential_generation: "4",
    }),
  ]) {
    const rejected = acceptGatewaySignedDelivery(
      rejectedSession,
      verifiedContext(rejectedSession, {
        committed_delivery: reboundStateAfterRestart,
      }),
    );
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.failure_code, "AUTHENTICATION_INVALID");
    assert.equal(rejected.session_rebound, false);
    assert.equal(rejected.apply_business_effect, false);
    assert.deepEqual(
      rejected.next_committed_delivery,
      reboundStateAfterRestart,
    );
  }
});

test("delivery immutable conflicts fail authentication before expiry and never repeat a business effect", async () => {
  const fixture = await readJson(
    "fixtures/cloudlink/v1alpha1/telemetry-batch.valid.json",
  );
  const delivery = authenticated(fixture);
  const first = acceptGatewaySignedDelivery(
    delivery,
    verifiedContext(delivery),
  );

  for (const changedDelivery of [
    { ...delivery, message_kind: "runtime-manifest-report" },
    {
      ...delivery,
      sent_at_ms: (BigInt(delivery.sent_at_ms) + 1n).toString(),
    },
    {
      ...delivery,
      expires_at_ms: (BigInt(delivery.expires_at_ms) + 1n).toString(),
    },
    {
      ...delivery,
      delivery: { ...delivery.delivery, batch_id: "batch-conflict" },
    },
    {
      ...delivery,
      delivery: {
        ...delivery.delivery,
        digest: `sha256:${"b".repeat(64)}`,
      },
    },
  ]) {
    const conflict = acceptGatewaySignedDelivery(
      changedDelivery,
      verifiedContext(changedDelivery, {
        evaluation_time_ms: delivery.expires_at_ms,
        committed_delivery: first.next_committed_delivery,
      }),
    );
    assert.equal(conflict.accepted, false);
    assert.equal(conflict.failure_code, "AUTHENTICATION_INVALID");
    assert.equal(conflict.session_rebound, false);
    assert.equal(conflict.apply_business_effect, false);
    assert.deepEqual(
      conflict.next_committed_delivery,
      first.next_committed_delivery,
    );
  }
});

test("an expired delivery without a durable replay record cannot produce its first business effect", async () => {
  const fixture = await readJson(
    "fixtures/cloudlink/v1alpha1/telemetry-batch.valid.json",
  );
  const delivery = authenticated(fixture);
  const proposedFirstCommit = acceptGatewaySignedDelivery(
    delivery,
    verifiedContext(delivery),
  );
  const expired = acceptGatewaySignedDelivery(
    delivery,
    verifiedContext(delivery, {
      evaluation_time_ms: delivery.expires_at_ms,
      pending_delivery: proposedFirstCommit.next_committed_delivery,
    }),
  );

  assert.equal(expired.accepted, false);
  assert.equal(expired.failure_code, "MESSAGE_EXPIRED");
  assert.equal(expired.replayed, false);
  assert.equal(expired.session_rebound, false);
  assert.equal(expired.apply_business_effect, false);
  assert.equal(expired.next_committed_delivery, undefined);
});

test("challenge requests remain default-off triggers rather than identity credentials", async () => {
  const [authentication, mqtt] = await Promise.all([
    readJson("profiles/cloudlink/v1alpha1/authentication.json"),
    readJson("profiles/mqtt/v1alpha1/profile.json"),
  ]);
  const request =
    authentication.origin_models["gateway-signed"].challenge_request;

  assert.equal(authentication.activation.default_enabled, false);
  assert.equal(request.schema, "session-challenge-request.schema.json");
  assert.equal(request.mqtt_route, "up_session");
  assert.equal(request.request_is_identity_credential, false);
  assert.equal(request.commissioned_gateway_required, true);
  assert.equal(request.active_credential_binding_required, true);
  assert.equal(request.rate_limit_required, true);
  assert.equal(
    mqtt.topics[request.mqtt_route],
    "{prefix}/v1/gateways/{gatewayId}/up/session",
  );

  const fixture = await readJson(
    "fixtures/cloudlink/v1alpha1/session-challenge-request.valid.json",
  );
  const challenge = await readJson(
    "fixtures/cloudlink/v1alpha1/session-challenge.valid.json",
  );
  for (const context of [
    {
      evaluation_time_ms: "1721000000001",
      prepared_challenge: challenge,
      rate_limit_permits: true,
    },
    {
      commissioned_gateway: {
        gateway_id: fixture.gateway_id,
        credential_id: fixture.credential_binding.credential_id,
        generation: fixture.credential_binding.generation,
      },
      evaluation_time_ms: "1721000000001",
      prepared_challenge: challenge,
      rate_limit_permits: false,
    },
  ]) {
    const denied = issueOrRetrySessionChallenge(fixture, context);
    assert.equal(denied.accepted, false);
    assert.equal(denied.challenge_to_publish, undefined);
    assert.equal(denied.persist_before_publish, false);
  }
});

test("a retry republishes the byte-identical persisted challenge", async () => {
  const request = await readJson(
    "fixtures/cloudlink/v1alpha1/session-challenge-request.valid.json",
  );
  const challenge = await readJson(
    "fixtures/cloudlink/v1alpha1/session-challenge.valid.json",
  );
  const first = issueOrRetrySessionChallenge(request, {
    commissioned_gateway: {
      gateway_id: request.gateway_id,
      credential_id: request.credential_binding.credential_id,
      generation: request.credential_binding.generation,
    },
    evaluation_time_ms: "1721000000001",
    prepared_challenge: challenge,
    rate_limit_permits: true,
  });
  assert.equal(first.accepted, true);
  assert.equal(first.persist_before_publish, true);

  const retry = issueOrRetrySessionChallenge(request, {
    commissioned_gateway: {
      gateway_id: request.gateway_id,
      credential_id: request.credential_binding.credential_id,
      generation: request.credential_binding.generation,
    },
    evaluation_time_ms: "1721000000002",
    persisted_challenge: first.persisted_challenge,
    prepared_challenge: {
      ...challenge,
      challenge_id: "99999999-9999-4999-8999-999999999999",
    },
    rate_limit_permits: true,
  });
  assert.equal(retry.accepted, true);
  assert.equal(retry.persist_before_publish, false);
  assert.deepEqual(retry.challenge_to_publish, first.challenge_to_publish);

  const changedRequest = structuredClone(request);
  changedRequest.client_nonce = "ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ";
  const conflictingRetry = issueOrRetrySessionChallenge(changedRequest, {
    commissioned_gateway: {
      gateway_id: request.gateway_id,
      credential_id: request.credential_binding.credential_id,
      generation: request.credential_binding.generation,
    },
    evaluation_time_ms: "1721000000003",
    persisted_challenge: first.persisted_challenge,
    prepared_challenge: {
      ...challenge,
      challenge_id: "99999999-9999-4999-8999-999999999999",
    },
    rate_limit_permits: true,
  });
  assert.equal(conflictingRetry.accepted, false);
  assert.equal(conflictingRetry.failure_code, "AUTHENTICATION_INVALID");
  assert.equal(conflictingRetry.challenge_to_publish, undefined);
  assert.equal(conflictingRetry.persisted_challenge, first.persisted_challenge);
});

test("session acceptance consumes one request-bound challenge atomically and the deadline is strict", async () => {
  const [request, hello, challenge] = await Promise.all([
    readJson(
      "fixtures/cloudlink/v1alpha1/session-challenge-request.valid.json",
    ),
    readJson("fixtures/cloudlink/v1alpha1/session-hello.valid.json"),
    readJson("fixtures/cloudlink/v1alpha1/session-challenge.valid.json"),
  ]);
  const challengeState = { challenge, request, consumed: false };

  const mismatchedHello = structuredClone(hello);
  mismatchedHello.client_nonce = "ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ";
  assert.deepEqual(
    acceptSessionHello(mismatchedHello, {
      challenge_state: challengeState,
      evaluation_time_ms: "1721000059999",
      gateway_signature_verified: true,
    }),
    {
      accepted: false,
      failure_code: "AUTHENTICATION_INVALID",
      challenge_consumed: false,
      session_acceptance_committed: false,
    },
  );
  assert.equal(challengeState.consumed, false);

  const accepted = acceptSessionHello(hello, {
    challenge_state: challengeState,
    evaluation_time_ms: "1721000059999",
    gateway_signature_verified: true,
  });
  assert.deepEqual(accepted, {
    accepted: true,
    challenge_consumed: true,
    session_acceptance_committed: true,
  });
  assert.equal(challengeState.consumed, true);

  assert.deepEqual(
    acceptSessionHello(hello, {
      challenge_state: challengeState,
      evaluation_time_ms: "1721000059999",
      gateway_signature_verified: true,
    }),
    {
      accepted: false,
      failure_code: "AUTHENTICATION_INVALID",
      challenge_consumed: false,
      session_acceptance_committed: false,
    },
  );

  assert.deepEqual(
    acceptSessionHello(hello, {
      challenge_state: { challenge, request, consumed: false },
      evaluation_time_ms: challenge.expires_at_ms,
      gateway_signature_verified: true,
    }),
    {
      accepted: false,
      failure_code: "MESSAGE_EXPIRED",
      challenge_consumed: false,
      session_acceptance_committed: false,
    },
  );
});
