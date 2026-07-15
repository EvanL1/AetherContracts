# Security policy

Report suspected vulnerabilities privately through the repository security
advisory workflow. Do not open a public issue containing credentials, private
keys, replayable proofs, customer artifacts, or exploit transcripts against a
deployed system.

This `0.1.0-alpha.2` release is experimental. It deliberately does not define a
production shared-Broker authentication transcript or signed durable ACK. Do
not deploy those incomplete profiles as a trust boundary.

Contract parsers must bound input size, nesting, strings, arrays, and allocation;
reject duplicate keys and invalid Unicode before semantic validation; and never
log signing material or raw proofs. A valid payload identity or MQTT topic is
not authenticated publisher identity.

The TCK decoder's non-transport budgets are defensive defaults, not permission
to allocate to those maxima on embedded targets. Bindings may reject earlier
under documented resource constraints. CloudLink MQTT messages always remain
bounded by the profile's 262144-byte ceiling.

Thing Model actions are capability declarations only. A binding must not expose
them as direct physical operations or bypass the application's governed job and
edge policy path.
