import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const canonicalUint64 = /^(0|[1-9][0-9]*)$/u;
const maximumUint64 = 18_446_744_073_709_551_615n;
const signingDigest = /^sha256:[0-9a-f]{64}$/u;
const signatureEncoding = /^[A-Za-z0-9_-]{86}$/u;

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("RFC 8785 canonical JSON requires finite numbers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (typeof value === "object" && value !== undefined) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  throw new TypeError("RFC 8785 canonical JSON cannot encode this value");
}

function parseUint64(value, field) {
  if (
    typeof value !== "string" ||
    !canonicalUint64.test(value) ||
    BigInt(value) > maximumUint64
  ) {
    throw new TypeError(`${field} must be a canonical uint64`);
  }
  return BigInt(value);
}

function requiredString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value;
}

function checkedAdd(left, right) {
  return left > maximumUint64 - right ? undefined : left + right;
}

function checkedMultiply(value, factor) {
  return value > maximumUint64 / factor ? undefined : value * factor;
}

function isHeartbeat(message) {
  return message?.message_kind === "heartbeat";
}

/**
 * Language-neutral reference projection for the experimental gateway-signed
 * per-uplink profile. It deliberately excludes message_authentication itself.
 */
export function projectUplinkSigningObject(message) {
  if (typeof message !== "object" || message === null) {
    throw new TypeError("CloudLink uplink must be an object");
  }
  const common = {
    schema: "aether.cloudlink.uplink-signing.v1alpha1",
    gateway_id: requiredString(message.gateway_id, "gateway_id"),
    credential_generation: requiredString(
      message.credential_generation,
      "credential_generation",
    ),
    session_id: requiredString(message.session_id, "session_id"),
    session_epoch: requiredString(message.session_epoch, "session_epoch"),
    message_kind: requiredString(message.message_kind, "message_kind"),
  };
  if (isHeartbeat(message)) {
    return {
      ...common,
      sent_at_ms: requiredString(message.observed_at_ms, "observed_at_ms"),
      expires_at_ms: null,
      stream_id: null,
      stream_epoch: null,
      position: null,
      batch_id: null,
      business_digest: null,
    };
  }
  const delivery = message.delivery;
  if (typeof delivery !== "object" || delivery === null) {
    throw new TypeError(
      "CloudLink signed delivery must carry a delivery object",
    );
  }
  return {
    ...common,
    sent_at_ms: requiredString(message.sent_at_ms, "sent_at_ms"),
    expires_at_ms:
      message.expires_at_ms === undefined
        ? null
        : requiredString(message.expires_at_ms, "expires_at_ms"),
    stream_id: requiredString(delivery.stream_id, "delivery.stream_id"),
    stream_epoch: requiredString(
      delivery.stream_epoch,
      "delivery.stream_epoch",
    ),
    position: requiredString(delivery.position, "delivery.position"),
    batch_id: requiredString(delivery.batch_id, "delivery.batch_id"),
    business_digest: requiredString(delivery.digest, "delivery.digest"),
  };
}

export function digestUplinkSigningObject(signingObject) {
  return `sha256:${createHash("sha256")
    .update(canonicalJson(signingObject), "utf8")
    .digest("hex")}`;
}

/**
 * Session-independent replay projection for a durable delivery. This is
 * application state, not a new wire object.
 */
export function projectImmutableDeliveryReplayObject(message) {
  const signingObject = projectUplinkSigningObject(message);
  if (
    signingObject.stream_id === null ||
    signingObject.stream_epoch === null ||
    signingObject.position === null ||
    signingObject.batch_id === null ||
    signingObject.business_digest === null
  ) {
    throw new TypeError(
      "immutable delivery replay projection requires a delivery",
    );
  }
  return {
    schema: "aether.cloudlink.immutable-delivery-replay.v1alpha1",
    gateway_id: signingObject.gateway_id,
    credential_generation: signingObject.credential_generation,
    message_kind: signingObject.message_kind,
    sent_at_ms: signingObject.sent_at_ms,
    expires_at_ms: signingObject.expires_at_ms,
    stream_id: signingObject.stream_id,
    stream_epoch: signingObject.stream_epoch,
    position: signingObject.position,
    batch_id: signingObject.batch_id,
    business_digest: signingObject.business_digest,
  };
}

