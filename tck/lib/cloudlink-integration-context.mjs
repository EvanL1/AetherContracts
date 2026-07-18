import {
  evaluateIntegrationObservationContext,
  evaluateIntegrationTopologyContext,
} from "./integration-context.mjs";

const integrationMessageKinds = new Set([
  "integration-topology-snapshot",
  "integration-observation-batch",
]);

function rejection(failureCode) {
  return {
    accepted: false,
    failure_code: failureCode,
    state_changed: false,
    successful_receipt_permitted: false,
  };
}

function sameDeliveryIdentity(left, right) {
  return (
    left.gateway_id === right.gateway_id &&
    left.delivery.stream_id === right.delivery.stream_id &&
    left.delivery.stream_epoch === right.delivery.stream_epoch &&
    left.delivery.position === right.delivery.position
  );
}

function exactReplay(left, right) {
  return (
    sameDeliveryIdentity(left, right) &&
    left.delivery.batch_id === right.delivery.batch_id &&
    left.delivery.digest === right.delivery.digest
  );
}

function sameStreamBinding(left, right) {
  return (
    left.gateway_id === right.gateway_id &&
    left.stream_id === right.stream_id &&
    left.stream_epoch === right.stream_epoch &&
    left.message_kind === right.message_kind &&
    left.integration_id === right.integration_id
  );
}

export function integrationStreamBinding(envelope) {
  if (
    envelope === null ||
    typeof envelope !== "object" ||
    !integrationMessageKinds.has(envelope.message_kind) ||
    envelope.delivery === null ||
    typeof envelope.delivery !== "object" ||
    envelope.payload === null ||
    typeof envelope.payload !== "object"
  ) {
    throw new TypeError(
      "Integration stream binding requires a decoded Integration CloudLink envelope",
    );
  }
  return Object.freeze({
    gateway_id: envelope.gateway_id,
    stream_id: envelope.delivery.stream_id,
    stream_epoch: envelope.delivery.stream_epoch,
    message_kind: envelope.message_kind,
    integration_id: envelope.payload.integration_id,
  });
}

function evaluateTopology(candidate, acceptedTopologyDelivery) {
  const topologyContext = evaluateIntegrationTopologyContext(candidate.payload);
  if (!topologyContext.accepted) {
    return rejection(topologyContext.failure_code);
  }
  if (
    candidate.delivery.batch_id !==
    `topology-${candidate.payload.snapshot_generation}`
  ) {
    return rejection("BATCH_ID_MISMATCH");
  }
  if (acceptedTopologyDelivery === undefined) {
    return { accepted: true, state_changed: true };
  }
  if (exactReplay(candidate, acceptedTopologyDelivery)) {
    return { accepted: true, state_changed: false };
  }

  const candidateGeneration = BigInt(candidate.payload.snapshot_generation);
  const acceptedGeneration = BigInt(
    acceptedTopologyDelivery.payload.snapshot_generation,
  );
  if (candidateGeneration < acceptedGeneration) {
    return rejection("TOPOLOGY_GENERATION_STALE");
  }
  if (candidateGeneration === acceptedGeneration) {
    return rejection("TOPOLOGY_GENERATION_CONFLICT");
  }
  return { accepted: true, state_changed: true };
}

function evaluateObservations(
  candidate,
  acceptedTopologyDelivery,
  priorBatchDelivery,
) {
  if (candidate.delivery.batch_id !== candidate.payload.batch_id) {
    return rejection("BATCH_ID_MISMATCH");
  }
  if (acceptedTopologyDelivery === undefined) {
    return rejection("REFERENCE_NOT_FOUND");
  }
  if (
    acceptedTopologyDelivery.message_kind !==
      "integration-topology-snapshot" ||
    acceptedTopologyDelivery.gateway_id !== candidate.gateway_id
  ) {
    return rejection("REFERENCE_NOT_FOUND");
  }

  const candidateGeneration = BigInt(candidate.payload.snapshot_generation);
  const acceptedGeneration = BigInt(
    acceptedTopologyDelivery.payload.snapshot_generation,
  );
  if (candidate.payload.integration_id !== acceptedTopologyDelivery.payload.integration_id) {
    return rejection("REFERENCE_NOT_FOUND");
  }
  if (candidateGeneration < acceptedGeneration) {
    return rejection("TOPOLOGY_GENERATION_STALE");
  }
  if (candidateGeneration > acceptedGeneration) {
    return rejection("REFERENCE_NOT_FOUND");
  }

  const observationContext = evaluateIntegrationObservationContext(
    acceptedTopologyDelivery.payload,
    candidate.payload,
  );
  if (!observationContext.accepted) {
    return rejection(observationContext.failure_code);
  }

  if (
    priorBatchDelivery !== undefined &&
    priorBatchDelivery.gateway_id === candidate.gateway_id &&
    priorBatchDelivery.payload.integration_id === candidate.payload.integration_id &&
    priorBatchDelivery.payload.snapshot_generation ===
      candidate.payload.snapshot_generation &&
    priorBatchDelivery.payload.batch_id === candidate.payload.batch_id
  ) {
    if (exactReplay(candidate, priorBatchDelivery)) {
      return { accepted: true, state_changed: false };
    }
    return rejection("BATCH_ID_CONFLICT");
  }
  return { accepted: true, state_changed: true };
}

export function evaluateCloudLinkIntegrationContext(
  candidate,
  {
    expectedStreamBinding,
    acceptedTopologyDelivery,
    priorBatchDelivery,
  } = {},
) {
  const candidateBinding = integrationStreamBinding(candidate);
  if (
    expectedStreamBinding === undefined ||
    !sameStreamBinding(candidateBinding, expectedStreamBinding)
  ) {
    return rejection("STREAM_BINDING_CONFLICT");
  }

  if (candidate.message_kind === "integration-topology-snapshot") {
    return evaluateTopology(candidate, acceptedTopologyDelivery);
  }
  return evaluateObservations(
    candidate,
    acceptedTopologyDelivery,
    priorBatchDelivery,
  );
}
