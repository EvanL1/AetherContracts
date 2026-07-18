---
title: Integrate delegated device providers
description: Use the provider-neutral topology and observation contract, including the experimental Home Assistant mapping
updated: 2026-07-17
status: experimental
---

# Integrate delegated device providers

Use `aether.integration` when AetherEdge connects to an existing local device
controller such as Home Assistant. The controller supplies registry and state
evidence; it does not become Cloud infrastructure and does not bypass the
edge's policy or physical-control boundary.

The integration starts with a complete topology snapshot:

```text
Integration
├── Area
├── Device
└── Entity
    ├── Point: current_temperature (float64)
    ├── Point: target_temperature (decimal)
    └── Point: hvac_mode (string)
```

An entity is not forced into one scalar. Each normalized point declares its
own type, kind, and optional unit. Observation batches bind to the exact
snapshot generation, so a renamed, removed, or newly discovered entity cannot
be interpreted against an unrelated catalog.

For Home Assistant, keep the registry entry id as stable `entity_id` and put
the current `domain.object_id` in `source_address`. A user rename changes the
address, not the stable identity. Map only bounded attributes that have
explicit point descriptors; never copy the arbitrary attribute object.

Use the quality rules literally:

- `good` and `uncertain` include a typed value.
- `bad` and `unavailable` include no value.
- a diagnostic may explain degraded evidence but must contain no credential or
  unbounded provider payload.

The Home Assistant URL and credentials remain in the AetherEdge secret store.
They do not appear in these documents, Cloud projections, audit payloads, or
agent prompts.

To project this evidence to AetherCloud, use the explicitly activated
`aether.cloudlink.integration.v1alpha1` extension. It wraps the complete public
topology or observation object unchanged. The authenticated outer session
supplies Gateway identity; the payload never contains a Home Assistant URL,
token, cookie, or credential reference.

Upgrade the Cloud consumer first, confirm that the current Runtime Manifest
declares the extension, and only then enable Edge publication. Base CloudLink
1.0 negotiation alone does not imply support. A topology is one atomic
replacement and must fit the 256 KiB complete-message limit. Do not split it.
Observation arrays may be partitioned into distinct batches before wrapping.

Validate a checkout with `pnpm test:tck`. Public Integration fixtures are under
`fixtures/integration/v1alpha1/`; their CloudLink wrappers and ACK examples are
under `fixtures/cloudlink-integration/v1alpha1/`.

Governed control is a separate, default-off contract. The first slice permits
only `device.power.set.v1` against the exact accepted topology generation,
stable entity, and Boolean `is_on` point. It requires explicit confirmation,
high-risk permission, expiry, idempotency, audit, and an edge-local final
decision. Public messages cannot select a Home Assistant domain or operation,
and cannot carry provider parameters, addresses, tokens, or arbitrary objects.
See `spec/integration-control-v1alpha1.md` and the fixtures under
`fixtures/integration-control/v1alpha1/`.

A successful Home Assistant response is recorded only as provider acceptance.
It is not proof that the physical device completed the requested change.
