---
id: integration-v1alpha1
status: experimental
version: 0.1.0-alpha.4
normative: true
---

# Integration v1 alpha 1

The Integration contract describes a complete provider topology snapshot and
typed observations from an edge-local delegated device provider. It is
industry-neutral. Home Assistant is the first published mapping profile, but
the core contract contains no Home Assistant transport object, service call,
URL, access token, or vendor-specific attribute bag.

This module does not itself define a transport or physical-control commands.
The separately versioned CloudLink Integration extension carries these public
objects unchanged while inheriting CloudLink session, replay, digest, and
durable-ACK rules. Neither module moves provider credentials to AetherCloud or
makes Cloud authoritative for live state. AetherEdge remains responsible for
accepting provider evidence into its local model, enforcing safety policy, and
deciding whether any separately governed capability may reach the physical
world.

## Topology snapshot

An `IntegrationTopologySnapshot` has schema
`aether.integration.topology-snapshot.v1alpha1`. It binds one
`integration_id` and `integration_kind` to a canonical
`snapshot_generation`, observation time, and complete `areas`, `devices`, and
`entities` arrays.

The snapshot is a full replacement, not a patch:

- `snapshot_generation` is a canonical `uint64` and must increase when the
  provider topology changes.
- Consumers atomically validate the complete candidate before replacing the
  preceding accepted generation.
- Absence from a later accepted generation is deletion evidence. Absence from
  a failed or older snapshot is not.
- `entity_id` is the stable registry identity. `source_address` is the current
  provider address and may change after a user rename without changing
  `entity_id`.
- An entity may expose multiple `EntityPointDescriptor` objects. A climate
  entity, for example, may expose current temperature, target temperature, and
  operating mode as distinct typed points.

`entity_kind` and `integration_kind` are constrained identifiers rather than
fixed vendor enumerations. Core consumers must not branch on a closed list of
providers or entity domains.

Area, device, entity, source-address, and entity-local point identities are
unique within a snapshot. A device area reference and every entity area or
device reference must resolve within the same snapshot. Identity conflicts
fail as `IDENTITY_CONFLICT` before dangling references fail as
`REFERENCE_NOT_FOUND`.

## Typed observations

An `IntegrationObservationBatch` has schema
`aether.integration.observation-batch.v1alpha1`. It binds a batch to the exact
`integration_id` and `snapshot_generation` that define its entity and point
references. Every observation names one `entity_id` and `point_key`, supplies
an observation timestamp and quality, and may carry one `ObservedValue`.

`ObservedValue` is a closed discriminated union:

| `type` | JSON representation |
| --- | --- |
| `boolean` | JSON boolean |
| `int64` | canonical signed decimal string in `[-9223372036854775808, 9223372036854775807]` |
| `uint64` | canonical unsigned decimal string in `[0, 18446744073709551615]` |
| `float64` | finite JSON number accepted by the Foundation strict decoder |
| `decimal` | bounded canonical decimal string with no exponent, leading zero, trailing fractional zero, plus sign, or negative zero |
| `string` | bounded Unicode string |
| `bytes` | unpadded canonical Base64url string with `encoding: "base64url"` |

For `good` and `uncertain` quality, `value` is required. For `bad` and
`unavailable`, `value` is forbidden; an optional diagnostic may explain the
provider evidence. Violations fail as `OBSERVATION_VALUE_INVALID`.

After wire validation, a consumer resolves the explicit topology generation,
then the entity and point, then the quality/value relationship, and finally
the point `value_type`. An absent binding fails as `REFERENCE_NOT_FOUND`; a
discriminant that differs from the point descriptor fails as
`VALUE_TYPE_MISMATCH`. No consumer may coerce `"on"` into a boolean, truncate
an integer, infer a unit, or silently accept a malformed decimal or byte
encoding.

## Authority and evidence

An accepted observation is evidence reported by the delegated provider. For
Home Assistant, a successful service result or state event proves what Home
Assistant accepted or reported; it is not independent proof that a physical
actuator moved. Products must retain separate evidence stages for an edge
decision, provider acceptance, observed state, and physical confirmation or
unknown outcome.

Provider URLs, access and refresh tokens, cookies, credential references,
raw diagnostic payloads, and arbitrary provider attributes are outside this
contract. Secrets remain in an edge-local secret store and never enter public
fixtures, audit payloads, prompts, Cloud projections, or CloudLink messages.

Human-readable display and diagnostic fields must contain at least one
non-whitespace character and must not contain C0 control characters or DEL.
Their Schema-specific length limits still apply; a violation fails as
`TEXT_INVALID`. These fields are evidence and labels, never a channel for raw
provider payloads or terminal control sequences.

## Conformance

The normative Schemas are under `schemas/integration/v1alpha1/`. The fixture
manifest fixes valid, wire-invalid, and context-invalid examples. The
language-neutral TCK freezes identity, reference, generation, type,
quality/value, integer range, decimal, and Base64url behavior.

This release claims the public data contract, the experimental CloudLink
Integration wrapper, and their repository TCK. This module remains read-only;
the separate default-off Integration Control contract is defined by
`spec/integration-control-v1alpha1.md`. This module does not claim a complete
AetherEdge adapter, a Cloud projection, language-binding support for either
extension, or production Broker/restart evidence.
