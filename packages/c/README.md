# AetherContracts C foundation

The C99 foundation is allocation-free and uses caller-owned string views. It
currently provides canonical `uint64` parsing plus static Thing Model
property/point/capability lookup. Capability metadata is deny-by-default and
has no invocation API. A bounded, caller-owned experimental validator executes
the public CloudLink fixture profile. It is not a general JSON parser or a
complete production CloudLink transport/authentication codec.

Install or consume the root CMake project and link `AetherContracts::c`.
