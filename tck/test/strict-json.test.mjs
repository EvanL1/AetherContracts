import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_JSON_BUDGETS,
  decodeJson,
} from "../lib/strict-json.mjs";

function assertFailureCode(input, code) {
  assert.throws(
    () => decodeJson(input),
    (error) => error instanceof SyntaxError && error.code === code,
  );
}

test("strict JSON decoder accepts ordinary UTF-8 JSON and large finite floating-point values", () => {
  const source = Buffer.from(
    '{"message":"Aether \ud83c\udf0d","safe":9007199254740991,"large":1.7976931348623157e308}',
    "utf8",
  );

  assert.deepEqual(decodeJson(source), {
    message: "Aether 🌍",
    safe: Number.MAX_SAFE_INTEGER,
    large: Number.MAX_VALUE,
  });
});

test("strict JSON decoder rejects duplicate object keys after JSON escape decoding", () => {
  assertFailureCode('{"gateway_id":"first","gateway_id":"second"}', "DUPLICATE_JSON_KEY");
  assertFailureCode('{"gateway_id":"first","gateway\\u005fid":"second"}', "DUPLICATE_JSON_KEY");
  assertFailureCode('{"outer":{"position":"1","position":"2"}}', "DUPLICATE_JSON_KEY");
});

test("strict JSON decoder allows the same member name in different objects", () => {
  assert.deepEqual(decodeJson('{"left":{"id":1},"right":{"id":2}}'), {
    left: { id: 1 },
    right: { id: 2 },
  });
});

test("strict JSON decoder rejects malformed UTF-8 and unpaired Unicode surrogates", () => {
  const malformedUtf8 = Buffer.from([
    0x7b, 0x22, 0x76, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d,
  ]);

  assertFailureCode(malformedUtf8, "JSON_INVALID_UNICODE");
  assertFailureCode('{"value":"\\ud800"}', "JSON_INVALID_UNICODE");
  assertFailureCode('{"value":"\\udc00"}', "JSON_INVALID_UNICODE");
  assertFailureCode(`{"value":"${"\ud800"}"}`, "JSON_INVALID_UNICODE");
});

test("strict JSON decoder accepts valid surrogate pairs in escaped and literal form", () => {
  assert.deepEqual(decodeJson('{"escaped":"\\ud83c\\udf0d","literal":"🌍"}'), {
    escaped: "🌍",
    literal: "🌍",
  });
});

test("strict JSON decoder rejects unsafe integer number tokens with a stable code", () => {
  assertFailureCode('{"value":9007199254740992}', "JSON_UNSAFE_NUMBER");
  assertFailureCode('{"value":-9007199254740992}', "JSON_UNSAFE_NUMBER");
  assertFailureCode('{"value":9007199254740993e0}', "JSON_UNSAFE_NUMBER");
  assertFailureCode('{"value":9007199254740993.0}', "JSON_UNSAFE_NUMBER");
  assertFailureCode('{"value":1.0e20}', "JSON_UNSAFE_NUMBER");
  assertFailureCode('{"value":1.5e20}', "JSON_UNSAFE_NUMBER");
});

test("strict JSON decoder distinguishes non-finite numeric results from large finite floats", () => {
  assert.equal(decodeJson('{"value":1.7976931348623157e308}').value, Number.MAX_VALUE);
  assert.equal(decodeJson('{"value":1e-100}').value, 1e-100);
  const canonical = JSON.stringify(decodeJson('{"value":1.7976931348623157e308}'));
  assert.deepEqual(decodeJson(canonical), { value: Number.MAX_VALUE });
  assertFailureCode('{"value":1e400}', "JSON_NON_FINITE_NUMBER");
});

test("strict JSON decoder applies an explicit default byte budget before parsing", () => {
  assertFailureCode(
    Buffer.alloc(DEFAULT_JSON_BUDGETS.maxBytes + 1, 0x20),
    "FIELD_BOUND",
  );
});

test("strict JSON decoder bounds nesting before recursive parsing can exhaust the stack", () => {
  const source = `${"[".repeat(DEFAULT_JSON_BUDGETS.maxDepth + 1)}null${"]".repeat(DEFAULT_JSON_BUDGETS.maxDepth + 1)}`;
  assertFailureCode(source, "FIELD_BOUND");
});

test("strict JSON decoder enforces configurable string, member, array, and number-token budgets", () => {
  assert.throws(
    () => decodeJson('{"key":"four"}', { maxStringCodeUnits: 3 }),
    (error) => error.code === "FIELD_BOUND",
  );
  assert.throws(
    () => decodeJson('{"a":1,"b":2}', { maxObjectMembers: 1 }),
    (error) => error.code === "FIELD_BOUND",
  );
  assert.throws(
    () => decodeJson("[1,2]", { maxArrayItems: 1 }),
    (error) => error.code === "FIELD_BOUND",
  );
  assert.throws(
    () => decodeJson("1234", { maxNumberTokenLength: 3 }),
    (error) => error.code === "FIELD_BOUND",
  );
});

test("strict decoder failure codes are exact entries in the contractual taxonomy", async () => {
  const taxonomy = decodeJson(
    await readFile(new URL("../../compatibility/failure-codes.json", import.meta.url)),
  );
  const contractualCodes = new Set(taxonomy.failures.map((failure) => failure.code));

  for (const code of [
    "DUPLICATE_JSON_KEY",
    "JSON_INVALID_UNICODE",
    "JSON_UNSAFE_NUMBER",
    "JSON_NON_FINITE_NUMBER",
    "FIELD_BOUND",
    "JSON_SYNTAX_ERROR",
  ]) {
    assert.equal(contractualCodes.has(code), true, code);
  }
});

test("strict decoder reports malformed JSON with a stable code and offset", () => {
  for (const source of ["{", '{"value":1,}', '{"value":01}']) {
    assert.throws(
      () => decodeJson(source),
      (error) =>
        error.code === "JSON_SYNTAX_ERROR" &&
        Number.isSafeInteger(error.offset) &&
        error.offset >= 0,
      source,
    );
  }
});
