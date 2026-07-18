function hasDuplicate(values) {
  return new Set(values).size !== values.length;
}

function topologyIdentityConflict(topology) {
  if (
    hasDuplicate(topology.areas.map((area) => area.area_id)) ||
    hasDuplicate(topology.devices.map((device) => device.device_id)) ||
    hasDuplicate(topology.entities.map((entity) => entity.entity_id)) ||
    hasDuplicate(topology.entities.map((entity) => entity.source_address))
  ) {
    return true;
  }

  return topology.entities.some((entity) =>
    hasDuplicate(entity.points.map((point) => point.point_key)),
  );
}

function topologyHasDanglingReference(topology) {
  const areaIds = new Set(topology.areas.map((area) => area.area_id));
  const deviceIds = new Set(topology.devices.map((device) => device.device_id));

  if (
    topology.devices.some(
      (device) => device.area_id !== undefined && !areaIds.has(device.area_id),
    )
  ) {
    return true;
  }

  return topology.entities.some(
    (entity) =>
      (entity.area_id !== undefined && !areaIds.has(entity.area_id)) ||
      (entity.device_id !== undefined && !deviceIds.has(entity.device_id)),
  );
}

export function evaluateIntegrationTopologyContext(topology) {
  if (topologyIdentityConflict(topology)) {
    return { accepted: false, failure_code: "IDENTITY_CONFLICT" };
  }
  if (topologyHasDanglingReference(topology)) {
    return { accepted: false, failure_code: "REFERENCE_NOT_FOUND" };
  }
  return { accepted: true };
}

export function evaluateIntegrationObservationContext(topology, batch) {
  const topologyContext = evaluateIntegrationTopologyContext(topology);
  if (!topologyContext.accepted) {
    return topologyContext;
  }
  if (
    batch.integration_id !== topology.integration_id ||
    batch.snapshot_generation !== topology.snapshot_generation
  ) {
    return { accepted: false, failure_code: "REFERENCE_NOT_FOUND" };
  }

  const pointsByEntity = new Map(
    topology.entities.map((entity) => [
      entity.entity_id,
      new Map(entity.points.map((point) => [point.point_key, point])),
    ]),
  );

  for (const observation of batch.observations) {
    const descriptor = pointsByEntity
      .get(observation.entity_id)
      ?.get(observation.point_key);
    if (descriptor === undefined) {
      return { accepted: false, failure_code: "REFERENCE_NOT_FOUND" };
    }

    const carriesValue = observation.value !== undefined;
    const valueRequired =
      observation.quality === "good" || observation.quality === "uncertain";
    if (carriesValue !== valueRequired) {
      return {
        accepted: false,
        failure_code: "OBSERVATION_VALUE_INVALID",
      };
    }
    if (carriesValue && observation.value.type !== descriptor.value_type) {
      return { accepted: false, failure_code: "VALUE_TYPE_MISMATCH" };
    }
  }

  return { accepted: true };
}
