# Contributing

Open an issue or proposal before changing a security boundary, authority rule,
canonical signing input, or compatibility classification.

For observable behavior:

1. Add or update a failing conformance test.
2. Confirm the intended failure.
3. Change the smallest specification, Schema, fixture, or binding surface.
4. Update fixture and release hashes.
5. Run `pnpm test:tck`, then the relevant binding checks.
6. Keep implemented, experimental, planned, blocked, and deprecated claims
   accurate.

Default checks must remain offline and must not require a Broker, database,
cloud account, device, or another Aether repository.

Do not submit customer models, topology, credentials, private keys, production
telemetry, or proprietary register maps as fixtures.
