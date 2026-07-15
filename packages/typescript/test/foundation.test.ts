import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTRACT_FAILURE_CODES,
  ContractFailure,
  canonicalizeJson,
  parseCanonicalUint64,
} from "../src/index.js";

test("canonical uint64 preserves zero and the full unsigned range", () => {
  assert.equal(parseCanonicalUint64("0"), 0n);
  assert.equal(
    parseCanonicalUint64("18446744073709551615"),
    18_446_744_073_709_551_615n,
  );
});

test("canonical uint64 rejects leading zeroes with a stable failure code", () => {
  assert.throws(
    () => parseCanonicalUint64("01"),
    (error: unknown) =>
      error instanceof ContractFailure &&
      error.code === "INTEGER_NON_CANONICAL",
  );
});

test("canonical uint64 rejects every non-canonical decimal form", () => {
  for (const input of [
    "",
    "+1",
    "-1",
    " 1",
    "1 ",
    "1.0",
    "1e0",
    "١",
  ]) {
    assert.throws(
      () => parseCanonicalUint64(input),
      (error: unknown) =>
        error instanceof ContractFailure &&
        error.code === CONTRACT_FAILURE_CODES.INTEGER_NON_CANONICAL,
      input,
    );
  }
});

test("canonical uint64 rejects values above uint64 max", () => {
  assert.throws(
    () => parseCanonicalUint64("18446744073709551616"),
    (error: unknown) =>
      error instanceof ContractFailure &&
      error.code === CONTRACT_FAILURE_CODES.INTEGER_OUT_OF_RANGE,
  );
});

test("canonical uint64 classifies overlength before lexical content", () => {
  for (const input of ["11111111111111111111x", "١".repeat(11)]) {
    assert.throws(
      () => parseCanonicalUint64(input),
      (error: unknown) =>
        error instanceof ContractFailure &&
        error.code === CONTRACT_FAILURE_CODES.INTEGER_OUT_OF_RANGE,
      input,
    );
  }
});

test("canonical uint64 validates JavaScript callers at runtime", () => {
  assert.throws(
    () => parseCanonicalUint64(1),
    (error: unknown) =>
      error instanceof ContractFailure &&
      error.code === CONTRACT_FAILURE_CODES.INVALID_ARGUMENT,
  );
});

test("canonical JSON is independent of object insertion order", () => {
  assert.equal(
    canonicalizeJson({ payload: { z: 1, a: "edge" }, version: "1" }),
    '{"payload":{"a":"edge","z":1},"version":"1"}',
  );
});

test("canonical JSON sorts object keys by UTF-16 code units", () => {
  assert.equal(
    canonicalizeJson({ "\ue000": "private-use", "😀": "astral" }),
    '{"😀":"astral","\ue000":"private-use"}',
  );
});

test("canonical JSON uses ECMAScript number serialization", () => {
  assert.equal(
    canonicalizeJson([1e-7, 1e-6, 333333333.33333329, Number.MAX_VALUE, -0]),
    "[1e-7,0.000001,333333333.3333333,1.7976931348623157e+308,0]",
  );
});

test("canonical JSON preserves array order and recursively sorts objects", () => {
  assert.equal(
    canonicalizeJson([{ z: true, a: null }, "edge", false]),
    '[{"a":null,"z":true},"edge",false]',
  );
});

test("canonical JSON preserves valid Unicode surrogate pairs", () => {
  assert.equal(canonicalizeJson("😀"), '"😀"');
});

test("canonical JSON rejects lone UTF-16 surrogates", () => {
  for (const input of [
    { invalid: "\ud800" },
    { invalid: "\udc00" },
    { "\ud800": "invalid key" },
  ]) {
    assert.throws(
      () => canonicalizeJson(input),
      (error: unknown) =>
        error instanceof ContractFailure &&
        error.code === CONTRACT_FAILURE_CODES.JSON_INVALID_UNICODE,
    );
  }
});

test("canonical JSON rejects non-finite numbers", () => {
  for (const input of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(
      () => canonicalizeJson(input),
      (error: unknown) =>
        error instanceof ContractFailure &&
        error.code === CONTRACT_FAILURE_CODES.JSON_NON_FINITE_NUMBER,
    );
  }
});

test("canonical JSON rejects unsafe integer numbers", () => {
  for (const input of [9_007_199_254_740_992, 1.5e20]) {
    assert.throws(
      () => canonicalizeJson(input),
      (error: unknown) =>
        error instanceof ContractFailure &&
        error.code === CONTRACT_FAILURE_CODES.JSON_UNSAFE_NUMBER,
    );
  }
});

test("canonical JSON rejects non-JSON JavaScript values", () => {
  for (const input of [undefined, 1n, Symbol("invalid"), () => undefined]) {
    assert.throws(
      () => canonicalizeJson(input),
      (error: unknown) =>
        error instanceof ContractFailure &&
        error.code === CONTRACT_FAILURE_CODES.JSON_UNSUPPORTED_VALUE,
    );
  }
});

test("canonical JSON rejects sparse arrays", () => {
  const input = new Array<unknown>(1);

  assert.throws(
    () => canonicalizeJson(input),
    (error: unknown) =>
      error instanceof ContractFailure &&
      error.code === CONTRACT_FAILURE_CODES.JSON_UNSUPPORTED_VALUE,
  );
});

test("canonical JSON rejects symbol and accessor object members", () => {
  const symbolMember: Record<PropertyKey, unknown> = {};
  symbolMember[Symbol("hidden")] = "value";

  const accessorMember: Record<string, unknown> = {};
  Object.defineProperty(accessorMember, "sideEffect", {
    enumerable: true,
    get: () => "value",
  });

  for (const input of [symbolMember, accessorMember]) {
    assert.throws(
      () => canonicalizeJson(input),
      (error: unknown) =>
        error instanceof ContractFailure &&
        error.code === CONTRACT_FAILURE_CODES.JSON_UNSUPPORTED_VALUE,
    );
  }
});

test("canonical JSON rejects cycles with a stable failure code", () => {
  interface SelfReference {
    self?: SelfReference;
  }

  const input: SelfReference = {};
  input.self = input;

  assert.throws(
    () => canonicalizeJson(input),
    (error: unknown) =>
      error instanceof ContractFailure &&
      error.code === CONTRACT_FAILURE_CODES.JSON_CYCLIC_VALUE,
  );
});
