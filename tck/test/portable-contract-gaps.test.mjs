import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateExpiryContext,
  loadCoreScenarioSet,
  readCloudLinkFixture,
  runScenarioSet,
} from "../lib/scenario-runner.mjs";

function resultById(summary, id) {
  const result = summary.executed.find((entry) => entry.id === id);
  assert.ok(result, id);
  assert.equal(result.passed, true, id);
  return result.actual;
}

test("expiry evaluation is explicit, ordered, and exclusive at the deadline", async () => {
  const message = await readCloudLinkFixture(
    "fixtures/cloudlink/v1alpha1/telemetry-batch.valid.json",
  );

  assert.equal(evaluateExpiryContext(message, "1721003599999"), undefined);
  assert.deepEqual(evaluateExpiryContext(message, message.expires_at_ms), {
    accepted: false,
    failure_code: "MESSAGE_EXPIRED",
    state_changed: false,
    successful_receipt_permitted: false,
  });
  assert.deepEqual(
    evaluateExpiryContext(
      { ...message, expires_at_ms: "1720999999999" },
      "1721000000200",
    ),
    {
      accepted: false,
      failure_code: "INVALID_EXPIRY_WINDOW",
      state_changed: false,
      successful_receipt_permitted: false,
    },
  );
  assert.throws(() => evaluateExpiryContext(message), /evaluation_time_ms/);
});

test("portable scenarios cover batch binding and every current-session binding", async () => {
  const summary = await runScenarioSet(await loadCoreScenarioSet());

  assert.equal(
    resultById(summary, "cloudlink-conflicting-batch-binding").failure_code,
    "DIGEST_CONFLICT",
  );
  for (const id of [
    "cloudlink-gateway-mismatch",
    "cloudlink-session-id-mismatch",
    "cloudlink-session-epoch-mismatch",
    "cloudlink-credential-generation-mismatch",
  ]) {
    const actual = resultById(summary, id);
    assert.equal(actual.wire_accepted, true, id);
    assert.equal(actual.failure_code, "STALE_SESSION", id);
    assert.equal(actual.successful_receipt_permitted, false, id);
  }
});

test("portable scenarios freeze expiry failure precedence without wall-clock input", async () => {
  const summary = await runScenarioSet(await loadCoreScenarioSet());

  assert.equal(
    resultById(summary, "cloudlink-invalid-expiry-window").failure_code,
    "INVALID_EXPIRY_WINDOW",
  );
  assert.equal(
    resultById(summary, "cloudlink-expired-delivery").failure_code,
    "MESSAGE_EXPIRED",
  );
  assert.equal(
    resultById(summary, "cloudlink-new-delivery").context_accepted,
    true,
  );
});

test("portable fixtures cover session resume and capability parameter uniqueness", async () => {
  const summary = await runScenarioSet(await loadCoreScenarioSet());
  const resume = resultById(summary, "cloudlink-session-accepted-duplicate-cursor");
  const parameter = resultById(summary, "thing-model-duplicate-capability-parameter");

  assert.deepEqual(resume, {
    wire_accepted: true,
    context_accepted: false,
    failure_code: "CURSOR_CONFLICT",
    state_changed: false,
    successful_receipt_permitted: false,
  });
  assert.deepEqual(parameter, {
    wire_accepted: true,
    context_accepted: false,
    failure_code: "KEY_CONFLICT",
    state_changed: false,
    successful_receipt_permitted: false,
  });
});
