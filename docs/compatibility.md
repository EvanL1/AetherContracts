---
title: AetherContracts compatibility and release gates
description: Distinguish the alpha.3 compatibility baseline from authentication, durability, and legacy-cutover gates that remain open
updated: 2026-07-16
status: mixed
---

# AetherContracts compatibility and release gates

Compatibility is evidence-based. Sharing a version string or successfully
decoding one fixture does not prove complete interoperability. The current
`v0.1.0-alpha.3` release freezes an experimental common contract while keeping
legacy transport as the default.

## Current product baseline

| Product | Contract relationship | Current status |
| --- | --- | --- |
| AetherEdge | Digest-pinned complete alpha.3 consumer; strict Rust codec and MQTT transport foundation | Experimental consumer evidence |
| AetherCloud | Digest-pinned complete alpha.3 consumer; strict TypeScript codec, MQTT ingress, and accepted-telemetry ACK slice | Experimental consumer evidence |
| Independent implementations | Exact release archive, closed consumer lock, public fixtures, and TCK | Supported distribution path; conformance must be proven by the consumer |

Both product consumers import the same required artifact closure and execute
the same public fixture outcomes. This proves distribution integrity and a
shared experimental core. It does not prove production identity, complete
state-machine behavior, crash durability, or safe legacy cutover.

## CloudLink gate status

| Gate | Status | Meaning |
| --- | --- | --- |
| Shared-Broker authentication | Proposal | The transcript is frozen, but production key provisioning, rotation, revocation, and verifier ownership are not implemented |
| Single wire contract | Experimental | Core envelope, time, identity, digest, and ACK semantics have one public authority |
| Cross-language fixtures | Passed, experimental | TypeScript, Rust, C, and C++ execute the same fixture manifest and stable failure classes |
| Real-Broker dual harness | Consumer evidence required | Products must prove concurrent edge and cloud behavior through application use cases |
| Fault injection | Consumer evidence required | Disconnect, ACK loss, restart, duplicate, conflict, and data-loss outcomes require product evidence |
| Signed durable ACK | Planned | The signing projection, key lifecycle, and production fact transaction remain open |
| Legacy cutover | Blocked | Every preceding gate must pass and rollback must remain available |

The machine-readable authority is
[`compatibility/cloudlink-v1alpha1-gates.json`](../compatibility/cloudlink-v1alpha1-gates.json).

## Binding compatibility

| Binding | Implemented alpha.3 surface | Not yet claimed |
| --- | --- | --- |
| TypeScript | Canonical `uint64`, JSON canonicalization, public fixture manifest | Complete production Schema and transport codec |
| Rust | Full-range canonical `u64`, typed failures, public fixture manifest | Complete production JSON, model, and transport codec |
| C99 | Bounded canonical `uint64`, allocation-free P/M/A lookup, bounded fixture profile | Complete production JSON, model, and transport codec |
| C++17 | Thin views and results over the C99 core | Independent wire semantics or a second codec |
| Go, Java, Python | Planned | No conformant binding is currently published |

Stable string failure codes are contractual. Numeric error values and message
text remain binding-specific. Read the machine-readable
[`compatibility/failure-codes.json`](../compatibility/failure-codes.json) before
mapping errors or retry behavior.

## Compatibility rules

- Protocol `uint64` values use canonical decimal strings.
- Core JSON objects are closed and reject unknown fields.
- Duplicate keys, invalid Unicode, unsafe numbers, and unbounded input fail
  closed.
- MQTT acknowledgement is transport evidence, never durable application
  acceptance.
- Thing Model capabilities are declarations, not authority grants.
- CloudLink contains no direct physical-control operation.
- A later encoding requires explicit negotiation and its own TCK.

Every future release should publish exact product versions or commits and link
to executable evidence. Floating `main`, `latest`, and implied compatibility
are not release evidence.
