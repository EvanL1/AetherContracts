# AetherContracts

AetherContracts is the public, language-neutral interoperability authority for
AetherCloud, AetherIot, and independent implementations. Specifications define
semantics, JSON Schema Draft 2020-12 defines structure, fixtures pin examples,
and the TCK supplies executable evidence. A language binding never becomes a
second source of truth.

The current release is `0.1.0-alpha.3`. It is experimental and is not a
production CloudLink cutover release.

## Current status

| Capability | Status | Evidence |
| --- | --- | --- |
| Thing Model v1 alpha structure | Implemented, experimental | Schema, Voltage migration golden fixture, TCK |
| P/M/A migration vocabulary | Implemented, experimental | `P -> properties`, `M -> points`, `A -> capabilities` |
| CloudLink alpha.3 wire/profile/TCK | Frozen, experimental | AetherContracts is the sole authority; product files are non-authoritative overlays |
| Fixture and release hash checks | Implemented | `pnpm test:tck` |
| Digest-pinned consumer distribution | Implemented, experimental | Closed lock Schema, offline verifier, exact-release CI Action |
| Wire structural rejection | Implemented | JSON Schema TCK and stable public fixture results in all four bindings |
| Minimal context reducer | Implemented, experimental | Replay/session/digest/data-loss/cursor scenarios; not a production state machine |
| TypeScript, Rust, C, C++ fixture bindings | Implemented, experimental | Every binding executes the same public fixture manifest; production codec conformance is not claimed |
| Shared-Broker authentication transcript | Proposal | Two origin models and exact signing objects; production key lifecycle and verifier ownership remain planned |
| Unsigned application durable ACK | Frozen experimental contract | No production crash-durability claim; signed ACK remains planned |
| Consumer Real-Broker harness and fault matrix | Consumer evidence | Not release or production durability evidence; legacy remains the default |

Binding foundations are intentionally narrow:

| Binding | Implemented now | Still planned |
| --- | --- | --- |
| TypeScript | canonical `uint64`, RFC 8785-compatible JSON canonicalization, public CloudLink fixture manifest | complete production Schema/transport codec |
| Rust | canonical full-range `u64`, typed failure, public CloudLink fixture manifest | complete production JSON/model/transport codec |
| C99 | bounded canonical `uint64`, allocation-free static P/M/A lookup, bounded public fixture profile | complete production JSON/model/transport codec |
| C++17 | thin views/results and the C99 fixture profile | independent wire semantics are deliberately forbidden |

## Safety boundary

The edge is authoritative for live point state, deterministic rules, safety
interlocks, and physical execution. Thing Model capabilities are declarations,
not authority grants. They are deny-by-default, run only through a governed job,
and remain subject to the edge's final decision.

CloudLink is not arbitrary RPC. It has no direct SHM, register, or physical
control operation. MQTT PUBACK is transport evidence and never proves that a
Cloud business fact is durably committed.

## Repository map

- `spec/`: normative English semantics and lifecycle rules.
- `schemas/`: closed JSON Schemas for Thing Model, CloudLink, distribution, and TCK data.
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

The historical alpha.2 joint-core import came from modified, uncommitted AetherCloud and
AetherIot worktrees. The importer rejected every non-identical source pair, and
the resulting bytes are pinned here, but those product-repository HEADs alone
cannot reproduce the import. This limitation is explicit in
`compatibility/cloudlink-joint-core-provenance.json`. AetherContracts is now the
only wire authority; both products consume the tagged bytes and keep only
implementation/readiness/evidence overlays.
