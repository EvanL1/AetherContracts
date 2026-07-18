import {
  CONTRACT_FAILURE_CODES,
  type ContractFailureCode,
} from "./failure.js";

const maximumUint64 = 18_446_744_073_709_551_615n;
const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const semverPattern =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

export interface CloudLinkSessionContext {
  readonly credentialGeneration: string;
  readonly gatewayId: string;
  readonly sessionEpoch: string;
  readonly sessionId: string;
}

export interface CloudLinkFixtureContext {
  readonly currentSession?: CloudLinkSessionContext;
  readonly priorAcceptedDelivery?: string;
}

export type CloudLinkFixtureResult =
  | { readonly accepted: true; readonly failureCode?: never }
  | { readonly accepted: false; readonly failureCode: ContractFailureCode };

interface JsonRecord {
  readonly [key: string]: unknown;
  readonly aether_version?: unknown;
  readonly algorithm?: unknown;
  readonly batch_id?: unknown;
  readonly client_nonce?: unknown;
  readonly cloud_nonce?: unknown;
  readonly cloud_signature?: unknown;
  readonly credential_binding?: unknown;
  readonly credential_generation?: unknown;
  readonly cursors?: unknown;
  readonly delivery?: unknown;
  readonly digest?: unknown;
  readonly expires_at_ms?: unknown;
  readonly gateway_id?: unknown;
  readonly gateway_signature?: unknown;
  readonly key_id?: unknown;
  readonly manifest?: unknown;
  readonly message_kind?: unknown;
  readonly origin_model?: unknown;
  readonly payload?: unknown;
  readonly position?: unknown;
  readonly protocol_version?: unknown;
  readonly resume?: unknown;
  readonly session_epoch?: unknown;
  readonly session_id?: unknown;
  readonly signature?: unknown;
  readonly stream_epoch?: unknown;
  readonly stream_id?: unknown;
}

function rejected(failureCode: ContractFailureCode): CloudLinkFixtureResult {
  return { accepted: false, failureCode };
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidationResult(value: JsonRecord | CloudLinkFixtureResult): value is CloudLinkFixtureResult {
  return typeof value.accepted === "boolean";
}

function parseRecord(raw: string): JsonRecord | CloudLinkFixtureResult {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return rejected(CONTRACT_FAILURE_CODES.JSON_SYNTAX_ERROR);
  }
  return isRecord(value)
    ? value
    : rejected(CONTRACT_FAILURE_CODES.JSON_SYNTAX_ERROR);
}

function stringField(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function unknownField(
  record: JsonRecord,
  allowed: ReadonlySet<string>,
): CloudLinkFixtureResult | undefined {
  return Object.keys(record).some((key) => !allowed.has(key))
    ? rejected(CONTRACT_FAILURE_CODES.UNKNOWN_FIELD)
    : undefined;
}

function uint64Failure(value: unknown): ContractFailureCode | undefined {
  if (typeof value !== "string") {
    return CONTRACT_FAILURE_CODES.INTEGER_NON_CANONICAL;
  }
  if (new TextEncoder().encode(value).byteLength > 20) {
    return CONTRACT_FAILURE_CODES.INTEGER_OUT_OF_RANGE;
  }
  if (!/^(0|[1-9][0-9]*)$/u.test(value)) {
    return CONTRACT_FAILURE_CODES.INTEGER_NON_CANONICAL;
  }
  return BigInt(value) > maximumUint64
    ? CONTRACT_FAILURE_CODES.INTEGER_OUT_OF_RANGE
    : undefined;
}

function firstUint64Failure(
  record: JsonRecord,
  fields: readonly string[],
): ContractFailureCode | undefined {
  for (const field of fields) {
    const failure = uint64Failure(record[field]);
    if (failure !== undefined) {
      return failure;
    }
  }
  return undefined;
}

function signatureIsValid(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    unknownField(
      value,
      new Set(["algorithm", "key_id", "signature"]),
    ) === undefined &&
    value.algorithm === "Ed25519" &&
    typeof value.key_id === "string" &&
    /^[A-Za-z0-9_-]{86}$/u.test(String(value.signature))
  );
}

