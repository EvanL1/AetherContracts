# Security policy

Report suspected vulnerabilities privately through the repository security
advisory workflow. Do not open a public issue containing credentials, private
keys, replayable proofs, customer artifacts, or exploit transcripts against a
deployed system.

The latest published release is `v0.1.0-alpha.3`; `0.1.0-alpha.4` is an
unpublished development target. Both are experimental. The development target
deliberately does not define a production shared-Broker authentication
transcript or signed durable ACK. Do not deploy those incomplete profiles as a
trust boundary.

Contract parsers must bound input size, nesting, strings, arrays, and allocation;
reject duplicate keys and invalid Unicode before semantic validation; and never
log signing material or raw proofs. A valid payload identity or MQTT topic is
not authenticated publisher identity.

Treat each MQTT prefix as an authorization namespace. Gateway identifiers must
be unique within it, multi-tenant deployments must isolate tenant/project
prefixes or use Cloud-global Gateway identifiers, and Broker principals must be
restricted to the exact namespace and Gateway publish/subscribe topics. The
prefix and topic still provide no Gateway authentication. Select the durable
replay repository partition from this trusted ingress namespace before applying
the unchanged four-field wire identity. Never accept a payload-selected
namespace, reuse a record across namespaces, or run a global unpartitioned
lookup.

For the default-off gateway-signed proposal, verify the signature, active key,
Broker-principal namespace, current active session, Gateway identity, session
epoch, and credential generation before durable lookup, freshness, or replay.
Use only the frozen delivery or heartbeat signing projection. Heartbeat time
checks use explicit evaluation time and the negotiated session interval;
uint64 overflow fails closed, and replay never extends liveness.

Treat a delivery replay record as committed only when its business effect and
record were atomically made durable. Authentication-only, reserved, and pending
records never bypass first-acceptance expiry. A committed immutable delivery
may rebind only to a strictly higher current session epoch, and the new binding
must be durable before reissuing that session's receipt. Reject same-epoch
session changes, rollback, credential-generation changes, and any changed
immutable field before checking persisted-replay expiry.

Alpha.4 `session-accepted` is unsigned and does not bind its challenge or client
nonce, so it cannot exclude delayed cross-handshake responses. This and the
unsigned durable ACK block production authentication.

The TCK decoder's non-transport budgets are defensive defaults, not permission
to allocate to those maxima on embedded targets. Bindings may reject earlier
under documented resource constraints. CloudLink MQTT messages always remain
bounded by the profile's 262144-byte ceiling.

Thing Model actions are capability declarations only. A binding must not expose
them as direct physical operations or bypass the application's governed job and
edge policy path.

Integration topology and observation objects must never contain a provider URL,
access token, refresh token, cookie, credential reference, arbitrary provider
attribute bag, or direct service call. These values remain in the edge-local
configuration and secret store and must not enter fixtures, logs, audit
payloads, prompts, or Cloud projections.

The CloudLink Integration extension inherits the authenticated outer Gateway
session and never moves provider credentials into its unchanged public
payload. Reject an oversized full topology instead of fragmenting or partially
applying it; observation batches may be partitioned only before wrapping into
independent bounded batches.

The independent Integration Control extension is disabled by default and is
not production-ready until Cloud offer-key provisioning, rotation, revocation,
and Edge verifier ownership are implemented. It accepts only the closed
`device.power.set.v1` intent. Reject any caller-supplied provider domain,
operation, parameter object, URL, token, or undeclared action. Validate the
current session, mandatory expiry, intent digest, explicit confirmation, exact
topology target, persistent job replay binding, and edge-local policy before
provider invocation. Provider acceptance never proves physical completion.

Treat a durable ACK as a cumulative deletion boundary only after validating
that every position through it is durably persisted or covered by accepted
data-loss evidence. An undeclared gap forbids cursor advancement and spool
deletion.
