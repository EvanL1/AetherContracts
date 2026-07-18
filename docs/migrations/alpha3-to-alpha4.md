---
title: Migrate from alpha.3 to the alpha.4 development target
description: Preserve the published alpha.3 baseline while preparing Cloud-first decoding, explicitly activated Integration, governed control, evidence gates, and rollback for alpha.4
updated: 2026-07-18
status: planned
---

# Migrate from alpha.3 to the alpha.4 development target

- Latest published release: `v0.1.0-alpha.3`.
- Development target: `0.1.0-alpha.4`.
- Production readiness: false.
- Default transport mode: legacy.

There is no immutable `v0.1.0-alpha.4` release tag yet. Consumers must not pin,
download, or claim conformance to alpha.4 as a published release. Development
work may verify a candidate snapshot, but that evidence must identify the exact
source commit or candidate digest and must not be described as release
conformance.

## Contract changes under development

The alpha.4 target keeps the alpha.3 core identity and adds explicitly
negotiated surfaces:

- provider-neutral Integration topology snapshots and typed observations;
- an Integration CloudLink extension that reuses the existing session,
  position, digest, replay, data-loss, and durable-ACK semantics;
- a separately activated Integration Control extension whose first closed
  action is `device.power.set.v1`;
- stricter challenge, heartbeat, replay, namespace partition, expiry, and ACK
  recovery rules for the default-off authentication proposal.

Alpha.3 consumers correctly reject the new alpha.4 Integration entry kinds.
Base CloudLink protocol negotiation does not activate either extension.
Provider credentials remain edge-local, provider acceptance is not physical
completion, and Integration Control remains disabled by default.

## Cloud-first rollout

1. Keep every commissioned product on its exact `v0.1.0-alpha.3` consumer lock
   and keep legacy transport enabled.
2. Add alpha.4 candidate decoding and rejection tests to AetherCloud without
   enabling new message publication from AetherEdge.
3. Run the language-neutral TCK and product-owned persistence, restart,
   duplicate, stale-generation, rename, deletion, timeout, and fault evidence.
4. Add the same exact candidate closure to AetherEdge, still with Integration
   and Integration Control disabled by default.
5. Enable read-only Integration only after Cloud accepts the exact extension
   profile and reconnect or replay evidence passes.
6. Keep Integration Control disabled until Cloud offer-key provisioning,
   rotation, revocation, Edge verifier ownership, persistent replay binding,
   policy, confirmation, audit, and end-to-end provider error evidence exist.
7. Replace candidate pins with the immutable `v0.1.0-alpha.4` tag, release
   manifest, and bundle digest only after that release is actually published.

Passing repository fixtures does not satisfy product-owned Broker, database,
restart, or physical-device evidence. Record those results against exact
product commits before changing any compatibility claim.

## Rollback

Disable Integration and Integration Control extension activation first. Stop
new extension publication, retain the legacy transport path, and drain or
quarantine extension-specific pending work without advancing a durable ACK
across an undeclared gap.

Do not reinterpret alpha.4 extension payloads as alpha.3 core messages. Do not
rewrite immutable alpha.3 release bytes. If a product must return to the
published baseline, restore its exact `v0.1.0-alpha.3` consumer lock and verify
the complete imported closure offline.

Rollback does not authorize deleting unresolved spool positions, accepting a
changed replay digest, bypassing expiry, or representing provider acceptance as
physical completion.

## Evidence required before publication

- a real `v0.1.0-alpha.4` annotated tag and immutable release bundle;
- matching specification, Schema, fixture, TCK, binding, manifest, and hash
  evidence;
- exact AetherEdge and AetherCloud consumer locks tied to product commits;
- Cloud-first decode and reject evidence;
- reconnect, restart, duplicate, conflict, data-loss, rename, deletion, stale
  generation, provider error, timeout, and late-state evidence;
- rollback evidence that preserves legacy behavior and the edge's final
  physical-control authority.

Review the [product evidence matrix](../../compatibility/product-matrix.json),
[compatibility gates](../compatibility.md), and
[conformance boundaries](../conformance.md) before changing status.
