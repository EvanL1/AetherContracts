---
title: Conformance and consumer verification
description: Understand what the AetherContracts TCK proves, how bindings report evidence, and how consumers verify an exact release closure
updated: 2026-07-16
status: implemented
---

# Conformance and consumer verification

AetherContracts separates four kinds of evidence so that structural acceptance,
contextual behavior, language APIs, and product integration are not confused.

## Evidence layers

1. **Specification:** normative English semantics and lifecycle rules.
2. **Schema:** closed JSON Schema Draft 2020-12 structural acceptance.
3. **Fixture and TCK:** valid, invalid, migration, and contextual outcomes with
   stable public failure classes.
4. **Consumer evidence:** product-specific transport, persistence, restart,
   authentication, and fault behavior.

The first three layers belong to AetherContracts. The fourth belongs to each
consumer. A product cannot modify a local wire file and claim that it changes
the public contract.

## Run the language-neutral TCK

```bash
pnpm test:tck
```

The black-box runner validates bounded parsing, canonical integer behavior,
Thing Model migration, CloudLink fixture outcomes, contextual replay and cursor
rules, and manifest consistency. It is offline by default.

Read [TCK v1 alpha](../spec/tck-v1alpha1.md) for the runner contract and
[Foundation](../spec/foundation.md) for common failure semantics.

## Binding evidence

Each binding must execute the same public fixture manifest and report the same
contractual string failure class:

```bash
pnpm test:typescript
pnpm check:rust
pnpm check:c
```

The complete repository check also verifies packaging, the CMake installation,
sanitizer behavior, generated artifacts, and release hashes:

```bash
pnpm check
```

Passing these checks means the published alpha surface behaves consistently.
It does not claim that every binding is a complete production codec.

## Verify a consumer closure

A consumer lock identifies the exact release tag, peeled commit, manifest
digest, imported artifact set, and pending set. A complete consumer must import
the entire required closure with no pending artifacts.

The release composite Action and offline verifier reject:

- a tag or Action commit that does not match the lock;
- an archive with an unsafe or unexpected layout;
- a manifest, artifact, or imported byte with the wrong digest;
- an incomplete or extra adoption closure;
- a local authority file that attempts to override the public release.

Online verification authenticates the GitHub release identity before the same
local byte checks. Offline verification is the default for already imported
consumer trees and does not contact a registry, Broker, or cloud account.

## Product evidence remains separate

AetherEdge and AetherCloud add Real-Broker, restart, PostgreSQL, and fault
evidence in their own repositories. Those results may satisfy a release gate,
but they do not mutate the AetherContracts tag. Likewise, passing the public
TCK does not prove a product's key lifecycle, durable outbox transaction,
operational deployment, or rollback path.

Review [compatibility and release gates](compatibility.md) before calling an
implementation conformant or changing a legacy transport default.
