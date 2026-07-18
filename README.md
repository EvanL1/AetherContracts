# AetherContracts

[中文说明](README-CN.md)

**Documentation website:** [docs.aetheriot.workers.dev/en/aethercontracts](https://docs.aetheriot.workers.dev/en/aethercontracts/)

AetherContracts is the public, language-neutral interoperability authority for
AetherCloud, AetherEdge, and independent implementations. Specifications define
semantics, JSON Schema Draft 2020-12 defines structure, fixtures pin examples,
and the TCK supplies executable evidence. A language binding never becomes a
second source of truth.

The latest published release is `v0.1.0-alpha.3`. The current source tree
targets the unpublished `0.1.0-alpha.4` development version. Both are
experimental; neither is a production CloudLink cutover release.

## Current status

| Capability                                     | Status                                         | Evidence                                                                                                                                                                       |
| ---------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Thing Model v1 alpha structure                 | Implemented, experimental                      | Schema, Voltage migration golden fixture, TCK                                                                                                                                  |
| P/M/A migration vocabulary                     | Implemented, experimental                      | `P -> properties`, `M -> points`, `A -> capabilities`                                                                                                                          |
| Integration v1 alpha topology and observations | Implemented, experimental contract             | Closed Schemas, Home Assistant golden fixtures/profile, contextual TCK                                                                                                         |
| Integration over CloudLink                     | Implemented, experimental extension            | Unchanged payload wrappers, explicit activation, stream/generation/batch/replay/ACK TCK                                                                                        |
| Governed Integration Control                   | Implemented, experimental default-off contract | One closed power-set action, exact topology target, confirmation, replay, receipt, and safety TCK                                                                              |
| CloudLink alpha.4 wire/profile/TCK             | Frozen, experimental                           | AetherContracts is the sole authority; product files are non-authoritative overlays                                                                                            |
| Fixture and release hash checks                | Implemented                                    | `pnpm test:tck`                                                                                                                                                                |
| Digest-pinned consumer distribution            | Implemented, experimental                      | Closed lock Schema, offline verifier, exact-release CI Action                                                                                                                  |
| Existing CloudLink wire structural rejection   | Implemented                                    | JSON Schema TCK and stable public fixture results in all four bindings                                                                                                         |
| Minimal context reducer                        | Implemented, experimental                      | Replay/session/digest/data-loss/cursor scenarios; not a production state machine                                                                                               |
| TypeScript, Rust, C, C++ fixture bindings      | Implemented, experimental                      | Every binding executes the same public fixture manifest; production codec conformance is not claimed                                                                           |
| Shared-Broker authentication transcript        | Proposal, default-off                          | Closed challenge request, exact delivery/heartbeat projections, bounded heartbeat replay, committed-delivery rebind and ACK recovery; production key lifecycle remains planned |
| Signed correlated session acceptance           | Planned for the next protocol version          | Alpha.4 response is unsigned and cannot bind `challenge_id` or `client_nonce`; delayed and cross-handshake replay remains a production blocker                                 |
| Unsigned cumulative application durable ACK    | Frozen experimental contract                   | Contiguous-prefix and declared-loss TCK; no production crash-durability claim; signed ACK remains planned                                                                      |
| Consumer Real-Broker harness and fault matrix  | Consumer evidence                              | Not release or production durability evidence; legacy remains the default                                                                                                      |

Binding foundations are intentionally narrow:

| Binding    | Implemented now                                                                                  | Still planned                                         |
| ---------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| TypeScript | canonical `uint64`, RFC 8785-compatible JSON canonicalization, public CloudLink fixture manifest | complete production Schema/transport codec            |
| Rust       | canonical full-range `u64`, typed failure, public CloudLink fixture manifest                     | complete production JSON/model/transport codec        |
| C99        | bounded canonical `uint64`, allocation-free static P/M/A lookup, bounded public fixture profile  | complete production JSON/model/transport codec        |
| C++17      | thin views/results and the C99 fixture profile                                                   | independent wire semantics are deliberately forbidden |

## Safety boundary

The edge is authoritative for live point state, deterministic rules, safety
interlocks, and physical execution. Thing Model capabilities are declarations,
not authority grants. They are deny-by-default, run only through a governed job,
and remain subject to the edge's final decision.

Core CloudLink is not arbitrary RPC. It has no direct SHM, register, or
physical-control operation. The independent Integration Control extension is
disabled by default and exposes only the governed `device.power.set.v1`
semantic action. It cannot carry a caller-selected Home Assistant domain,
service, service data, URL, token, or arbitrary JSON. Edge policy remains the
final execution authority, and provider acceptance never proves physical
completion. MQTT PUBACK is transport evidence and never proves that a Cloud
business fact is durably committed.

The gateway-signed authentication proposal begins with a rate-limited
`session-challenge-request` on the existing `up/session` route. It is only a
trigger for an already commissioned active credential binding, never identity
evidence. Cloud persists a challenge before publication, republishes that exact
challenge on retry, and atomically consumes it exactly once with session
acceptance. Delivery and heartbeat uplinks have separate exact signing
projections. Heartbeat freshness uses the accepted session's negotiated
interval and explicit evaluation time; exact replay never refreshes liveness,
and a delivery stores one session-independent immutable digest plus one current
session binding. An exact replay or strictly higher active session epoch can
recover a lost current-session receipt without repeating the business effect.
Only a replay record atomically committed with that effect may bypass the
original expiry; pending authentication state cannot. Send time, expiry,
generation, kind, batch, and business digest remain immutable across retries
and restarts. The proposal remains disabled by default.

An MQTT prefix is an authorization namespace. Gateway identifiers are unique
within one namespace, multi-tenant deployments isolate tenant/project prefixes
or use Cloud-global Gateway identifiers, and Broker principals receive only the
exact namespace and Gateway topics they need. Prefixes and topics are not
Gateway authentication. Cloud partitions durable replay records by this
trusted namespace before applying the unchanged four-field wire identity;
cross-namespace or global unpartitioned lookup is forbidden. Alpha.4
`session-accepted` is unsigned and carries no challenge or client-nonce
correlation, so a signed correlated response remains a next-version production
gate alongside the signed durable ACK.

Integration snapshots and observations carry normalized provider evidence, not
provider credentials or direct service calls. Home Assistant URLs and tokens
stay edge-local. The CloudLink Integration extension authenticates the Gateway
through the outer session and carries the public payload unchanged. Provider
state does not independently prove physical actuation.

## Repository map

- `spec/`: normative English semantics and lifecycle rules.
- `schemas/`: closed JSON Schemas for Thing Model, Integration, CloudLink, distribution, and TCK data.
- `profiles/`: transport and standards-alignment profiles.
- `fixtures/`: valid, invalid, contextual, migration, and golden examples.
- `compatibility/`: failure taxonomy and compatibility gates.
- `tck/`: language-neutral scenarios and repository contract tests.
- `scripts/verify-consumer-lock.mjs`: offline-by-default consumer release verifier.
- `packages/`: experimental language bindings; not normative.
- `contract-manifest.json`: release identity and artifact hashes.

Run the self-contained contract checks with:

```sh
pnpm test:tck
```

Run all current bindings and packaging checks with `pnpm check`. C/C++
consumers may install the CMake project and link `AetherContracts::c` or
`AetherContracts::cpp`.

No default release test requires a Broker, database, cloud account, or device.
Real-Broker and restart evidence belongs to consumers and cannot upgrade this
release's production status.

GitHub tags, release bundles, and published SHA-256 checksums are the source
distribution path.
Language package registries may mirror generated bindings after conformance;
Cloudflare may cache release bytes but is never contract authority. Consumers
should commit a closed consumer lock plus the exact release manifest; the
default path verifies imported bytes offline. Git submodules are optional for
firmware vendors that require a complete source checkout, not the default
integration model.

The historical alpha.2 joint-core import came from modified, uncommitted
AetherCloud and AetherEdge worktrees, while the edge repository was still named
AetherIot. The importer rejected every non-identical source pair, and
the resulting bytes are pinned here, but those product-repository HEADs alone
cannot reproduce the import. This limitation is explicit in
`compatibility/cloudlink-joint-core-provenance.json`. AetherContracts is now the
only wire authority; both products consume the tagged bytes and keep only
implementation/readiness/evidence overlays.
