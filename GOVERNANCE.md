# Governance

AetherContracts changes are reviewed as interoperability changes, not as local
SDK conveniences. Normative behavior requires an English specification,
structural Schema where applicable, valid and invalid fixtures, TCK evidence,
and an explicit compatibility classification.

Protocol gates and release artifacts retain their domain-specific status
vocabulary. The agent document catalog does not compress multiple facts into a
status such as `mixed`, `experimental-default-off`, or
`experimental-auth-proposal`. It records orthogonal closed fields:

- `implementation_status`: `implemented`, `partial`, `planned`, or
  `deprecated`;
- `production_readiness`: `production-ready`, `experimental`,
  `not-production-ready`, or `not-applicable`;
- `context_sensitivity`: `public`, `internal`, `redacted-only`, or
  `sensitive-never-load`;
- `priority`: `core` or `optional`;
- `document_role`: `agent-task`, `operations`, `safety`, `recovery`,
  `reference`, `decision`, or `status`.

An open or blocked protocol gate remains explicit compatibility evidence; it is
not hidden inside the status of a document that describes that gate.

No binding is called conformant until it passes the complete applicable TCK.
Breaking changes require a new contract version. Alpha artifacts may change,
but every change still updates fixtures and hashes so consumers cannot confuse
two byte sequences under one release identity.

CloudLink and Thing Model may advance on independent version lines. A release
bundle records their compatible versions without forcing lockstep evolution.

The Git repository, tagged GitHub release bundle, contract manifest, and
published SHA-256 checksums are authoritative distribution. Package registries
and CDNs are mirrors. They must preserve the release digest and may not serve
mutable contract bytes under an existing version. Consumers normally pin a
release or package lock rather than coupling repositories with a Git
submodule. Signed build provenance is planned and is not claimed by the alpha.
