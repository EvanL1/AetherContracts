---
title: Get started with AetherContracts
description: Select the exact experimental release, navigate the contract layers, run the TCK, and adopt a digest-pinned consumer closure
updated: 2026-07-17
status: implemented
---

# Get started with AetherContracts

AetherContracts is the public interoperability authority shared by AetherEdge,
AetherCloud, and independent implementations. Start from an exact release and
keep its specification, Schemas, fixtures, TCK, and manifest together. A single
copied Schema or generated type is not a complete contract adoption.

The latest published release is `v0.1.0-alpha.3`. The repository currently
targets the unpublished `0.1.0-alpha.4` development version. Both are
experimental, keep legacy transport as the default, and are not production
CloudLink cutover releases.

## Choose the contract surface

| Need | Availability | Read or run first |
| --- | --- | --- |
| Common JSON, integer, canonicalization, and failure rules | Published alpha.3 and development target | [Foundation](../spec/foundation.md) |
| Thing Model structure and P/M/A migration | Published alpha.3 and development target | [Thing Model v1 alpha](../spec/thing-model-v1alpha1.md) |
| Delegated provider topology, typed state, and its explicit CloudLink extension | Unpublished alpha.4 development target | [Integration v1 alpha](../spec/integration-v1alpha1.md) and [integration task](integration.md) |
| Governed provider control | Unpublished alpha.4 development target; disabled by default | [Integration Control v1 alpha](../spec/integration-control-v1alpha1.md) |
| CloudLink messages, challenge-request lifecycle, and authentication proposal | Published alpha.3 baseline plus unpublished alpha.4 changes | [CloudLink v1 alpha](../spec/cloudlink-v1alpha1.md) |
| Release distribution and consumer locks | Published alpha.3 and development target | [Distribution v1 alpha](../spec/distribution-v1alpha1.md) |
| Executable conformance behavior | Version-specific | [TCK v1 alpha](../spec/tck-v1alpha1.md) |
| Current gates and product compatibility | Version-specific | [Compatibility](compatibility.md) |
| Binding and consumer evidence | Version-specific | [Conformance](conformance.md) |

Normative specifications define semantics. JSON Schemas define structural
acceptance. Fixtures pin examples and stable failure outcomes. The TCK proves
observable behavior. Language bindings implement that contract but never
become a second authority.

## Verify a source checkout

Use Node.js 24 and the repository-declared pnpm version:

```bash
git clone https://github.com/EvanL1/AetherContracts.git
cd AetherContracts
git checkout v0.1.0-alpha.3
corepack enable
pnpm install --frozen-lockfile
pnpm test:tck
```

`pnpm test:tck` is self-contained. It does not require a Broker, database,
cloud account, or edge device. Run `pnpm check` when changing the repository or
validating all TypeScript, Rust, C, and C++ binding foundations.

The checkout command above intentionally selects the latest immutable release.
To inspect alpha.4 development work, pin an exact source commit and describe it
as a candidate. Do not substitute a floating branch or a nonexistent release
tag.

## Adopt an exact release

Production-oriented consumers should not follow a floating branch or copy an
unverified subset. Commit a closed `aether-contracts.lock.json`, import the
exact required artifact closure, and run the release's composite verification
Action. The verifier checks the peeled release commit, manifest digest,
artifact hashes, adoption closure, and optional online release identity.

The checked-in consumer locks in AetherEdge and AetherCloud demonstrate this
distribution model for `v0.1.0-alpha.3`. Alpha.4 candidate evidence is
unpublished and does not upgrade authentication, durable acknowledgement, or
legacy cutover to production status.

## Select a binding

- [TypeScript](../packages/typescript/README.md)
- [Rust](../packages/rust/README.md)
- [C99](../packages/c/README.md)
- [C++17](../packages/cpp/README.md)

All four bindings execute the public fixture manifest. They are intentionally
narrow foundations rather than complete production transport codecs. Go, Java,
and Python bindings remain planned.

The shared-Broker authentication proposal is explicitly disabled by default.
Its challenge request is only a rate-limited trigger for an already
commissioned Gateway credential binding; it is not authentication evidence.

If an existing consumer still refers to the former edge repository name, read
the [AetherEdge naming migration](../MIGRATION.md). Package and protocol
identifiers remain stable.
