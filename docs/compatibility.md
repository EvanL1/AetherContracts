---
title: AetherContracts compatibility and release gates
description: Distinguish the published alpha.3 baseline from the unpublished alpha.4 target and from authentication, durability, and legacy-cutover gates that remain open
updated: 2026-07-17
status: mixed
---

# AetherContracts compatibility and release gates

Compatibility is evidence-based. Sharing a version string or successfully
decoding one fixture does not prove complete interoperability. The latest
published release is `v0.1.0-alpha.3`. The repository's `0.1.0-alpha.4`
development target is unpublished, remains experimental, and keeps legacy
transport as the default.

## Current product baseline

| Product                     | Contract relationship                                                                                            | Current status                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| AetherEdge                  | Commit `947f9303810fa116afa9c4c301c5e388a181b332` contains a complete-consumer lock for `v0.1.0-alpha.3`         | Distribution-only evidence; alpha.4 adoption and product gates remain open |
| AetherCloud                 | Commit `8a14f7464bf67ce16b4e8cd473e0689cea7f1b13` contains a complete-consumer lock for `v0.1.0-alpha.3`         | Distribution-only evidence; alpha.4 adoption and product gates remain open |
| Independent implementations | Exact release archive, closed consumer lock, public fixtures, and TCK                                            | Supported distribution path; conformance must be proven by the consumer |

The matrix pins the public product commits that contain the two locks, and both
locks identify the same published alpha.3 artifact closure. They do not prove
alpha.4 adoption, production identity, complete state-machine behavior, crash
durability, or safe legacy cutover. The machine-readable product evidence is
[`compatibility/product-matrix.json`](../compatibility/product-matrix.json).

## Integration gate status

| Gate                        | Status                             | Meaning                                                                                                                                                                       |
| --------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider-neutral topology   | Experimental contract              | Full areas, devices, stable entities, current source addresses, and multi-point descriptors have closed Schemas and TCK evidence                                              |
| Typed observations          | Experimental contract              | Boolean, signed and unsigned integers, floating point, decimal, string, and bytes have frozen representations and contextual type checks                                      |
| Home Assistant mapping      | Experimental profile               | Registry identity, rename, quality, and edge-local secret rules are frozen; the product adapter is separate evidence                                                          |
| Governed control            | Experimental, default-off contract | One closed `device.power.set.v1` action has Schema and TCK evidence; arbitrary Home Assistant service calls remain forbidden and product implementation is separate evidence  |
| CloudLink transport         | Experimental extension             | Topology and observation objects are wrapped unchanged and reuse the existing session, position, digest, replay, data-loss, and durable-ACK semantics; activation is explicit |
| End-to-end product evidence | Required                           | Reconnect, restart, rename, deletion, stale generation, service error, timeout, and late state need product harnesses                                                         |

The machine-readable module statuses are
[`compatibility/integration-v1alpha1.json`](../compatibility/integration-v1alpha1.json)
and
[`compatibility/integration-control-v1alpha1.json`](../compatibility/integration-control-v1alpha1.json).

## CloudLink gate status

| Gate                                 | Status                                | Meaning                                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared-Broker authentication         | Proposal, default-off                 | The request → persisted challenge retry → hello → atomic one-time consumption transcript, exact delivery/heartbeat projections, heartbeat freshness, and conflict-safe replay are frozen; production key provisioning, rotation, revocation, and verifier ownership remain unimplemented |
| Signed correlated session acceptance | Planned for the next protocol version | Alpha.4 `session-accepted` is unsigned and carries neither `challenge_id` nor `client_nonce`, so it cannot exclude a delayed or replayed response from another handshake at the protocol layer                                                                                           |
| Single wire contract                 | Experimental                          | Core envelope, time, identity, digest, and ACK semantics have one public authority                                                                                                                                                                                                       |
| Integration extension rollout        | Experimental                          | Cloud upgrades first; base protocol 1.0 negotiation alone does not enable the new entry Schemas                                                                                                                                                                                          |
| Cross-language fixtures              | Passed, experimental                  | TypeScript, Rust, C, and C++ execute the same fixture manifest and stable failure classes                                                                                                                                                                                                |
| Real-Broker dual harness             | Consumer evidence required            | Products must prove concurrent edge and cloud behavior through application use cases                                                                                                                                                                                                     |
| Fault injection                      | Consumer evidence required            | Disconnect, ACK loss, restart, duplicate, conflict, and data-loss outcomes require product evidence                                                                                                                                                                                      |
| Signed durable ACK                   | Planned                               | The signing projection, key lifecycle, and production fact transaction remain open                                                                                                                                                                                                       |
| Legacy cutover                       | Blocked                               | Every preceding gate must pass and rollback must remain available                                                                                                                                                                                                                        |

