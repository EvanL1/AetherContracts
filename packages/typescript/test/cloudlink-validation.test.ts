import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTRACT_FAILURE_CODES,
  type ContractFailureCode,
  validateCloudLinkFixture,
} from "../src/index.js";

interface RejectionCase {
  readonly expected: ContractFailureCode;
  readonly name: string;
  readonly value: string | Readonly<Record<string, unknown>>;
}

const validNonce = "n".repeat(43);
const validDigest = `sha256:${"a".repeat(64)}`;

const validChallengeRequest = {
  client_nonce: validNonce,
  credential_binding: {
    credential_id: "gateway-credential",
    generation: "3",
  },
  message_kind: "session-challenge-request",
} as const;

const validEnvelope = {
  credential_generation: "3",
  delivery: {
    batch_id: "11111111-1111-4111-8111-111111111111",
    digest: validDigest,
    position: "1",
    stream_epoch: "1",
    stream_id: "telemetry",
  },
  message_kind: "telemetry-batch",
  payload: {},
  protocol_version: "1.0",
  sent_at_ms: "1",
  session_epoch: "7",
} as const;

const rejectionCases: readonly RejectionCase[] = [
  {
    expected: CONTRACT_FAILURE_CODES.JSON_SYNTAX_ERROR,
    name: "malformed JSON",
    value: "{",
  },
  {
    expected: CONTRACT_FAILURE_CODES.JSON_SYNTAX_ERROR,
    name: "a non-object JSON root",
    value: "[]",
  },
  {
    expected: CONTRACT_FAILURE_CODES.UNSUPPORTED_VERSION,
    name: "an unknown message kind",
    value: { message_kind: "unknown" },
  },
  {
    expected: CONTRACT_FAILURE_CODES.FIELD_BOUND,
    name: "an invalid challenge-request nonce",
    value: { ...validChallengeRequest, client_nonce: "short" },
  },
  {
    expected: CONTRACT_FAILURE_CODES.UNKNOWN_FIELD,
    name: "a non-object challenge-request credential binding",
    value: { ...validChallengeRequest, credential_binding: null },
  },
  {
    expected: CONTRACT_FAILURE_CODES.UNKNOWN_FIELD,
    name: "an unknown challenge-request credential field",
    value: {
      ...validChallengeRequest,
      credential_binding: {
        ...validChallengeRequest.credential_binding,
        secret: "must-not-cross-the-boundary",
      },
    },
  },
  {
    expected: CONTRACT_FAILURE_CODES.INTEGER_NON_CANONICAL,
    name: "a non-string credential generation",
    value: {
      ...validChallengeRequest,
      credential_binding: {
        ...validChallengeRequest.credential_binding,
        generation: 3,
      },
    },
  },
  {
    expected: CONTRACT_FAILURE_CODES.INTEGER_OUT_OF_RANGE,
    name: "an overlong credential generation",
    value: {
      ...validChallengeRequest,
      credential_binding: {
        ...validChallengeRequest.credential_binding,
        generation: "184467440737095516150",
      },
    },
  },
  {
    expected: CONTRACT_FAILURE_CODES.AUTHENTICATION_INVALID,
    name: "a non-object gateway signature",
    value: {
      client_nonce: validNonce,
      credential_binding: { origin_model: "gateway-signed" },
      gateway_signature: null,
      message_kind: "session-hello",
    },
  },
  {
    expected: CONTRACT_FAILURE_CODES.INTEGER_NON_CANONICAL,
    name: "a non-canonical heartbeat cursor",
    value: {
      credential_generation: "3",
      cursors: [{ acknowledged_position: "1", stream_epoch: 1 }],
      message_kind: "heartbeat",
      observed_at_ms: "1",
      protocol_version: "1.0",
      session_epoch: "7",
    },
  },
  {
    expected: CONTRACT_FAILURE_CODES.UNSUPPORTED_VERSION,
    name: "an unsupported envelope protocol version",
    value: { ...validEnvelope, protocol_version: "2.0" },
  },
  {
    expected: CONTRACT_FAILURE_CODES.UNKNOWN_FIELD,
    name: "a non-object delivery",
    value: { ...validEnvelope, delivery: null },
  },
  {
    expected: CONTRACT_FAILURE_CODES.INTEGER_NON_CANONICAL,
    name: "a non-canonical delivery position",
    value: {
      ...validEnvelope,
      delivery: { ...validEnvelope.delivery, position: 1 },
    },
  },
  {
    expected: CONTRACT_FAILURE_CODES.INVALID_DIGEST,
    name: "an invalid delivery digest",
    value: {
      ...validEnvelope,
      delivery: { ...validEnvelope.delivery, digest: "sha256:not-a-digest" },
    },
  },
];

test("CloudLink validation classifies malformed input before adapter use", async (t) => {
  for (const rejectionCase of rejectionCases) {
    await t.test(rejectionCase.name, () => {
      const raw =
        typeof rejectionCase.value === "string"
          ? rejectionCase.value
          : JSON.stringify(rejectionCase.value);

      assert.deepEqual(validateCloudLinkFixture(raw), {
        accepted: false,
        failureCode: rejectionCase.expected,
      });
    });
  }
});
