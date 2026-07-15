export const CONTRACT_FAILURE_CODES = Object.freeze({
  INVALID_ARGUMENT: "INVALID_ARGUMENT",
  INTEGER_NON_CANONICAL: "INTEGER_NON_CANONICAL",
  INTEGER_OUT_OF_RANGE: "INTEGER_OUT_OF_RANGE",
  JSON_CYCLIC_VALUE: "JSON_CYCLIC_VALUE",
  JSON_INVALID_UNICODE: "JSON_INVALID_UNICODE",
  JSON_NON_FINITE_NUMBER: "JSON_NON_FINITE_NUMBER",
  JSON_UNSAFE_NUMBER: "JSON_UNSAFE_NUMBER",
  JSON_UNSUPPORTED_VALUE: "JSON_UNSUPPORTED_VALUE",
} as const);

export type ContractFailureCode =
  (typeof CONTRACT_FAILURE_CODES)[keyof typeof CONTRACT_FAILURE_CODES];

/** A contract failure whose code is stable across language bindings. */
export class ContractFailure extends Error {
  override readonly name = "ContractFailure";

  constructor(
    readonly code: ContractFailureCode,
    message: string,
  ) {
    super(message);
  }
}