function cursorsConflict(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  const identities = new Set<string>();
  for (const cursor of value) {
    if (!isRecord(cursor)) {
      continue;
    }
    const identity = JSON.stringify([cursor.stream_id, cursor.stream_epoch]);
    if (identities.has(identity)) {
      return true;
    }
    identities.add(identity);
  }
  return false;
}

function staleSession(
  message: JsonRecord,
  current: CloudLinkSessionContext | undefined,
): boolean {
  return (
    current !== undefined &&
    (message.gateway_id !== current.gatewayId ||
      message.session_id !== current.sessionId ||
      message.session_epoch !== current.sessionEpoch ||
      message.credential_generation !== current.credentialGeneration)
  );
}

function replayIdentity(message: JsonRecord): readonly unknown[] | undefined {
  const delivery = message.delivery;
  return isRecord(delivery)
    ? [
        message.gateway_id,
        delivery.stream_id,
        delivery.stream_epoch,
        delivery.position,
      ]
    : undefined;
}

function arraysEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateDeliveryContext(
  message: JsonRecord,
  context: CloudLinkFixtureContext,
): CloudLinkFixtureResult | undefined {
  if (context.priorAcceptedDelivery === undefined) {
    return undefined;
  }
  const priorResult = parseRecord(context.priorAcceptedDelivery);
  if (!isValidationResult(priorResult)) {
    const candidateIdentity = replayIdentity(message);
    const priorIdentity = replayIdentity(priorResult);
    if (
      candidateIdentity !== undefined &&
      priorIdentity !== undefined &&
      arraysEqual(candidateIdentity, priorIdentity)
    ) {
      const delivery = message.delivery;
      const priorDelivery = priorResult.delivery;
      if (isRecord(delivery) && isRecord(priorDelivery)) {
        const payloadMatches =
          JSON.stringify(message.payload) === JSON.stringify(priorResult.payload);
        if (
          (delivery.digest === priorDelivery.digest && !payloadMatches) ||
          (delivery.digest !== priorDelivery.digest && payloadMatches)
        ) {
          return rejected(CONTRACT_FAILURE_CODES.DIGEST_MISMATCH);
        }
        if (
          delivery.digest !== priorDelivery.digest ||
          delivery.batch_id !== priorDelivery.batch_id
        ) {
          return rejected(CONTRACT_FAILURE_CODES.DIGEST_CONFLICT);
        }
      }
    }
  }
  return undefined;
}

function validateSessionHello(message: JsonRecord): CloudLinkFixtureResult {
  const unknown = unknownField(
    message,
    new Set([
      "challenge_id",
      "client_nonce",
      "credential_binding",
      "gateway_id",
      "gateway_key_id",
      "gateway_signature",
      "message_kind",
      "offered_protocol_versions",
      "protocol",
      "resume",
      "schema",
    ]),
  );
  if (unknown !== undefined) {
    return unknown;
  }
  if (!/^[A-Za-z0-9_-]{43}$/u.test(String(message.client_nonce))) {
    return rejected(CONTRACT_FAILURE_CODES.FIELD_BOUND);
  }
  const binding = message.credential_binding;
  if (!isRecord(binding)) {
    return rejected(CONTRACT_FAILURE_CODES.UNKNOWN_FIELD);
  }
  if (binding.origin_model === "gateway-signed") {
    if (message.gateway_signature === undefined) {
      return rejected(CONTRACT_FAILURE_CODES.AUTHENTICATION_REQUIRED);
    }
    if (!signatureIsValid(message.gateway_signature)) {
      return rejected(CONTRACT_FAILURE_CODES.AUTHENTICATION_INVALID);
    }
  } else if (binding.origin_model !== "trusted-connector-broker-attestation") {
    return rejected(CONTRACT_FAILURE_CODES.UNKNOWN_FIELD);
  }
  return cursorsConflict(message.resume)
    ? rejected(CONTRACT_FAILURE_CODES.CURSOR_CONFLICT)
    : { accepted: true };
}