function gatewaySignedContextMatches(message, context) {
  const authentication = message?.message_authentication;
  const session = context?.accepted_session;
  return (
    context?.gateway_signature_verified === true &&
    context?.gateway_key_active === true &&
    context?.accepted_session_active === true &&
    context?.broker_principal_authorized === true &&
    typeof authentication === "object" &&
    authentication !== null &&
    authentication.algorithm === "Ed25519" &&
    typeof authentication.signature === "string" &&
    signatureEncoding.test(authentication.signature) &&
    typeof session === "object" &&
    session !== null &&
    typeof session.authorization_namespace === "string" &&
    session.authorization_namespace.length > 0 &&
    context.received_authorization_namespace ===
      session.authorization_namespace &&
    authentication.key_id === session.gateway_key_id &&
    message.gateway_id === session.gateway_id &&
    message.session_id === session.session_id &&
    message.session_epoch === session.session_epoch &&
    message.credential_generation === session.credential_generation
  );
}

function rejectedHeartbeat(failureCode, replayState) {
  return {
    accepted: false,
    replayed: false,
    refresh_server_liveness: false,
    failure_code: failureCode,
    next_heartbeat_replay_state: replayState,
  };
}

/**
 * Contextual heartbeat acceptance. evaluation_time_ms and the accepted
 * session's heartbeat_interval_ms are explicit inputs; no ambient clock is
 * consulted.
 */
export function acceptGatewaySignedHeartbeat(heartbeat, context) {
  const replayState = context?.heartbeat_replay_state;
  if (!gatewaySignedContextMatches(heartbeat, context)) {
    return rejectedHeartbeat("AUTHENTICATION_INVALID", replayState);
  }

  let observedAt;
  let evaluationTime;
  let heartbeatInterval;
  try {
    observedAt = parseUint64(heartbeat.observed_at_ms, "observed_at_ms");
    evaluationTime = parseUint64(
      context.evaluation_time_ms,
      "evaluation_time_ms",
    );
    heartbeatInterval = parseUint64(
      context.accepted_session.heartbeat_interval_ms,
      "heartbeat_interval_ms",
    );
  } catch {
    return rejectedHeartbeat("AUTHENTICATION_INVALID", replayState);
  }
  if (heartbeatInterval === 0n) {
    return rejectedHeartbeat("AUTHENTICATION_INVALID", replayState);
  }

  const futureBoundary = checkedAdd(evaluationTime, heartbeatInterval);
  const staleWidth = checkedMultiply(heartbeatInterval, 3n);
  const staleBoundary =
    staleWidth === undefined ? undefined : checkedAdd(observedAt, staleWidth);
  if (futureBoundary === undefined || staleBoundary === undefined) {
    return rejectedHeartbeat("AUTHENTICATION_INVALID", replayState);
  }
  if (observedAt > futureBoundary) {
    return rejectedHeartbeat("AUTHENTICATION_INVALID", replayState);
  }
  if (evaluationTime >= staleBoundary) {
    return rejectedHeartbeat("MESSAGE_EXPIRED", replayState);
  }

  let projection;
  let digest;
  try {
    projection = projectUplinkSigningObject(heartbeat);
    digest = digestUplinkSigningObject(projection);
  } catch {
    return rejectedHeartbeat("AUTHENTICATION_INVALID", replayState);
  }

  if (replayState !== undefined) {
    let highestObservedAt;
    try {
      highestObservedAt = parseUint64(
        replayState.highest_accepted_observed_at_ms,
        "highest_accepted_observed_at_ms",
      );
    } catch {
      return rejectedHeartbeat("AUTHENTICATION_INVALID", replayState);
    }
    if (!signingDigest.test(replayState.exact_signing_object_digest)) {
      return rejectedHeartbeat("AUTHENTICATION_INVALID", replayState);
    }
    if (observedAt < highestObservedAt) {
      return rejectedHeartbeat("AUTHENTICATION_INVALID", replayState);
    }
    if (observedAt === highestObservedAt) {
      if (digest !== replayState.exact_signing_object_digest) {
        return rejectedHeartbeat("AUTHENTICATION_INVALID", replayState);
      }
      return {
        accepted: true,
        replayed: true,
        refresh_server_liveness: false,
        next_heartbeat_replay_state: replayState,
      };
    }
  }

  return {
    accepted: true,
    replayed: false,
    refresh_server_liveness: true,
    next_heartbeat_replay_state: {
      highest_accepted_observed_at_ms: heartbeat.observed_at_ms,
      exact_signing_object_digest: digest,
    },
  };
}

function deliveryIdentity(signingObject) {
  return {
    gateway_id: signingObject.gateway_id,
    stream_id: signingObject.stream_id,
    stream_epoch: signingObject.stream_epoch,
    position: signingObject.position,
  };
}

function rejectedDelivery(failureCode, committedDelivery) {
  return {
    accepted: false,
    replayed: false,
    session_rebound: false,
    apply_business_effect: false,
    failure_code: failureCode,
    next_committed_delivery: committedDelivery,
  };
}

