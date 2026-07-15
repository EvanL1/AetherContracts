# AetherContracts invariants

- English specifications, JSON Schemas, fixtures, and the TCK are authoritative
  together; no language binding may redefine the contract.
- The edge remains authoritative for live point state and physical execution.
- A capability is a deny-by-default declaration and never a direct command.
- Desired, Reported, and Applied are different facts.
- MQTT acknowledgement is not an application durable receipt.
- CloudLink wire semantics have one authority: this repository's normative
  spec, schemas, profiles, fixtures, failure taxonomy, and TCK. Product-local
  files are non-authoritative implementation/readiness/evidence overlays.
- Shared-Broker origin uses exactly one declared model: Gateway signatures or
  trusted-adapter evidence outside the payload. Topic, payload identity, and
  MQTT credentials alone never authenticate a Gateway.
- The alpha.3 authentication transcript is experimental until production key
  provisioning, rotation, revocation, and verifier ownership exist.
- CloudLink legacy remains the default until all published gates pass.
- Frozen protocol `uint64` values use canonical decimal strings; signed
  `int64` wire semantics remain planned until their profile and TCK exist.
- Unknown core fields, duplicate JSON keys, and conflicting digests fail closed.
- Replay identity is `(gateway_id, stream_id, stream_epoch, position)`;
  `batch_id` and `digest` are stable bindings and never extend that identity.
- The alpha.3 application ACK is unsigned. Production signed ACK and
  crash-durable restart claims remain planned until separate evidence exists.
- Generated bindings may not add MQTT, HTTP, database, or runtime authority.
- Consumer locks use exact release URLs and digests; they never follow `main`,
  `latest`, or a version range and never fall back to a sibling checkout.
- Distribution conformance proves byte identity only. Codec, state-machine,
  authentication, durable-ACK, and real-Broker conformance require separate
  evidence.
