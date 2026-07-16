---
title: Get started with AetherContracts
description: Select the exact experimental release, navigate the contract layers, run the TCK, and adopt a digest-pinned consumer closure
updated: 2026-07-16
status: implemented
---

# Get started with AetherContracts

AetherContracts is the public interoperability authority shared by AetherEdge,
AetherCloud, and independent implementations. Start from an exact release and
keep its specification, Schemas, fixtures, TCK, and manifest together. A single
copied Schema or generated type is not a complete contract adoption.

The current release is `v0.1.0-alpha.3`. It is experimental, keeps legacy
transport as the default, and is not a production CloudLink cutover release.

## Choose the contract surface

| Need | Read or run first |
| --- | --- |
| Common JSON, integer, canonicalization, and failure rules | [Foundation](../spec/foundation.md) |
| Thing Model structure and P/M/A migration | [Thing Model v1 alpha](../spec/thing-model-v1alpha1.md) |
| CloudLink messages and lifecycle | [CloudLink v1 alpha](../spec/cloudlink-v1alpha1.md) |
| Release distribution and consumer locks | [Distribution v1 alpha](../spec/distribution-v1alpha1.md) |
| Executable conformance behavior | [TCK v1 alpha](../spec/tck-v1alpha1.md) |
| Current gates and product compatibility | [Compatibility](compatibility.md) |
| Binding and consumer evidence | [Conformance](conformance.md) |

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

## Adopt an exact release

Production-oriented consumers should not follow a floating branch or copy an
unverified subset. Commit a closed `aether-contracts.lock.json`, import the
exact required artifact closure, and run the release's composite verification
Action. The verifier checks the peeled release commit, manifest digest,
artifact hashes, adoption closure, and optional online release identity.

The checked-in consumer copies in AetherEdge and AetherCloud demonstrate this
distribution model. Their alpha.3 evidence does not upgrade authentication,
durable acknowledgement, or legacy cutover to production status.

## Select a binding

- [TypeScript](../packages/typescript/README.md)
- [Rust](../packages/rust/README.md)
- [C99](../packages/c/README.md)
- [C++17](../packages/cpp/README.md)

All four bindings execute the public fixture manifest. They are intentionally
narrow foundations rather than complete production transport codecs. Go, Java,
and Python bindings remain planned.

If an existing consumer still refers to the former edge repository name, read
the [AetherEdge naming migration](../MIGRATION.md). Package and protocol
identifiers remain stable.