/**
 * Reference replay reducer for one delivery identity.
 *
 * context.committed_delivery is valid input only after the business effect and
 * replay record were atomically committed. A pending authentication record is
 * not committed delivery state and cannot bypass first-acceptance expiry.
 * The caller must query committed state inside the already verified
 * authorization namespace; that partition comes from trusted ingress context,
 * never from the payload.
 * next_committed_delivery is the proposed post-transaction state; this pure
 * reducer does not itself persist it or authorize a receipt before commit.
 */
export function acceptGatewaySignedDelivery(message, context) {
  const committed = context?.committed_delivery;
  if (!gatewaySignedContextMatches(message, context)) {
    return rejectedDelivery("AUTHENTICATION_INVALID", committed);
  }

  let projection;
  let exactSigningObjectDigest;
  let immutableDeliveryDigest;
  try {
    projection = projectUplinkSigningObject(message);
    exactSigningObjectDigest = digestUplinkSigningObject(projection);
    immutableDeliveryDigest = digestUplinkSigningObject(
      projectImmutableDeliveryReplayObject(message),
    );
  } catch {
    return rejectedDelivery("AUTHENTICATION_INVALID", committed);
  }

  const identity = deliveryIdentity(projection);
  if (committed !== undefined) {
    const binding = committed.current_session_binding;
    if (
      committed.authorization_namespace_partition !==
        context.received_authorization_namespace ||
      !isDeepStrictEqual(committed.replay_identity, identity) ||
      !signingDigest.test(committed.immutable_delivery_digest) ||
      typeof binding !== "object" ||
      binding === null ||
      typeof binding.session_id !== "string" ||
      binding.session_id.length === 0 ||
      !signingDigest.test(binding.exact_signing_object_digest)
    ) {
      return rejectedDelivery("AUTHENTICATION_INVALID", committed);
    }
    if (committed.immutable_delivery_digest !== immutableDeliveryDigest) {
      return rejectedDelivery("AUTHENTICATION_INVALID", committed);
    }

    let candidateSessionEpoch;
    let boundSessionEpoch;
    try {
      candidateSessionEpoch = parseUint64(
        projection.session_epoch,
        "session_epoch",
      );
      boundSessionEpoch = parseUint64(
        binding.session_epoch,
        "current_session_binding.session_epoch",
      );
    } catch {
      return rejectedDelivery("AUTHENTICATION_INVALID", committed);
    }

    if (candidateSessionEpoch < boundSessionEpoch) {
      return rejectedDelivery("AUTHENTICATION_INVALID", committed);
    }
    if (candidateSessionEpoch === boundSessionEpoch) {
      if (
        projection.session_id !== binding.session_id ||
        exactSigningObjectDigest !== binding.exact_signing_object_digest
      ) {
        return rejectedDelivery("AUTHENTICATION_INVALID", committed);
      }
      return {
        accepted: true,
        replayed: true,
        session_rebound: false,
        apply_business_effect: false,
        next_committed_delivery: committed,
      };
    }

    return {
      accepted: true,
      replayed: true,
      session_rebound: true,
      apply_business_effect: false,
      next_committed_delivery: {
        authorization_namespace_partition:
          context.received_authorization_namespace,
        replay_identity: identity,
        immutable_delivery_digest: immutableDeliveryDigest,
        current_session_binding: {
          session_id: projection.session_id,
          session_epoch: projection.session_epoch,
          exact_signing_object_digest: exactSigningObjectDigest,
        },
      },
    };
  }

  try {
    const evaluationTime = parseUint64(
      context.evaluation_time_ms,
      "evaluation_time_ms",
    );
    if (
      projection.expires_at_ms !== null &&
      evaluationTime >= parseUint64(projection.expires_at_ms, "expires_at_ms")
    ) {
      return rejectedDelivery("MESSAGE_EXPIRED", committed);
    }
  } catch {
    return rejectedDelivery("AUTHENTICATION_INVALID", committed);
  }

  return {
    accepted: true,
    replayed: false,
    session_rebound: false,
    apply_business_effect: true,
    next_committed_delivery: {
      authorization_namespace_partition:
        context.received_authorization_namespace,
      replay_identity: identity,
      immutable_delivery_digest: immutableDeliveryDigest,
      current_session_binding: {
        session_id: projection.session_id,
        session_epoch: projection.session_epoch,
        exact_signing_object_digest: exactSigningObjectDigest,
      },
    },
  };
}

function rejected(failureCode) {
  return {
    accepted: false,
    failure_code: failureCode,
    challenge_consumed: false,
    session_acceptance_committed: false,
  };
}

