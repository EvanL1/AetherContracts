import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CLOUDLINK_REPLAY_IDENTITY_FIELDS,
  businessDigestForEnvelope,
  dataLossRangeIsValid,
  durableAckMatchesAcceptedDelivery,
  evaluateCloudLinkDeliveryContext,
  hasCursorConflict,
  hasThingModelKeyConflict,
  loadCoreScenarioSet,
  readCloudLinkFixture,
  runtimeManifestChecksum,
  runScenarioSet,
  thingModelPublicationDigest,
  validateScenarioSet,
} from "../lib/scenario-runner.mjs";
import { decodeJson } from "../lib/strict-json.mjs";

const replayIdentityFields = [
  "gateway_id",
  "delivery.stream_id",
  "delivery.stream_epoch",
  "delivery.position",
];

test("core scenario document is loaded through its declared JSON Schema", async () => {
  const scenarioSet = await loadCoreScenarioSet();

  assert.equal(scenarioSet.schema, "aether.tck.scenarios.v1alpha1");
  assert.equal(scenarioSet.contract_version, "0.1.0-alpha.3");
  assert.ok(scenarioSet.scenarios.length > 0);

  await assert.rejects(
    validateScenarioSet({ ...scenarioSet, undeclared_core_field: true }),
    /scenario schema/i,
  );

  const duplicateId = structuredClone(scenarioSet);
  duplicateId.scenarios[1].id = duplicateId.scenarios[0].id;
  await assert.rejects(validateScenarioSet(duplicateId), /duplicate scenario id/i);
});

test("every context-invalid manifest fixture has exactly one direct implemented scenario", async () => {
  const scenarioSet = await loadCoreScenarioSet();
  const manifests = [
    ["cloudlink", "fixtures/cloudlink/v1alpha1/fixture-manifest.json"],
    ["thing-model", "fixtures/thing-model/v1alpha1/fixture-manifest.json"],
  ];

  for (const [contract, path] of manifests) {
    const manifest = decodeJson(
      await readFile(new URL(`../../${path}`, import.meta.url)),
    );
    const directory = `fixtures/${contract}/v1alpha1/`;
    for (const fixture of manifest.fixtures.filter(
      (entry) => entry.expectation === "context-invalid",
    )) {
      const path = `${directory}${fixture.file}`;
      const matchingScenarios = scenarioSet.scenarios.filter(
        (scenario) =>
          scenario.status === "implemented" &&
          scenario.input.fixture === path &&
          scenario.input.semantic_mutation === undefined &&
          scenario.expected.context_accepted === false &&
          scenario.expected.failure_code === fixture.failure_code,
      );
      assert.equal(matchingScenarios.length, 1, path);
    }
  }
});

test("core scenarios cover canonical integer precedence and CloudLink context failures", async () => {
  const scenarioSet = await loadCoreScenarioSet();
  const byId = new Map(scenarioSet.scenarios.map((scenario) => [scenario.id, scenario]));

  assert.deepEqual(
    [
      "uint64-leading-zero",
      "uint64-overflow",
      "uint64-long-mixed-out-of-range",
      "uint64-arabic-indic-byte-overflow",
      "cloudlink-conflicting-digest",
      "cloudlink-digest-mismatch",
      "cloudlink-stale-ack",
      "cloudlink-wrong-session-epoch",
      "thing-model-cross-namespace-key-conflict",
      "runtime-manifest-checksum",
      "thing-model-publication-digest",
      "cloudlink-new-delivery",
      "cloudlink-idempotent-replay",
      "cloudlink-data-loss-invalid-range",
      "cloudlink-duplicate-cursor",
      "raw-json-valid-large-finite-float",
      "raw-json-duplicate-key",
      "raw-json-escaped-duplicate-key",
      "raw-json-invalid-utf8",
      "raw-json-lone-surrogate",
      "raw-json-unsafe-integer",
      "raw-json-unsafe-integer-exponent",
      "raw-json-unsafe-integer-fraction",
      "raw-json-truncated-object",
      "raw-json-trailing-comma",
      "raw-json-malformed-number",
    ].filter((id) => byId.get(id)?.status !== "implemented"),
    [],
  );

  const conflict = byId.get("cloudlink-conflicting-digest");
  assert.equal(
    conflict.input.fixture,
    "fixtures/cloudlink/v1alpha1/conflicting-replay.valid-digest.json",
  );
  assert.equal(conflict.input.prior_fixture, "fixtures/cloudlink/v1alpha1/telemetry-batch.valid.json");
  assert.deepEqual(conflict.input.replay_identity_fields, replayIdentityFields);
  assert.deepEqual(CLOUDLINK_REPLAY_IDENTITY_FIELDS, replayIdentityFields);
});

