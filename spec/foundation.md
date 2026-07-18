---
id: contract-foundation
status: experimental
version: 0.1.0-alpha.4
normative: true
---

# Contract foundation

The v1 alpha logical representation and wire encoding are UTF-8 JSON. Closed
core objects reject unknown fields. A conformant raw decoder must also reject
duplicate object keys, malformed Unicode, input beyond the profile limits, and
JSON numbers that cannot be represented without the contract's declared
semantics.

Protocol `uint64` values are canonical decimal strings. They have no sign,
whitespace, decimal point, exponent, or leading zero, except that zero is
exactly `"0"`. The maximum `uint64` is `"18446744073709551615"`. Thing Model
may declare an `int64` value type. The Integration v1 alpha 1 profile freezes
its observed signed representation as a canonical decimal string in
`[-9223372036854775808, 9223372036854775807]`: no plus sign, whitespace,
decimal point, exponent, leading zero, or negative zero is accepted. Other
modules do not acquire signed wire semantics merely by declaring the type.

Integration observed decimals and bytes also use contract-declared strings
rather than lossy JSON-number or implementation-native byte coercion. Their
canonical grammar, bounds, and Base64url trailing-bit rules are frozen by the
Integration Schema, specification, fixtures, and TCK.

Integration display and evidence text is bounded by its declaring Schema. It
must contain at least one non-whitespace character and must not contain C0
control characters (`U+0000` through `U+001F`) or DEL (`U+007F`). Consumers
must not accept these fields as raw terminal text, provider payloads, or secret
carriers. A violation fails as `TEXT_INVALID`.

Validation order is contractual: after checking the binding input type, a
representation longer than 20 bytes fails as `INTEGER_OUT_OF_RANGE` before
digit syntax is inspected. This keeps allocation-free C decoders bounded and
gives every language the same failure for overlength adversarial input.

JSON Schema acceptance is necessary but not sufficient. Ordering, replay,
identity conflicts, authorization, revision compatibility, and durable receipt
semantics require contextual validators and TCK scenarios.

JSON numbers use finite IEEE 754 binary64 semantics. If the decoded value is
integer-valued but outside the interoperable safe-integer range
`[-9007199254740991, 9007199254740991]`, it is accepted only when its RFC 8785
serialization retains a decimal point; otherwise the producer must use a
contract-declared decimal string. Thus `1e100` and `1.5e20` fail as
`JSON_UNSAFE_NUMBER`, while `1e-100` and the binary64 maximum
`1.7976931348623157e308` remain floating-point values. Protocol integers never
use this exception: they use their explicitly frozen string encoding.

The TCK strict decoder applies defensive reference-runner budgets for nesting,
strings, collections, and number tokens. Those defaults are implementation
safety limits, not portable acceptance maxima. A transport or artifact profile
freezes portable limits where interoperability requires them; the MQTT profile
currently freezes the complete message at 262144 bytes. Other bindings may
apply documented stricter resource limits and must fail closed with
`FIELD_BOUND`.

When a contract defines a signed object, the exact signing projection must be
specified before use. It is serialized with RFC 8785 JSON Canonicalization,
hashed with SHA-256, and then signed. Pretty-printed source bytes are never a
signature input. This alpha release does not freeze the CloudLink authentication
projection globally: the explicitly selected experimental profile freezes its
two Ed25519 signing projections in
`profiles/cloudlink/v1alpha1/authentication.json`, while production key
lifecycle and verifier ownership remain unresolved. The signed-ACK projection
remains planned.

Stable string failure codes are language-neutral. Numeric values and error text
are binding details until a future ABI profile explicitly freezes them.