function validateSessionChallengeRequest(message: JsonRecord): CloudLinkFixtureResult {
  const unknown = unknownField(
    message,
    new Set([
      "client_nonce",
      "credential_binding",
      "gateway_id",
      "message_kind",
      "offered_protocol_versions",
      "protocol",
      "resume",
      "schema",
    ]),
  );
  if (unknown !== undefined) {
    return unknown;
  }
  if (!/^[A-Za-z0-9_-]{43}$/u.test(String(message.client_nonce))) {
    return rejected(CONTRACT_FAILURE_CODES.FIELD_BOUND);
  }
  const binding = message.credential_binding;
  if (!isRecord(binding)) {
    return rejected(CONTRACT_FAILURE_CODES.UNKNOWN_FIELD);
  }
  const bindingUnknown = unknownField(
    binding,
    new Set(["credential_id", "generation"]),
  );
  if (bindingUnknown !== undefined) {
    return bindingUnknown;
  }
  const generationFailure = uint64Failure(binding["generation"]);
  if (generationFailure !== undefined) {
    return rejected(generationFailure);
  }
  return cursorsConflict(message.resume)
    ? rejected(CONTRACT_FAILURE_CODES.CURSOR_CONFLICT)
    : { accepted: true };
}

function validateSessionChallenge(message: JsonRecord): CloudLinkFixtureResult {
  const unknown = unknownField(
    message,
    new Set([
      "challenge_id",
      "cloud_nonce",
      "cloud_signature",
      "expires_at_ms",
      "gateway_id",
      "issued_at_ms",
      "message_kind",
      "protocol",
      "schema",
    ]),
  );
  if (unknown !== undefined) {
    return unknown;
  }
  const failure = firstUint64Failure(message, ["issued_at_ms", "expires_at_ms"]);
  if (failure !== undefined) {
    return rejected(failure);
  }
  return /^[A-Za-z0-9_-]{43}$/u.test(String(message.cloud_nonce)) &&
    signatureIsValid(message.cloud_signature)
    ? { accepted: true }
    : rejected(CONTRACT_FAILURE_CODES.FIELD_BOUND);
}

function validateHeartbeat(
  message: JsonRecord,
  context: CloudLinkFixtureContext,
): CloudLinkFixtureResult {
  const unknown = unknownField(
    message,
    new Set([
      "credential_generation",
      "cursors",
      "gateway_id",
      "message_authentication",
      "message_kind",
      "observed_at_ms",
      "protocol",
      "protocol_version",
      "schema",
      "session_epoch",
      "session_id",
    ]),
  );
  if (unknown !== undefined) {
    return unknown;
  }
  if (message.protocol_version !== "1.0") {
    return rejected(CONTRACT_FAILURE_CODES.UNSUPPORTED_VERSION);
  }
  const failure = firstUint64Failure(message, [
    "session_epoch",
    "credential_generation",
    "observed_at_ms",
  ]);
  if (failure !== undefined) {
    return rejected(failure);
  }
  if (Array.isArray(message.cursors)) {
    for (const cursor of message.cursors) {
      if (isRecord(cursor)) {
        const cursorFailure = firstUint64Failure(cursor, [
          "stream_epoch",
          "acknowledged_position",
        ]);
        if (cursorFailure !== undefined) {
          return rejected(cursorFailure);
        }
      }
    }
  }
  if (staleSession(message, context.currentSession)) {
    return rejected(CONTRACT_FAILURE_CODES.STALE_SESSION);
  }
  return cursorsConflict(message.cursors)
    ? rejected(CONTRACT_FAILURE_CODES.CURSOR_CONFLICT)
    : { accepted: true };
}

function validateDurableAck(
  message: JsonRecord,
  context: CloudLinkFixtureContext,
): CloudLinkFixtureResult {
  if (!digestPattern.test(String(message.digest))) {
    return rejected(CONTRACT_FAILURE_CODES.INVALID_DIGEST);
  }
  const failure = firstUint64Failure(message, [
    "session_epoch",
    "credential_generation",
    "stream_epoch",
    "acknowledged_position",
    "acknowledged_at_ms",
  ]);
  if (failure !== undefined) {
    return rejected(failure);
  }
  return staleSession(message, context.currentSession)
    ? rejected(CONTRACT_FAILURE_CODES.STALE_SESSION)
    : { accepted: true };
}

