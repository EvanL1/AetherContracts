# Governance

AetherContracts changes are reviewed as interoperability changes, not as local
SDK conveniences. Normative behavior requires an English specification,
structural Schema where applicable, valid and invalid fixtures, TCK evidence,
and an explicit compatibility classification.

Statuses have precise meanings:

- `implemented`: repository behavior is present and tested.
- `experimental`: present but not a stable production contract.
- `planned`: designed or named, but not implemented.
- `blocked`: cannot advance until a declared gate passes.
- `deprecated`: supported only for a documented compatibility window.

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