test("Runtime Manifest checksum omits only the top-level checksum member", async () => {
  const report = await readCloudLinkFixture(
    "fixtures/cloudlink/v1alpha1/runtime-manifest-report.valid.json",
  );
  const expected = "75643d71e08d67950578d0d7077f9de7b0c3ef907622dbc03e558f2763fcf19e";

  assert.equal(runtimeManifestChecksum(report.payload.manifest), expected);
  assert.equal(report.payload.manifest.checksum.digest, expected);

  const summary = await runScenarioSet(await loadCoreScenarioSet());
  assert.deepEqual(
    summary.executed.find((entry) => entry.id === "runtime-manifest-checksum")?.actual,
    { wire_accepted: true, digest: expected },
  );
});

test("Thing Model publication digest covers the complete wire-valid model", async () => {
  const model = decodeJson(
    await readFile(
      new URL(
        "../../fixtures/thing-model/v1alpha1/valid/voltage-battery.golden.json",
        import.meta.url,
      ),
    ),
  );
  const expected = "sha256:1243202251189f81c07e30bd4848b317f40f5f7bf684ca22d4e81f2df4052f5e";

  assert.equal(thingModelPublicationDigest(model), expected);
  const summary = await runScenarioSet(await loadCoreScenarioSet());
  assert.deepEqual(
    summary.executed.find((entry) => entry.id === "thing-model-publication-digest")?.actual,
    { wire_accepted: true, digest: expected },
  );
});

test("language-neutral core scenarios carry raw JSON byte and Unicode vectors", async () => {
  const summary = await runScenarioSet(await loadCoreScenarioSet());
  const expected = new Map([
    ["raw-json-valid-large-finite-float", { accepted: true }],
    ["raw-json-duplicate-key", { accepted: false, failure_code: "DUPLICATE_JSON_KEY" }],
    ["raw-json-escaped-duplicate-key", { accepted: false, failure_code: "DUPLICATE_JSON_KEY" }],
    ["raw-json-invalid-utf8", { accepted: false, failure_code: "JSON_INVALID_UNICODE" }],
    ["raw-json-lone-surrogate", { accepted: false, failure_code: "JSON_INVALID_UNICODE" }],
    ["raw-json-unsafe-integer", { accepted: false, failure_code: "JSON_UNSAFE_NUMBER" }],
    ["raw-json-unsafe-integer-exponent", { accepted: false, failure_code: "JSON_UNSAFE_NUMBER" }],
    ["raw-json-unsafe-integer-fraction", { accepted: false, failure_code: "JSON_UNSAFE_NUMBER" }],
    ["raw-json-truncated-object", { accepted: false, failure_code: "JSON_SYNTAX_ERROR" }],
    ["raw-json-trailing-comma", { accepted: false, failure_code: "JSON_SYNTAX_ERROR" }],
    ["raw-json-malformed-number", { accepted: false, failure_code: "JSON_SYNTAX_ERROR" }],
  ]);

  for (const [id, actual] of expected) {
    assert.deepEqual(summary.executed.find((entry) => entry.id === id)?.actual, actual, id);
  }
});

