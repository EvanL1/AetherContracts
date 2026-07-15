import { CONTRACT_FAILURE_CODES, ContractFailure } from "./failure.js";

/**
 * Produces RFC 8785-compatible canonical JSON for an already decoded value.
 *
 * This binding deliberately rejects JavaScript-only values, invalid Unicode,
 * non-finite numbers, and integers that cannot be represented safely. Protocol
 * uint64 fields must be supplied as canonical decimal strings. Signed int64
 * wire semantics are not frozen by the current alpha contract.
 */
export function canonicalizeJson(value: unknown): string {
  return serializeJsonValue(value, new Set<object>());
}

function serializeJsonValue(value: unknown, ancestors: Set<object>): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return serializeNumber(value);
    case "string":
      return serializeString(value);
    case "object":
      return serializeObject(value, ancestors);
    default:
      throw new ContractFailure(
        CONTRACT_FAILURE_CODES.JSON_UNSUPPORTED_VALUE,
        `Unsupported JSON value type: ${typeof value}`,
      );
  }
}

function serializeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new ContractFailure(
      CONTRACT_FAILURE_CODES.JSON_NON_FINITE_NUMBER,
      "Canonical JSON does not permit non-finite numbers",
    );
  }

  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new ContractFailure(
      CONTRACT_FAILURE_CODES.JSON_UNSUPPORTED_VALUE,
      "The number cannot be represented as canonical JSON",
    );
  }
  if (
    Number.isInteger(value) &&
    !Number.isSafeInteger(value) &&
    !serialized.includes(".")
  ) {
    throw new ContractFailure(
      CONTRACT_FAILURE_CODES.JSON_UNSAFE_NUMBER,
      "Integer-valued JSON numbers outside the safe range require declared string semantics",
    );
  }
  return serialized;
}

function serializeString(value: string): string {
  assertValidUnicode(value);
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new ContractFailure(
      CONTRACT_FAILURE_CODES.JSON_UNSUPPORTED_VALUE,
      "The string cannot be represented as canonical JSON",
    );
  }
  return serialized;
}

function assertValidUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) {
        throw invalidUnicodeFailure();
      }
      const trailing = value.charCodeAt(index + 1);
      if (trailing < 0xdc00 || trailing > 0xdfff) {
        throw invalidUnicodeFailure();
      }
      index += 1;
      continue;
    }

    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw invalidUnicodeFailure();
    }
  }
}

function invalidUnicodeFailure(): ContractFailure {
  return new ContractFailure(
    CONTRACT_FAILURE_CODES.JSON_INVALID_UNICODE,
    "Canonical JSON does not permit lone UTF-16 surrogates",
  );
}

function serializeObject(value: object, ancestors: Set<object>): string {
  if (ancestors.has(value)) {
    throw new ContractFailure(
      CONTRACT_FAILURE_CODES.JSON_CYCLIC_VALUE,
      "Canonical JSON does not permit cyclic values",
    );
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return serializeArray(value, ancestors);
    }

    return serializeRecord(value, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function serializeArray(value: readonly unknown[], ancestors: Set<object>): string {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw unsupportedObjectMemberFailure();
  }

  const ownNames = Object.getOwnPropertyNames(value);
  if (ownNames.length !== value.length + 1) {
    throw unsupportedObjectMemberFailure();
  }

  const elements: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor)) {
      throw unsupportedObjectMemberFailure();
    }
    elements.push(serializeJsonValue(descriptor.value, ancestors));
  }
  return `[${elements.join(",")}]`;
}

function serializeRecord(value: object, ancestors: Set<object>): string {
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ContractFailure(
      CONTRACT_FAILURE_CODES.JSON_UNSUPPORTED_VALUE,
      "Canonical JSON objects must be plain records",
    );
  }

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === "symbol")) {
    throw unsupportedObjectMemberFailure();
  }

  const keys: string[] = [];
  const membersByKey = new Map<string, unknown>();
  for (const key of ownKeys) {
    if (typeof key !== "string") {
      throw unsupportedObjectMemberFailure();
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      throw unsupportedObjectMemberFailure();
    }
    assertValidUnicode(key);
    keys.push(key);
    membersByKey.set(key, descriptor.value);
  }
  keys.sort();

  const members = keys.map(
    (key) =>
      `${serializeString(key)}:${serializeJsonValue(membersByKey.get(key), ancestors)}`,
  );
  return `{${members.join(",")}}`;
}

function unsupportedObjectMemberFailure(): ContractFailure {
  return new ContractFailure(
    CONTRACT_FAILURE_CODES.JSON_UNSUPPORTED_VALUE,
    "Canonical JSON accepts only data members from decoded JSON values",
  );
}
