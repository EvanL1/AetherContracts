---
id: thing-model-v1alpha1
status: experimental
version: 0.1.0-alpha.4
normative: true
---

# Thing Model v1 alpha 1

A Thing Model is an immutable, industry-neutral definition. It describes
configuration properties, edge-observed points, and governed capabilities. It
does not contain tenant instances, live values, credentials, register bindings,
or customer topology.

Every published revision has one `model_id`, canonical positive `revision`, and
canonical artifact digest. The digest belongs to the external publication
record because a self-hashed Thing Model cannot contain its own digest; it is
therefore deliberately absent from `thing-model.schema.json`. Reusing a
revision for different canonical bytes is forbidden. Keys must be unique
across the property, point, and capability namespaces; this is a semantic
validation rule in addition to JSON Schema. Parameter keys must also be unique
within each capability so request payloads cannot have ambiguous meanings.

The publication digest is `sha256:` plus lowercase SHA-256 of RFC 8785 JCS over
the complete Thing Model object accepted by `thing-model.schema.json`. No
publication wrapper or tenant metadata enters that projection. The
machine-readable rule is `profiles/thing-model/v1alpha1/publication.json`.

## Authority

- Properties are owned by an immutable artifact revision. Changes are applied
  by an artifact deployment or by an explicitly edge-local path, never by a
  direct field write.
- Points are edge-authoritative, read-only observations. Cloud history and
  projections are not live-state authority.
- Capabilities declare what an edge may understand. Every capability is
  deny-by-default, requires a permission, risk class, confirmation policy,
  idempotency, expiry, and audit policy, and executes only as a governed job.
  The edge makes the final accept, reject, expire, or apply decision.

Desired, Reported, and Applied are distinct facts. Desired is Cloud intent;
Reported is an edge observation of support; Applied is edge-reported deployment
evidence. None may be inferred from another solely because a message was sent
or a transport acknowledgement arrived.

An `applied` observation carries a non-null model reference and
`applied_at_ms`. `not-applied` carries a null model and no applied timestamp;
`applying` and `failed` identify the attempted model but do not fabricate an
apply time. The root `observed_at_ms` timestamps every observation state.

## Voltage migration profile

The structural migration is:

- `P` becomes `properties`.
- `M` becomes `points`.
- `A` becomes `capabilities`.
- `pName` becomes taxonomy or composition metadata outside the core model.
- legacy numeric IDs are retained as namespaced aliases, never as global IDs.

Unit spellings are normalized while the legacy spelling is retained as
provenance. Ambiguous source types, arrays represented as scalars, duplicate
meaning, and uncertain units require an explicit migration diagnostic; an
importer must not guess silently.

The minimal fixture is structurally informed by
`EvanL1/voltage-product-lib` at commit
`7c4eec680f8b5e9a76a57c08078a41b9d5b4550c`. The source repository had only
a README statement claiming MIT and no standalone LICENSE at import time, so
the catalog was not copied. The fixture is not a normative energy model pack.

## WoT relationship

The vocabulary is aligned with W3C Web of Things properties, events, actions,
and reusable Thing Models for future import/export. JSON-LD processing is not a
v1 alpha core requirement. A WoT action maps only to an Aether capability
declaration and never grants direct physical execution.
