# AetherContracts

AetherContracts is the public, language-neutral interoperability authority for
AetherCloud, AetherIot, and independent implementations. Specifications define
semantics, JSON Schema Draft 2020-12 defines structure, fixtures pin examples,
and the TCK supplies executable evidence. A language binding never becomes a
second source of truth.

The current release is `0.1.0-alpha.2`. It is experimental and is not a
production CloudLink cutover release.

## Current status

| Capability | Status | Evidence |
| --- | --- | --- |
| Thing Model v1 alpha structure | Implemented, experimental | Schema, Voltage migration golden fixture, TCK |
| P/M/A migration vocabulary | Implemented, experimental | `P -> properties`, `M -> points`, `A -> capabilities` |
| CloudLink joint core schemas and fixtures | Imported, experimental | Byte-identical files from both product worktrees; provenance records that the source changes were uncommitted |
| Fixture and release hash checks | Implemented | `pnpm test:tck` |
| Digest-pinned consumer distribution | Implemented, experimental | Closed lock Schema, offline verifier, exact-release CI Action |
| Wire structural rejection | Implemented | JSON Schema TCK; exact failure-code/path mapping is planned |
| Minimal context reducer | Implemented, experimental | Replay/session/digest/data-loss/cursor scenarios; not a production state machine |
| TypeScript, Rust, C, C++ bindings | Experimental | Binding packages; conformance is not yet claimed |
| Shared-Broker authentication transcript | Proposal | No frozen signing bytes or production profile |
| Signed crash-durable ACK | Planned | Requires production transaction/outbox evidence |
| Real-Broker dual harness and fault injection | Planned | Legacy transport remains the default |

Binding foundations are intentionally narrow:

| Binding | Implemented now | Still planned |
| --- | --- | --- |
| TypeScript | canonical `uint64`, RFC 8785-compatible JSON canonicalization | full Schema/CloudLink runner |
| Rust | canonical full-range `u64`, typed failure | JSON/model/CloudLink codec |
| C99 | bounded canonical `uint64`, allocation-free static P/M/A lookup | JSON/model compiler/CloudLink codec |
| C++17 | thin views/results over the C99 core | independent functionality is deliberately forbidden |

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

No default test requires a Broker, database, cloud account, or device.

GitHub tags, release bundles, and published SHA-256 checksums are the source
distribution path.
Language package registries may mirror generated bindings after conformance;
Cloudflare may cache release bytes but is never contract authority. Consumers
should commit a closed consumer lock plus the exact release manifest; the
default path verifies imported bytes offline. Git submodules are optional for
firmware vendors that require a complete source checkout, not the default
integration model.

The initial joint-core import came from modified, uncommitted AetherCloud and
AetherIot worktrees. The importer rejected every non-identical source pair, and
the resulting bytes are pinned here, but those product-repository HEADs alone
cannot reproduce the import. This limitation is explicit in
`compatibility/cloudlink-joint-core-provenance.json`; after this first release,
both products must consume the tagged AetherContracts bytes rather than act as
co-authorities.
