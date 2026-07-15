import { CONTRACT_FAILURE_CODES, ContractFailure } from "./failure.js";

const UINT64_MAX_DECIMAL = "18446744073709551615";
const CANONICAL_UNSIGNED_DECIMAL = /^(?:0|[1-9][0-9]*)$/u;
const UTF8_ENCODER = new TextEncoder();

/**
 * Parses the contract representation of a uint64.
 *
 * Protocol uint64 values are decimal JSON strings, never JavaScript numbers.
 */
export function parseCanonicalUint64(input: unknown): bigint {
  if (typeof input !== "string") {
    throw new ContractFailure(
      CONTRACT_FAILURE_CODES.INVALID_ARGUMENT,
      "A canonical uint64 must be represented as a decimal string",
    );
  }

  if (UTF8_ENCODER.encode(input).byteLength > UINT64_MAX_DECIMAL.length) {
    throw new ContractFailure(
      CONTRACT_FAILURE_CODES.INTEGER_OUT_OF_RANGE,
      "The decimal string exceeds the maximum uint64 representation length",
    );
  }

  if (!CANONICAL_UNSIGNED_DECIMAL.test(input)) {
    throw new ContractFailure(
      CONTRACT_FAILURE_CODES.INTEGER_NON_CANONICAL,
      "A canonical uint64 must contain only canonical unsigned decimal digits",
    );
  }

  if (
    input.length === UINT64_MAX_DECIMAL.length &&
    input > UINT64_MAX_DECIMAL
  ) {
    throw new ContractFailure(
      CONTRACT_FAILURE_CODES.INTEGER_OUT_OF_RANGE,
      "The decimal string exceeds the uint64 range",
    );
  }

  return BigInt(input);
}
