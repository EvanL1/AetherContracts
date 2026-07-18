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
- The alpha.4 authentication transcript is experimental until production key
  provisioning, rotation, revocation, and verifier ownership exist.
- Its default-off challenge request is a rate-limited trigger only for an
  active commissioned Gateway credential binding, never identity evidence.
- Cloud persists a challenge before publication, retries the exact persisted
  bytes while unexpired, and atomically consumes it exactly once with session
  acceptance; equality with `expires_at_ms` is expired.
- Gateway-signed delivery and heartbeat uplinks use separate exact signing
  projections. Heartbeat freshness binds the accepted session's negotiated
  interval and explicit evaluation time, checked uint64 arithmetic fails
  closed, and exact replay never refreshes liveness.
- A committed signed delivery persists one session-independent immutable
  digest and one current-session binding. Same-session exact replay and a
  strictly higher active session epoch repeat no business effect; same-epoch
  session changes, rollback, generation changes, or immutable changes fail
  authentication.
- A delivery replay record is committed state only when its business effect and
  replay record are atomically durable. Pending authentication state never
  bypasses first-acceptance expiry. A rebind is durable before a
  current-session receipt is reissued.
- MQTT `{prefix}` is an authorization namespace with unique Gateway identity
  and exact principal topic scope. Prefix and topic are never authentication.
- Durable replay lookup uses that trusted namespace as an external partition
  before the unchanged four-field wire identity. Payload-selected,
  cross-namespace, and global unpartitioned lookup are forbidden.
- Alpha.4 `session-accepted` is unsigned and does not bind `challenge_id` or
  `client_nonce`; signed cross-handshake correlation is a next-version
  production gate.
- CloudLink legacy remains the default until all published gates pass.
- Frozen protocol `uint64` values use canonical decimal strings. Integration
  v1 alpha 1 observed `int64` values use the profile's bounded canonical signed
  decimal string; that representation does not silently extend to other
  modules.
- Integration topology and observations contain no provider URL, credential,
  token, arbitrary attribute bag, or direct service call.
- The CloudLink Integration extension carries the public payload unchanged,
  uses authenticated outer Gateway identity, and is not enabled by base
  protocol 1.0 negotiation alone.
- The Integration Control extension is independent and disabled by default.
  Its first version exposes only `device.power.set.v1`, binds an exact topology
  generation, entity, and Boolean `is_on` point, and never carries a provider
  domain, service, service data, URL, token, or arbitrary JSON.
- Integration Control governance is fixed to deny by default, high risk,
  explicit confirmation, required idempotency, expiry, and audit, with edge
  local policy as final authority.
- Home Assistant request acceptance is only `provider-accepted`; it never
  becomes physical completion or successful physical execution.
- One Integration stream epoch is immutably bound to one Gateway, message kind,
  and Integration identity. Topology generation and observation batch
  identities cannot move to a new durable position.
- An integration entity may expose multiple typed points. Observation batches
  bind the exact integration, topology generation, entity, point, value type,
  and quality/value relationship before state changes or receipts are allowed.
- Unknown core fields, duplicate JSON keys, and conflicting digests fail closed.
- Replay identity is `(gateway_id, stream_id, stream_epoch, position)`;
  `batch_id` and `digest` are stable bindings and never extend that identity.
- The alpha.4 application ACK is unsigned. Production signed ACK and
  crash-durable restart claims remain planned until separate evidence exists.
- A durable ACK position is the highest contiguous resolved prefix in one
  stream epoch. Out-of-order persistence cannot advance across an undeclared
  gap; a valid accepted data-loss range may resolve an intermediate gap.
- Generated bindings may not add MQTT, HTTP, database, or runtime authority.
- Consumer locks use exact release URLs and digests; they never follow `main`,
  `latest`, or a version range and never fall back to a sibling checkout.
- Distribution conformance proves byte identity only. Codec, state-machine,
  authentication, durable-ACK, and real-Broker conformance require separate
  evidence.
