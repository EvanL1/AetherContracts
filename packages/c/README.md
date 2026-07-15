# AetherContracts C foundation

The C99 foundation is allocation-free and uses caller-owned string views. It
currently provides canonical `uint64` parsing plus static Thing Model
property/point/capability lookup. Capability metadata is deny-by-default and
has no invocation API. Full JSON decoding and CloudLink conformance are
planned.

Install or consume the root CMake project and link `AetherContracts::c`.
