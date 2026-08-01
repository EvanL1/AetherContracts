# Product naming migration

AetherIoT is the umbrella project for AetherEdge, AetherCloud, and
AetherContracts. The edge product and repository formerly named AetherIot move
to `EvanL1/AetherEdge`.

AetherContracts `v0.1.0-alpha.3` is immutable and intentionally retains the
historical AetherIot name in its signed, digest-pinned release artifacts.
Consumers must not rewrite those bytes. The published `v0.1.0-alpha.4` release
uses the AetherEdge display name while preserving every protocol, Schema, TCK,
package, and failure-code identifier unless a separate versioned contract
decision says otherwise.

Repository renaming is not protocol evolution and does not change conformance
status. The latest published release is `v0.1.0-alpha.4`. Alpha.5 is an
unpublished development target, remains experimental, and is not a production
CloudLink cutover.

Protocol and rollout changes from the alpha.3 baseline to the published alpha.4
release are tracked separately in
[`docs/migrations/alpha3-to-alpha4.md`](docs/migrations/alpha3-to-alpha4.md).