test("delivery reducer freezes new, idempotent, and conflicting receipt permission", async () => {
  const summary = await runScenarioSet(await loadCoreScenarioSet());
  const actual = (id) => summary.executed.find((entry) => entry.id === id)?.actual;

  assert.deepEqual(actual("cloudlink-new-delivery"), {
    wire_accepted: true,
    context_accepted: true,
    state_changed: true,
    successful_receipt_permitted: true,
  });
  assert.deepEqual(actual("cloudlink-idempotent-replay"), {
    wire_accepted: true,
    prior_wire_accepted: true,
    context_accepted: true,
    state_changed: false,
    successful_receipt_permitted: true,
  });
  assert.equal(
    actual("cloudlink-conflicting-digest").successful_receipt_permitted,
    false,
  );

  for (const result of summary.executed) {
    if (result.actual.context_accepted === false) {
      assert.equal(result.actual.successful_receipt_permitted, false, result.id);
    }
  }
});

test("data-loss ranges and heartbeat cursors require ordering and uniqueness", async () => {
  const dataLoss = await readCloudLinkFixture(
    "fixtures/cloudlink/v1alpha1/data-loss.valid.json",
  );
  assert.equal(dataLossRangeIsValid(dataLoss.payload), true);
  assert.equal(
    dataLossRangeIsValid({
      ...dataLoss.payload,
      first_lost_position: "4",
      last_lost_position: "3",
    }),
    false,
  );
  assert.equal(
    dataLossRangeIsValid({
      ...dataLoss.payload,
      last_lost_position: dataLoss.payload.earliest_retained_position,
    }),
    false,
  );

  const heartbeat = await readCloudLinkFixture(
    "fixtures/cloudlink/v1alpha1/heartbeat.valid.json",
  );
  assert.equal(hasCursorConflict(heartbeat.cursors), false);
  assert.equal(hasCursorConflict([...heartbeat.cursors, heartbeat.cursors[0]]), true);

  const summary = await runScenarioSet(await loadCoreScenarioSet());
  const dataLossResult = summary.executed.find(
    (entry) => entry.id === "cloudlink-data-loss-invalid-range",
  );
  const cursorResult = summary.executed.find(
    (entry) => entry.id === "cloudlink-duplicate-cursor",
  );
  assert.equal(dataLossResult?.actual.failure_code, "DATA_LOSS_RANGE_INVALID");
  assert.equal(cursorResult?.actual.failure_code, "CURSOR_CONFLICT");
  assert.equal(dataLossResult?.actual.wire_accepted, true);
  assert.equal(cursorResult?.actual.wire_accepted, true);
});

test("CloudLink conflict detection compares the complete replay identity tuple", async () => {
  const prior = await readCloudLinkFixture(
    "fixtures/cloudlink/v1alpha1/telemetry-batch.valid.json",
  );
  const replay = await readCloudLinkFixture(
    "fixtures/cloudlink/v1alpha1/conflicting-replay.valid-digest.json",
  );
  const currentSession = {
    gateway_id: prior.gateway_id,
    session_id: prior.session_id,
    session_epoch: prior.session_epoch,
    credential_generation: prior.credential_generation,
  };
  const evaluationTimeMs = "1721000000300";

  assert.deepEqual(
    evaluateCloudLinkDeliveryContext(replay, {
      currentSession,
      priorAcceptedDelivery: prior,
      evaluationTimeMs,
    }),
    {
      accepted: false,
      failure_code: "DIGEST_CONFLICT",
      state_changed: false,
      successful_receipt_permitted: false,
    },
  );

  const alternativeValues = {
    gateway_id: "77777777-7777-4777-8777-777777777777",
    "delivery.stream_id": "telemetry-other",
    "delivery.stream_epoch": "5",
    "delivery.position": "20",
  };
  for (const field of replayIdentityFields) {
    const changed = structuredClone(replay);
    if (field === "gateway_id") {
      changed.gateway_id = alternativeValues[field];
    } else {
      const deliveryField = field.slice("delivery.".length);
      changed.delivery[deliveryField] = alternativeValues[field];
    }

    assert.deepEqual(
      evaluateCloudLinkDeliveryContext(changed, {
        currentSession:
          field === "gateway_id"
            ? { ...currentSession, gateway_id: changed.gateway_id }
            : currentSession,
        priorAcceptedDelivery: prior,
        evaluationTimeMs,
      }),
      {
        accepted: true,
        state_changed: true,
        successful_receipt_permitted: true,
      },
      field,
    );
  }

  const changedBatch = structuredClone(replay);
  changedBatch.delivery.batch_id = "batch-2";
  assert.deepEqual(
    evaluateCloudLinkDeliveryContext(changedBatch, {
      currentSession,
      priorAcceptedDelivery: prior,
      evaluationTimeMs,
    }),
    {
      accepted: false,
      failure_code: "DIGEST_CONFLICT",
      state_changed: false,
      successful_receipt_permitted: false,
    },
  );
});

