# AetherContracts Agent Instructions

This repository is the public, language-neutral authority for Aether
interoperability contracts shared by AetherCloud, AetherIot, and independent
implementations.

## Authority

- Normative English specifications define protocol behavior and safety rules.
- JSON Schema Draft 2020-12 defines structural JSON acceptance.
- Fixtures and the black-box TCK define executable conformance evidence.
- Language bindings implement the contract; they never redefine it.
- A release is invalid when specification, Schema, fixture, TCK, or binding
  behavior disagrees.

## Safety boundaries

- AetherIot and other commissioned edge runtimes remain authoritative for live
  point state, deterministic rules, safety interlocks, and physical control.
- CloudLink is not arbitrary RPC and contains no direct SHM, register, or
  physical-control operation.
- Desired, Reported, and Applied are separate facts.
- MQTT acknowledgement is transport evidence, never an application durable
  receipt.
- Generic shared-Broker identity requires a jointly specified replay-bounded
  authentication profile. Topic and payload identity are never authentication.
- Legacy transports remain the default until every published interoperability
  gate has passed.

## Contract formats

- Use UTF-8 JSON and closed JSON Schemas for the v1 wire and Thing Model.
- Encode protocol `uint64` values as canonical decimal strings. Do not invent
  signed `int64` wire semantics before its profile and TCK are frozen.
- Hash and sign only a precisely specified RFC 8785 canonical object.
- Reject duplicate JSON keys, invalid Unicode, unknown core fields, unsafe
  numbers, and unbounded input.
- Optional future encodings require explicit negotiation and their own TCK.

## Language bindings

- Keep bindings free of MQTT clients, HTTP frameworks, databases, cloud SDKs,
  edge runtimes, and product application logic.
- C is a first-class binding. Keep the core caller-owned, bounded, and usable
  without filesystem, network, threads, exceptions, or global mutable state.
- C++ wraps the C contract core and does not implement a second wire contract.
- Generated files are changed through their generator, never by hand.
- Stable failure codes are contractual; language-specific error text is not.

## Change workflow

1. Add or change an observable conformance test first.
2. Run the narrow test and confirm the intended failure.
3. Implement the smallest conforming change.
4. Run the narrow test, then the repository-wide checks.
5. Update specification, Schema, fixtures, manifest, and status documentation
   together.
6. Do not mark a binding or profile conformant without complete TCK evidence.

Default checks must not require a Broker, cloud account, database, or device.