The machine-readable authority is
[`compatibility/cloudlink-v1alpha1-gates.json`](../compatibility/cloudlink-v1alpha1-gates.json).

## Binding compatibility

| Binding          | Implemented alpha.4 surface                                                       | Not yet claimed                                      |
| ---------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| TypeScript       | Canonical `uint64`, JSON canonicalization, public fixture manifest                | Complete production Schema and transport codec       |
| Rust             | Full-range canonical `u64`, typed failures, public fixture manifest               | Complete production JSON, model, and transport codec |
| C99              | Bounded canonical `uint64`, allocation-free P/M/A lookup, bounded fixture profile | Complete production JSON, model, and transport codec |
| C++17            | Thin views and results over the C99 core                                          | Independent wire semantics or a second codec         |
| Go, Java, Python | Planned                                                                           | No conformant binding is currently published         |

Stable string failure codes are contractual. Numeric error values and message
text remain binding-specific. Read the machine-readable
[`compatibility/failure-codes.json`](../compatibility/failure-codes.json) before
mapping errors or retry behavior.

## Compatibility rules

- Protocol `uint64` values use canonical decimal strings.
- Integration observed `int64`, decimal, and bytes values use their profile's
  bounded canonical strings.
- Integration display and evidence text is nonblank and excludes C0 controls
  and DEL.
- Core JSON objects are closed and reject unknown fields.
- Duplicate keys, invalid Unicode, unsafe numbers, and unbounded input fail
  closed.
- A session challenge request uses the existing `up/session` route, is not
  authentication evidence, and cannot cause challenge issuance unless its
  Gateway credential binding is actively commissioned and the request passes
  rate limiting.
- An unexpired challenge retry republishes the exact persisted challenge;
  challenge consumption and session acceptance commit atomically exactly once.
- Challenge validity is strict: `evaluation_time_ms < expires_at_ms`, so
  equality is expired.
- Gateway-signed deliveries and heartbeats use separate exact
  `aether.cloudlink.uplink-signing.v1alpha1` projections. A missing delivery
  expiry and all six heartbeat-only absent delivery values map to JSON null.
- A signed heartbeat binds the active key, accepted session, credential
  generation, and negotiated heartbeat interval before freshness or replay
  evaluation. Its explicit future and stale boundaries use checked uint64
  arithmetic, and an exact replay never refreshes server liveness.
- Gateway-signed delivery replay persists the four-field position identity, one
  session-independent immutable digest, and one current-session binding. An
  exact same-session replay or a strictly higher current session epoch may
  recover the current-session receipt without repeating a business effect.
  Same-epoch session changes, epoch rollback, generation changes, and immutable
  delivery changes fail authentication.
- Only a replay record atomically committed with its business effect may bypass
  the original expiry. A pending authentication record cannot. The first
  effect remains expiry-gated, while an already committed exact delivery may
  update its current-session binding after expiry; that binding becomes durable
  before the receipt is reissued.
- Each MQTT prefix is an authorization namespace. A Gateway identifier is
  unique within it, multi-tenant deployments isolate tenant/project prefixes
  or use Cloud-global Gateway identifiers, and each Broker principal is scoped
  to one exact namespace and Gateway topic set. Prefix and topic remain
  insufficient authentication evidence. Durable delivery lookup first selects
  this trusted namespace partition and then uses the unchanged four-field wire
  replay identity; global unpartitioned and cross-namespace record reuse are
  forbidden.
- Alpha.4 `session-accepted` is unsigned and uncorrelated to its challenge and
  client request. Signed, cross-handshake-safe acceptance is a next-version
  production gate rather than an implied alpha.4 guarantee.
- Integration Control receipt `failure_code` values are bounded to 128
  characters.
- MQTT acknowledgement is transport evidence, never durable application
  acceptance.
- Thing Model capabilities are declarations, not authority grants.
- CloudLink contains no direct physical-control operation.
- A later encoding requires explicit negotiation and its own TCK.
- An alpha.3 CloudLink consumer rejects alpha.4 Integration message kinds;
  mixed deployments keep the extension disabled instead of probing with data.

Every future release should publish exact product versions or commits and link
to executable evidence. Floating `main`, `latest`, and implied compatibility
are not release evidence.