function validateSessionAccepted(message: JsonRecord): CloudLinkFixtureResult {
  const failure = firstUint64Failure(message, [
    "session_epoch",
    "credential_generation",
    "server_time_ms",
    "heartbeat_interval_ms",
  ]);
  if (failure !== undefined) {
    return rejected(failure);
  }
  return cursorsConflict(message.resume)
    ? rejected(CONTRACT_FAILURE_CODES.CURSOR_CONFLICT)
    : { accepted: true };
}

function validateEnvelope(
  message: JsonRecord,
  context: CloudLinkFixtureContext,
): CloudLinkFixtureResult {
  const unknown = unknownField(
    message,
    new Set([
      "credential_generation",
      "delivery",
      "expires_at_ms",
      "gateway_id",
      "message_authentication",
      "message_kind",
      "payload",
      "protocol",
      "protocol_version",
      "schema",
      "sent_at_ms",
      "session_epoch",
      "session_id",
      "traceparent",
    ]),
  );
  if (unknown !== undefined) {
    return unknown;
  }
  if (message.protocol_version !== "1.0") {
    return rejected(CONTRACT_FAILURE_CODES.UNSUPPORTED_VERSION);
  }
  const failure = firstUint64Failure(message, [
    "session_epoch",
    "credential_generation",
    "sent_at_ms",
    ...(message.expires_at_ms === undefined ? [] : ["expires_at_ms"]),
  ]);
  if (failure !== undefined) {
    return rejected(failure);
  }
  const delivery = message.delivery;
  if (!isRecord(delivery)) {
    return rejected(CONTRACT_FAILURE_CODES.UNKNOWN_FIELD);
  }
  const deliveryFailure = firstUint64Failure(delivery, ["stream_epoch", "position"]);
  if (deliveryFailure !== undefined) {
    return rejected(deliveryFailure);
  }
  if (!digestPattern.test(String(delivery.digest))) {
    return rejected(CONTRACT_FAILURE_CODES.INVALID_DIGEST);
  }
  if (message.message_kind === "runtime-manifest-report") {
    const payload = message.payload;
    const manifest = isRecord(payload) ? payload.manifest : undefined;
    if (
      !isRecord(manifest) ||
      !semverPattern.test(String(manifest.aether_version))
    ) {
      return rejected(CONTRACT_FAILURE_CODES.SEMVER_INVALID);
    }
  }
  const contextual = validateDeliveryContext(message, context);
  if (contextual !== undefined) {
    return contextual;
  }
  return staleSession(message, context.currentSession)
    ? rejected(CONTRACT_FAILURE_CODES.STALE_SESSION)
    : { accepted: true };
}

/**
 * Executes the published CloudLink alpha fixture surface.
 *
 * This experimental binding deliberately reports only the stable contractual
 * code. It does not claim production authentication or persistence.
 */
export function validateCloudLinkFixture(
  raw: string,
  context: CloudLinkFixtureContext = {},
): CloudLinkFixtureResult {
  const parsed = parseRecord(raw);
  if (isValidationResult(parsed)) {
    return parsed;
  }
  const kind = stringField(parsed, "message_kind");
  switch (kind) {
    case "session-challenge-request":
      return validateSessionChallengeRequest(parsed);
    case "session-hello":
      return validateSessionHello(parsed);
    case "session-challenge":
      return validateSessionChallenge(parsed);
    case "session-accepted":
      return validateSessionAccepted(parsed);
    case "heartbeat":
    case "heartbeat-ack":
      return validateHeartbeat(parsed, context);
    case "durable-ack":
      return validateDurableAck(parsed, context);
    case "replay-request":
      return { accepted: true };
    case "runtime-manifest-report":
    case "telemetry-batch":
    case "data-loss":
      return validateEnvelope(parsed, context);
    default:
      return rejected(CONTRACT_FAILURE_CODES.UNSUPPORTED_VERSION);
  }
}
