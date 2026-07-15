---
id: cloudlink-v1alpha1
status: experimental-auth-unresolved
version: 0.1.0-alpha.1
normative: true
---

# CloudLink v1 alpha 1

This release imports only schemas and fixtures that were byte-identical in the
AetherCloud and AetherIot joint core. The imported core covers session hello and
acceptance shapes, heartbeat, Runtime Manifest report, telemetry batch,
data-loss evidence, replay request, and the existing unsigned durable-ACK
candidate.

The import does not resolve the repositories' conflicting authentication
schemas or wire-profile assertions. The opaque `credential_binding.proof` in
the imported session hello is structural legacy candidate data, not a frozen
production transcript.

Generic shared-Broker operation is fail-closed until one replay-bounded
publisher proof or trusted Broker attestation profile is specified byte for
byte and passes common valid and invalid fixtures. Topic names, MQTT
credentials, and payload identity are never Gateway authentication.

The current durable-ACK JSON shape is experimental and unsigned. A production
success receipt additionally requires a frozen Cloud signing transcript and
proof that the fact, cursor, receipt, audit evidence, and ACK outbox record share
one committed production transaction. MQTT PUBACK is never that proof.

Repeated delivery with the same replay identity and digest is idempotent. Reuse
of an identity with a different digest is wire-valid but context-invalid; it is
quarantined as `DIGEST_CONFLICT` and receives no successful receipt. Data loss
is explicit evidence and never causes Cloud to fabricate samples.

Data-loss evidence satisfies
`first_lost_position <= last_lost_position < earliest_retained_position`.
Heartbeat and resume cursor arrays contain at most one entry for each
`(stream_id, stream_epoch)`. Violations are context-invalid, do not change a
business fact, and do not permit a successful application receipt.

The durable position identity is
`(gateway_id, stream_id, stream_epoch, position)`. `batch_id` and `digest` are
stable bindings of that position, not fields that create a second identity;
changing either cannot bypass conflict detection. A business digest is the
lowercase SHA-256 of RFC 8785 JCS over exactly
`{protocol_version,message_kind,payload}`. It provides content integrity and
replay comparison, not publisher authentication. The machine-readable form is
`profiles/cloudlink/v1alpha1/core.json`.

`expires_at_ms` is optional; when omitted, that field imposes no message
deadline. When present, it must be greater than or equal to `sent_at_ms`, or
the message is context-invalid with `INVALID_EXPIRY_WINDOW`. Expiration is
evaluated against an explicit canonical uint64 `evaluation_time_ms`: the check
passes only while `evaluation_time_ms < expires_at_ms`, and equality is already
expired with `MESSAGE_EXPIRED`. The portable TCK supplies this evaluation time
as scenario input and never consults an ambient wall clock. Both expiry
failures leave business state unchanged and forbid a successful application
receipt.

The embedded Runtime Manifest checksum is lowercase SHA-256 over RFC 8785 JCS
of the complete manifest object with its top-level `checksum` member omitted.
Its digest omits the `sha256:` prefix because the enclosing checksum object
already declares the algorithm.

`envelope.schema.json` is the imported reusable structural base. Consumers
must validate an uplink with its message-kind entry Schema
(`runtime-manifest-report`, `telemetry-batch`, or `data-loss`); using the base
alone does not validate the discriminator-to-payload relationship.

The imported telemetry slice currently carries only finite JSON-number values
for telemetry/status points. Non-numeric Thing Model value types, events, and
the topology-to-model point-resolution contract are planned, not silently
inferred. An optional sample `model` value is only a commissioning hint and is
not sufficient mapping authority.

This slice does not freeze exact signed `int64`, `uint64`, decimal, byte, or
string sample encodings. A JSON number is not a substitute for an exact 64-bit
integer contract.

Legacy transport remains the default. CloudLink contains no physical-control,
direct SHM, or direct register operation.