test("minimal fixture context reducer validates wire shape before explicit CloudLink session context", async () => {
  const summary = await runScenarioSet(await loadCoreScenarioSet());
  const staleIds = ["cloudlink-stale-ack", "cloudlink-wrong-session-epoch"];

  for (const id of staleIds) {
    const result = summary.executed.find((entry) => entry.id === id);
    assert.ok(result, id);
    assert.equal(result.actual.wire_accepted, true, id);
    assert.equal(result.actual.context_accepted, false, id);
    assert.equal(result.actual.failure_code, "STALE_SESSION", id);
    assert.equal(result.actual.state_changed, false, id);
  }
});

test("minimal fixture context reducer checks every frozen current-session binding", async () => {
  const candidate = await readCloudLinkFixture(
    "fixtures/cloudlink/v1alpha1/telemetry-batch.valid.json",
  );
  const currentSession = {
    gateway_id: candidate.gateway_id,
    session_id: candidate.session_id,
    session_epoch: candidate.session_epoch,
    credential_generation: candidate.credential_generation,
  };
  const alternatives = {
    gateway_id: "77777777-7777-4777-8777-777777777777",
    session_id: "77777777-7777-4777-8777-777777777777",
    session_epoch: "8",
    credential_generation: "4",
  };
  const evaluationTimeMs = "1721000000300";

  for (const field of Object.keys(currentSession)) {
    const stale = { ...currentSession, [field]: alternatives[field] };
    assert.deepEqual(
      evaluateCloudLinkDeliveryContext(candidate, {
        currentSession: stale,
        evaluationTimeMs,
      }),
      {
        accepted: false,
        failure_code: "STALE_SESSION",
        state_changed: false,
        successful_receipt_permitted: false,
      },
      field,
    );
  }
});

test("minimal fixture context reducer verifies business digest before replay comparison", async () => {
  const prior = await readCloudLinkFixture(
    "fixtures/cloudlink/v1alpha1/telemetry-batch.valid.json",
  );
  const mismatch = await readCloudLinkFixture(
    "fixtures/cloudlink/v1alpha1/conflicting-replay.json",
  );
  const currentSession = {
    gateway_id: prior.gateway_id,
    session_id: prior.session_id,
    session_epoch: prior.session_epoch,
    credential_generation: prior.credential_generation,
  };

  assert.equal(
    businessDigestForEnvelope(prior),
    "sha256:397dafb32f984e975221bb3aa13481808692d24850a201be8818dd1517f38c35",
  );
  assert.deepEqual(
    evaluateCloudLinkDeliveryContext(mismatch, {
      currentSession,
      priorAcceptedDelivery: prior,
    }),
    {
      accepted: false,
      failure_code: "DIGEST_MISMATCH",
      state_changed: false,
      successful_receipt_permitted: false,
    },
  );
});

