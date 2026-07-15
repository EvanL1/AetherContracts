import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  type CloudLinkFixtureContext,
  validateCloudLinkFixture,
} from "../src/index.js";

interface FixtureEntry {
  readonly expectation: "context-invalid" | "valid" | "wire-invalid";
  readonly failure_code?: string;
  readonly file: string;
}

interface FixtureManifest {
  readonly fixtures: readonly FixtureEntry[];
}

const fixtureDirectory = new URL(
  "../../../../fixtures/cloudlink/v1alpha1/",
  import.meta.url,
);

async function fixtureText(file: string): Promise<string> {
  return readFile(new URL(file, fixtureDirectory), "utf8");
}

function decodeManifest(value: unknown): FixtureManifest {
  if (
    value === null ||
    typeof value !== "object" ||
    !("fixtures" in value) ||
    !Array.isArray(value.fixtures)
  ) {
    throw new TypeError("fixture manifest is invalid");
  }
  return value as FixtureManifest;
}

test("TypeScript executes every public CloudLink fixture with its stable result", async () => {
  const manifest = decodeManifest(
    JSON.parse(await fixtureText("fixture-manifest.json")) as unknown,
  );
  const accepted = await fixtureText("telemetry-batch.valid.json");
  const currentSession = {
    credentialGeneration: "3",
    gatewayId: "33333333-3333-4333-8333-333333333333",
    sessionEpoch: "7",
    sessionId: "44444444-4444-4444-8444-444444444444",
  } as const;

  for (const entry of manifest.fixtures) {
    const context: CloudLinkFixtureContext = {
      ...(entry.file.startsWith("conflicting-replay")
        ? { priorAcceptedDelivery: accepted }
        : {}),
      ...(entry.expectation === "context-invalid"
        ? { currentSession }
        : {}),
    };
    const result = validateCloudLinkFixture(await fixtureText(entry.file), context);
    assert.equal(result.accepted, entry.expectation === "valid", entry.file);
    assert.equal(result.failureCode, entry.failure_code, entry.file);
  }
});