function beforeDeadline(evaluationTimeMs, challenge) {
  const issuedAt = BigInt(challenge.issued_at_ms);
  const expiresAt = BigInt(challenge.expires_at_ms);
  const evaluationTime = BigInt(evaluationTimeMs);
  if (expiresAt < issuedAt) {
    return { accepted: false, failure_code: "INVALID_EXPIRY_WINDOW" };
  }
  return evaluationTime < expiresAt
    ? { accepted: true }
    : { accepted: false, failure_code: "MESSAGE_EXPIRED" };
}

function commissionedBindingMatches(request, commissionedGateway) {
  return (
    commissionedGateway !== undefined &&
    commissionedGateway.gateway_id === request.gateway_id &&
    commissionedGateway.credential_id ===
      request.credential_binding.credential_id &&
    commissionedGateway.generation === request.credential_binding.generation
  );
}

function persistedBindingMatches(request, persisted) {
  return (
    persisted !== undefined &&
    persisted.gateway_id === request.gateway_id &&
    persisted.credential_id === request.credential_binding.credential_id &&
    persisted.generation === request.credential_binding.generation &&
    isDeepStrictEqual(persisted.request, request)
  );
}

function helloMatchesRequest(hello, request) {
  return (
    request !== undefined &&
    hello.gateway_id === request.gateway_id &&
    hello.credential_binding?.credential_id ===
      request.credential_binding.credential_id &&
    hello.credential_binding?.generation ===
      request.credential_binding.generation &&
    hello.client_nonce === request.client_nonce &&
    isDeepStrictEqual(
      hello.offered_protocol_versions,
      request.offered_protocol_versions,
    ) &&
    isDeepStrictEqual(hello.resume, request.resume)
  );
}

/**
 * Reference state transition for the experimental challenge-request profile.
 * The returned persistence object is application state, never a wire field.
 */
export function issueOrRetrySessionChallenge(request, context) {
  if (
    context.rate_limit_permits !== true ||
    !commissionedBindingMatches(request, context.commissioned_gateway)
  ) {
    return {
      accepted: false,
      failure_code: "AUTHENTICATION_REQUIRED",
      challenge_to_publish: undefined,
      persist_before_publish: false,
      persisted_challenge: context.persisted_challenge,
    };
  }

  const persisted = context.persisted_challenge;
  if (
    persisted !== undefined &&
    beforeDeadline(context.evaluation_time_ms, persisted.challenge).accepted
  ) {
    if (persistedBindingMatches(request, persisted)) {
      return {
        accepted: true,
        challenge_to_publish: persisted.challenge,
        persist_before_publish: false,
        persisted_challenge: persisted,
      };
    }
    return {
      accepted: false,
      failure_code: "AUTHENTICATION_INVALID",
      challenge_to_publish: undefined,
      persist_before_publish: false,
      persisted_challenge: persisted,
    };
  }

  const challenge = context.prepared_challenge;
  if (challenge?.gateway_id !== request.gateway_id) {
    return {
      accepted: false,
      failure_code: "AUTHENTICATION_INVALID",
      challenge_to_publish: undefined,
      persist_before_publish: false,
      persisted_challenge: persisted,
    };
  }
  const challengeDeadline = beforeDeadline(
    context.evaluation_time_ms,
    challenge,
  );
  if (!challengeDeadline.accepted) {
    return {
      accepted: false,
      failure_code: challengeDeadline.failure_code,
      challenge_to_publish: undefined,
      persist_before_publish: false,
      persisted_challenge: persisted,
    };
  }

  const next = {
    challenge,
    request,
    gateway_id: request.gateway_id,
    credential_id: request.credential_binding.credential_id,
    generation: request.credential_binding.generation,
    consumed: false,
  };
  return {
    accepted: true,
    challenge_to_publish: challenge,
    persist_before_publish: true,
    persisted_challenge: next,
  };
}

/**
 * Reference atomic transition: a successful session commit and challenge
 * consumption are represented by one indivisible state change.
 */
export function acceptSessionHello(hello, context) {
  const state = context.challenge_state;
  const challenge = state?.challenge;
  if (
    state?.consumed !== false ||
    challenge?.gateway_id !== hello.gateway_id ||
    challenge?.challenge_id !== hello.challenge_id ||
    !helloMatchesRequest(hello, state?.request) ||
    context.gateway_signature_verified !== true
  ) {
    return rejected("AUTHENTICATION_INVALID");
  }
  const deadline = beforeDeadline(context.evaluation_time_ms, challenge);
  if (!deadline.accepted) {
    return rejected(deadline.failure_code);
  }

  state.consumed = true;
  return {
    accepted: true,
    challenge_consumed: true,
    session_acceptance_committed: true,
  };
}
