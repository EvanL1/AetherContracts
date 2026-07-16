# Product naming migration

AetherIoT is the umbrella project for AetherEdge, AetherCloud, and
AetherContracts. The edge product and repository formerly named AetherIot move
to `EvanL1/AetherEdge`.

AetherContracts `v0.1.0-alpha.3` is immutable and intentionally retains the
historical AetherIot name in its signed, digest-pinned release artifacts.
Consumers must not rewrite those bytes. Future contract releases may use the
AetherEdge display name while preserving every protocol, Schema, TCK, package,
and failure-code identifier unless a separate versioned contract decision says
otherwise.

Repository renaming is not protocol evolution and does not change conformance
status. The alpha.3 release remains experimental and is not a production
CloudLink cutover release.
