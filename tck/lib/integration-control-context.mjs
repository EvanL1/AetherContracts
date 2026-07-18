import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const supportedEntityKinds = new Set(["fan", "light", "switch"]);
const sessionFields = [
  "gateway_id",
  "session_id",
  "session_epoch",
  "credential_generation",
];
const maximumUint64 = 18_446_744_073_709_551_615n;
const canonicalUint64 = /^(0|[1-9][0-9]*)$/u;

function canonicalJson(value) {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("RFC 8785 canonical JSON requires finite numbers");
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("Integration Control digest input is not JSON");
}

function explicitUint64(value, field) {
  if (
    typeof value !== "string" ||
    !canonicalUint64.test(value) ||
    BigInt(value) > maximumUint64
  ) {
    throw new TypeError(`${field} must be a canonical uint64`);
  }
  return BigInt(value);
}

function rejection(failureCode) {
  return {
    accepted: false,
    failure_code: failureCode,
    state_changed: false,
    execution_permitted: false,
  };
}

export function integrationActionIntentDigest(intent) {
  return `sha256:${createHash("sha256")
    .update(canonicalJson(intent), "utf8")
    .digest("hex")}`;
}

export function evaluateIntegrationActionOfferContext(
  offer,
  {
    currentSession,
    evaluationTimeMs,
    topology,
    extensionEnabled = false,
    cloudAuthenticationVerified = false,
    confirmationVerified = false,
    localPolicyAuthorized = false,
    priorAcceptedOffer,
  } = {},
) {
  if (!extensionEnabled || !localPolicyAuthorized || !confirmationVerified) {
    return rejection("CAPABILITY_DENIED");
  }
  if (!cloudAuthenticationVerified) {
    return rejection("AUTHENTICATION_INVALID");
  }
  if (
    currentSession === null ||
    typeof currentSession !== "object" ||
    sessionFields.some((field) => offer[field] !== currentSession[field])
  ) {
    return rejection("STALE_SESSION");
  }

  const issuedAt = explicitUint64(offer.issued_at_ms, "issued_at_ms");
  const expiresAt = explicitUint64(offer.expires_at_ms, "expires_at_ms");
  if (expiresAt < issuedAt) {
    return rejection("INVALID_EXPIRY_WINDOW");
  }
  if (
    explicitUint64(evaluationTimeMs, "evaluation_time_ms") >= expiresAt
  ) {
    return rejection("MESSAGE_EXPIRED");
  }

  if (integrationActionIntentDigest(offer.intent) !== offer.intent_digest) {
    return rejection("DIGEST_MISMATCH");
  }

  if (
    priorAcceptedOffer !== undefined &&
    priorAcceptedOffer.gateway_id === offer.gateway_id &&
    priorAcceptedOffer.job_id === offer.job_id
  ) {
    if (priorAcceptedOffer.intent_digest !== offer.intent_digest) {
      return rejection("DIGEST_CONFLICT");
    }
    return {
      accepted: true,
      state_changed: false,
      execution_permitted: false,
      receipt_replay_required: true,
    };
  }

  const target = offer.intent.target;
  if (
    topology === null ||
    typeof topology !== "object" ||
    target.integration_id !== topology.integration_id
  ) {
    return rejection("REFERENCE_NOT_FOUND");
  }
  const targetGeneration = explicitUint64(
    target.snapshot_generation,
    "intent.target.snapshot_generation",
  );
  const topologyGeneration = explicitUint64(
    topology.snapshot_generation,
    "topology.snapshot_generation",
  );
  if (targetGeneration < topologyGeneration) {
    return rejection("TOPOLOGY_GENERATION_STALE");
  }
  if (targetGeneration > topologyGeneration) {
    return rejection("REFERENCE_NOT_FOUND");
  }

  const entity = topology.entities?.find(
    (candidate) => candidate.entity_id === target.entity_id,
  );
  if (entity === undefined) {
    return rejection("REFERENCE_NOT_FOUND");
  }
  const point = entity.points?.find(
    (candidate) => candidate.point_key === target.point_key,
  );
  if (point === undefined) {
    return rejection("REFERENCE_NOT_FOUND");
  }
  if (
    offer.intent.capability_id !== "device.power.set.v1" ||
    target.point_key !== "is_on" ||
    !supportedEntityKinds.has(entity.entity_kind) ||
    point.kind !== "status" ||
    point.value_type !== "boolean"
  ) {
    return rejection("CAPABILITY_DENIED");
  }

  return {
    accepted: true,
    state_changed: true,
    execution_permitted: true,
    edge_final_decision_required: true,
  };
}

export function evaluateIntegrationActionReceiptContext(receipt, offer) {
  const payload = receipt?.payload;
  if (
    payload === null ||
    typeof payload !== "object" ||
    receipt.gateway_id !== offer.gateway_id ||
    payload.job_id !== offer.job_id ||
    payload.capability_id !== offer.intent.capability_id ||
    payload.intent_digest !== offer.intent_digest ||
    !isDeepStrictEqual(payload.target, offer.intent.target)
  ) {
    return {
      accepted: false,
      failure_code: "DIGEST_CONFLICT",
      provider_accepted: false,
      physical_completed: false,
      job_succeeded: false,
    };
  }
  if (
    payload.physical_outcome !== "unknown" ||
    !new Set([
      "edge-accepted",
      "edge-rejected",
      "provider-accepted",
      "provider-rejected",
      "unknown",
    ]).has(payload.stage)
  ) {
    return {
      accepted: false,
      failure_code: "PHYSICAL_OUTCOME_UNPROVEN",
      provider_accepted: false,
      physical_completed: false,
      job_succeeded: false,
    };
  }
  return {
    accepted: true,
    provider_accepted: payload.stage === "provider-accepted",
    physical_completed: false,
    job_succeeded: false,
  };
}
