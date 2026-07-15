# AetherContracts invariants

- English specifications, JSON Schemas, fixtures, and the TCK are authoritative
  together; no language binding may redefine the contract.
- The edge remains authoritative for live point state and physical execution.
- A capability is a deny-by-default declaration and never a direct command.
- Desired, Reported, and Applied are different facts.
- MQTT acknowledgement is not an application durable receipt.
- Shared-Broker publisher identity is unresolved until one replay-bounded
  attestation profile and its fixtures are frozen.
- CloudLink legacy remains the default until all published gates pass.
- Frozen protocol `uint64` values use canonical decimal strings; signed
  `int64` wire semantics remain planned until their profile and TCK exist.
- Unknown core fields, duplicate JSON keys, and conflicting digests fail closed.
- Generated bindings may not add MQTT, HTTP, database, or runtime authority.