test("durable ACK binding helper matches the accepted delivery tuple and digest", async () => {
  const delivery = await readCloudLinkFixture(
    "fixtures/cloudlink/v1alpha1/telemetry-batch.valid.json",
  );
  const ack = await readCloudLinkFixture(
    "fixtures/cloudlink/v1alpha1/durable-ack.valid.json",
  );
  assert.equal(durableAckMatchesAcceptedDelivery(ack, delivery), true);

  for (const [field, value] of [
    ["gateway_id", "77777777-7777-4777-8777-777777777777"],
    ["session_id", "77777777-7777-4777-8777-777777777777"],
    ["session_epoch", "8"],
    ["credential_generation", "4"],
    ["stream_id", "telemetry-other"],
    ["stream_epoch", "5"],
    ["acknowledged_position", "20"],
    ["batch_id", "batch-2"],
    ["digest", `sha256:${"b".repeat(64)}`],
  ]) {
    assert.equal(
      durableAckMatchesAcceptedDelivery({ ...ack, [field]: value }, delivery),
      false,
      field,
    );
  }
});

test("conflicting replay is wire-valid together with its explicit prior accepted delivery", async () => {
  const summary = await runScenarioSet(await loadCoreScenarioSet());
  const result = summary.executed.find(
    (entry) => entry.id === "cloudlink-conflicting-digest",
  );

  assert.ok(result);
  assert.equal(result.actual.wire_accepted, true);
  assert.equal(result.actual.prior_wire_accepted, true);
  assert.equal(result.actual.context_accepted, false);
  assert.equal(result.actual.failure_code, "DIGEST_CONFLICT");
  assert.equal(result.actual.state_changed, false);
});

test("Thing Model cross-namespace duplicate is wire-valid and context-invalid", async () => {
  const summary = await runScenarioSet(await loadCoreScenarioSet());
  const result = summary.executed.find(
    (entry) => entry.id === "thing-model-cross-namespace-key-conflict",
  );

  assert.ok(result);
  assert.deepEqual(result.actual, {
    wire_accepted: true,
    context_accepted: false,
    failure_code: "KEY_CONFLICT",
    state_changed: false,
    successful_receipt_permitted: false,
  });
});

test("Thing Model key reducer rejects repeated semantic keys within one namespace", () => {
  assert.equal(
    hasThingModelKeyConflict({
      properties: [
        { key: "state", title: "First" },
        { key: "state", title: "Second" },
      ],
      points: [],
      capabilities: [],
    }),
    true,
  );
});

test("Thing Model key reducer rejects repeated capability parameter keys", () => {
  assert.equal(
    hasThingModelKeyConflict({
      properties: [],
      points: [],
      capabilities: [
        {
          key: "configure",
          parameters: [
            { key: "mode" },
            { key: "mode" },
          ],
        },
      ],
    }),
    true,
  );
});

test("runner executes every implemented scenario and explicitly reports blocked authentication", async () => {
  const scenarioSet = await loadCoreScenarioSet();
  const summary = await runScenarioSet(scenarioSet);
  const implemented = scenarioSet.scenarios.filter((scenario) => scenario.status === "implemented");

  assert.equal(summary.implemented, implemented.length);
  assert.equal(summary.executed.length, implemented.length);
  assert.ok(summary.executed.every((entry) => entry.passed));
  assert.deepEqual(summary.blocked, ["cloudlink-shared-broker-attestation"]);
  assert.equal(summary.blocked_count, 1);
  assert.equal(summary.planned_count, 0);
});

test("runner compares complete outcomes instead of accepting expected subsets", async () => {
  const scenarioSet = await loadCoreScenarioSet();
  const narrowed = structuredClone(scenarioSet);
  const leadingZero = narrowed.scenarios.find(
    (scenario) => scenario.id === "uint64-leading-zero",
  );
  leadingZero.expected = { accepted: false };

  const summary = await runScenarioSet(narrowed);
  assert.equal(
    summary.executed.find((entry) => entry.id === "uint64-leading-zero")?.passed,
    false,
  );
});
