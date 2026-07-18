use std::collections::BTreeSet;

use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};

use crate::{ContractFailure, ContractFailureCode};

const MAXIMUM_UINT64: u128 = u64::MAX as u128;
const DIGEST_PREFIX: &str = "sha256:";

/// Current `CloudLink` session facts supplied to contextual fixture validation.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CloudLinkSessionContext<'a> {
    pub credential_generation: &'a str,
    pub gateway_id: &'a str,
    pub session_epoch: &'a str,
    pub session_id: &'a str,
}

/// Explicit context for replay and session-sensitive `CloudLink` fixtures.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct CloudLinkFixtureContext<'a> {
    pub current_session: Option<CloudLinkSessionContext<'a>>,
    pub prior_accepted_delivery: Option<&'a str>,
}

/// Stable language-neutral outcome for one public fixture.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CloudLinkValidationResult {
    pub accepted: bool,
    pub failure_code: Option<&'static str>,
}

impl CloudLinkValidationResult {
    /// Mirrors `Result::is_ok` for consumers that only need acceptance.
    #[must_use]
    pub const fn is_ok(self) -> bool {
        self.accepted
    }

    /// Returns the typed stable failure, when validation rejected the input.
    #[must_use]
    pub fn err(self) -> Option<ContractFailure> {
        self.failure_code
            .map(|code| ContractFailure::new(failure_code(code)))
    }
}

/// Accepted input forms for the copy-only fixture context.
pub trait CloudLinkContextInput<'a> {
    fn into_context(self) -> CloudLinkFixtureContext<'a>;
}

impl<'a> CloudLinkContextInput<'a> for CloudLinkFixtureContext<'a> {
    fn into_context(self) -> CloudLinkFixtureContext<'a> {
        self
    }
}

impl<'a> CloudLinkContextInput<'a> for &CloudLinkFixtureContext<'a> {
    fn into_context(self) -> CloudLinkFixtureContext<'a> {
        *self
    }
}

fn failure_code(value: &str) -> ContractFailureCode {
    if value == "UNKNOWN_FIELD" {
        return ContractFailureCode::UnknownField;
    }
    match value {
        "INTEGER_NON_CANONICAL" => ContractFailureCode::IntegerNonCanonical,
        "INTEGER_OUT_OF_RANGE" => ContractFailureCode::IntegerOutOfRange,
        "FIELD_BOUND" => ContractFailureCode::FieldBound,
        "UNSUPPORTED_VERSION" => ContractFailureCode::UnsupportedVersion,
        "INVALID_DIGEST" => ContractFailureCode::InvalidDigest,
        "DIGEST_MISMATCH" => ContractFailureCode::DigestMismatch,
        "DIGEST_CONFLICT" => ContractFailureCode::DigestConflict,
        "STALE_SESSION" => ContractFailureCode::StaleSession,
        "CURSOR_CONFLICT" => ContractFailureCode::CursorConflict,
        "JSON_SYNTAX_ERROR" => ContractFailureCode::JsonSyntaxError,
        "AUTHENTICATION_REQUIRED" => ContractFailureCode::AuthenticationRequired,
        "AUTHENTICATION_INVALID" => ContractFailureCode::AuthenticationInvalid,
        "SEMVER_INVALID" => ContractFailureCode::SemverInvalid,
        "DATA_LOSS_RANGE_INVALID" => ContractFailureCode::DataLossRangeInvalid,
        _ => ContractFailureCode::UnknownField,
    }
}

fn object(value: &Value) -> Option<&Map<String, Value>> {
    value.as_object()
}

fn unknown_field(value: &Map<String, Value>, allowed: &[&str]) -> bool {
    value.keys().any(|key| !allowed.contains(&key.as_str()))
}

fn canonical_u64_failure(value: Option<&Value>) -> Option<&'static str> {
    let Some(value) = value.and_then(Value::as_str) else {
        return Some("INTEGER_NON_CANONICAL");
    };
    if value.len() > 20 {
        return Some("INTEGER_OUT_OF_RANGE");
    }
    if value.is_empty()
        || !value.bytes().all(|byte| byte.is_ascii_digit())
        || (value.len() > 1 && value.starts_with('0'))
    {
        return Some("INTEGER_NON_CANONICAL");
    }
    match value.parse::<u128>() {
        Ok(number) if number <= MAXIMUM_UINT64 => None,
        _ => Some("INTEGER_OUT_OF_RANGE"),
    }
}

fn first_u64_failure(value: &Map<String, Value>, fields: &[&str]) -> Option<&'static str> {
    fields
        .iter()
        .find_map(|field| canonical_u64_failure(value.get(*field)))
}

fn cursor_failure(value: Option<&Value>) -> Option<&'static str> {
    let Some(cursors) = value.and_then(Value::as_array) else {
        return Some("UNKNOWN_FIELD");
    };
    let mut identities = BTreeSet::new();
    for candidate in cursors {
        let Some(cursor) = object(candidate) else {
            return Some("UNKNOWN_FIELD");
        };
        if let Some(failure) = first_u64_failure(cursor, &["stream_epoch", "acknowledged_position"])
        {
            return Some(failure);
        }
        let identity = (
            cursor.get("stream_id").and_then(Value::as_str),
            cursor.get("stream_epoch").and_then(Value::as_str),
        );
        if !identities.insert(identity) {
            return Some("CURSOR_CONFLICT");
        }
    }
    None
}

fn current_session_failure(
    value: &Map<String, Value>,
    current: Option<CloudLinkSessionContext<'_>>,
) -> Option<&'static str> {
    let current = current?;
    let expected = [
        ("gateway_id", current.gateway_id),
        ("session_id", current.session_id),
        ("session_epoch", current.session_epoch),
        ("credential_generation", current.credential_generation),
    ];
    expected.iter().find_map(|(field, expected)| {
        (value.get(*field).and_then(Value::as_str) != Some(*expected)).then_some("STALE_SESSION")
    })
}

fn canonical_json(value: &Value) -> Option<String> {
    serde_json::to_string(value).ok()
}

fn business_digest(value: &Map<String, Value>) -> Option<String> {
    let projection = json!({
        "message_kind": value.get("message_kind")?,
        "payload": value.get("payload")?,
        "protocol_version": value.get("protocol_version")?,
    });
    let canonical = canonical_json(&projection)?;
    Some(format!(
        "{DIGEST_PREFIX}{:x}",
        Sha256::digest(canonical.as_bytes())
    ))
}

fn valid_digest(value: &str) -> bool {
    value.len() == 71
        && value.starts_with(DIGEST_PREFIX)
        && value[DIGEST_PREFIX.len()..]
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn delivery_failure(
    value: &Map<String, Value>,
    context: &CloudLinkFixtureContext<'_>,
) -> Option<&'static str> {
    let delivery = object(value.get("delivery")?)?;
    if let Some(failure) = first_u64_failure(delivery, &["stream_epoch", "position"]) {
        return Some(failure);
    }
    let Some(digest) = delivery.get("digest").and_then(Value::as_str) else {
        return Some("INVALID_DIGEST");
    };
    if !valid_digest(digest) {
        return Some("INVALID_DIGEST");
    }
    if business_digest(value).as_deref() != Some(digest) {
        return Some("DIGEST_MISMATCH");
    }
    let prior_json = context.prior_accepted_delivery?;
    let prior: Value = serde_json::from_str(prior_json).ok()?;
    let prior = object(&prior)?;
    let prior_delivery = object(prior.get("delivery")?)?;
    let same_identity = value.get("gateway_id") == prior.get("gateway_id")
        && delivery.get("stream_id") == prior_delivery.get("stream_id")
        && delivery.get("stream_epoch") == prior_delivery.get("stream_epoch")
        && delivery.get("position") == prior_delivery.get("position");
    if same_identity
        && (delivery.get("batch_id") != prior_delivery.get("batch_id")
            || delivery.get("digest") != prior_delivery.get("digest"))
    {
        return Some("DIGEST_CONFLICT");
    }
    None
}

fn valid_signature(value: Option<&Value>) -> bool {
    let Some(signature) = value.and_then(object) else {
        return false;
    };
    !unknown_field(signature, &["key_id", "algorithm", "signature"])
        && signature.get("key_id").and_then(Value::as_str).is_some()
        && signature.get("algorithm").and_then(Value::as_str) == Some("Ed25519")
        && signature
            .get("signature")
            .and_then(Value::as_str)
            .is_some_and(|value| {
                value.len() == 86
                    && value
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
            })
}

fn session_hello_failure(value: &Map<String, Value>) -> Option<&'static str> {
    if unknown_field(
        value,
        &[
            "schema",
            "protocol",
            "message_kind",
            "gateway_id",
            "credential_binding",
            "challenge_id",
            "gateway_key_id",
            "gateway_signature",
            "offered_protocol_versions",
            "client_nonce",
            "resume",
        ],
    ) {
        return Some("UNKNOWN_FIELD");
    }
    if !value
        .get("client_nonce")
        .and_then(Value::as_str)
        .is_some_and(|nonce| {
            nonce.len() == 43
                && nonce
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
        })
    {
        return Some("FIELD_BOUND");
    }
    let binding = object(value.get("credential_binding")?)?;
    if let Some(failure) = canonical_u64_failure(binding.get("generation")) {
        return Some(failure);
    }
    match binding.get("origin_model").and_then(Value::as_str) {
        Some("gateway-signed") => {
            if value.get("gateway_signature").is_none() {
                return Some("AUTHENTICATION_REQUIRED");
            }
            if value
                .get("gateway_key_id")
                .and_then(Value::as_str)
                .is_none()
                || !valid_signature(value.get("gateway_signature"))
            {
                return Some("AUTHENTICATION_INVALID");
            }
        }
        Some("trusted-connector-broker-attestation") => {}
        _ => return Some("AUTHENTICATION_INVALID"),
    }
    cursor_failure(value.get("resume"))
}

fn session_challenge_request_failure(value: &Map<String, Value>) -> Option<&'static str> {
    if unknown_field(
        value,
        &[
            "schema",
            "protocol",
            "message_kind",
            "gateway_id",
            "credential_binding",
            "offered_protocol_versions",
            "client_nonce",
            "resume",
        ],
    ) {
        return Some("UNKNOWN_FIELD");
    }
    if !value
        .get("client_nonce")
        .and_then(Value::as_str)
        .is_some_and(|nonce| {
            nonce.len() == 43
                && nonce
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
        })
    {
        return Some("FIELD_BOUND");
    }
    let binding = object(value.get("credential_binding")?)?;
    if unknown_field(binding, &["credential_id", "generation"]) {
        return Some("UNKNOWN_FIELD");
    }
    if let Some(failure) = canonical_u64_failure(binding.get("generation")) {
        return Some(failure);
    }
    cursor_failure(value.get("resume"))
}

/// Returns whether a string follows `SemVer` 2.0.0 without accepting leading-zero
/// numeric identifiers or empty pre-release/build components.
#[must_use]
pub fn is_strict_semver(value: &str) -> bool {
    let (without_build, build) = value
        .split_once('+')
        .map_or((value, None), |parts| (parts.0, Some(parts.1)));
    if value.matches('+').count() > 1 || build.is_some_and(|part| !valid_semver_ids(part, false)) {
        return false;
    }
    let (core, prerelease) = without_build
        .split_once('-')
        .map_or((without_build, None), |parts| (parts.0, Some(parts.1)));
    if prerelease.is_some_and(|part| !valid_semver_ids(part, true)) {
        return false;
    }
    let components = core.split('.').collect::<Vec<_>>();
    components.len() == 3 && components.into_iter().all(valid_core_number)
}

fn valid_core_number(value: &str) -> bool {
    !value.is_empty()
        && value.bytes().all(|byte| byte.is_ascii_digit())
        && (value == "0" || !value.starts_with('0'))
}

fn valid_semver_ids(value: &str, reject_numeric_leading_zero: bool) -> bool {
    !value.is_empty()
        && value.split('.').all(|identifier| {
            !identifier.is_empty()
                && identifier
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
                && (!reject_numeric_leading_zero
                    || !identifier.bytes().all(|byte| byte.is_ascii_digit())
                    || identifier == "0"
                    || !identifier.starts_with('0'))
        })
}

fn envelope_failure(
    value: &Map<String, Value>,
    context: &CloudLinkFixtureContext<'_>,
) -> Option<&'static str> {
    if unknown_field(
        value,
        &[
            "schema",
            "protocol",
            "protocol_version",
            "message_kind",
            "gateway_id",
            "session_id",
            "session_epoch",
            "credential_generation",
            "sent_at_ms",
            "expires_at_ms",
            "delivery",
            "message_authentication",
            "traceparent",
            "payload",
        ],
    ) {
        return Some("UNKNOWN_FIELD");
    }
    if value.get("protocol_version").and_then(Value::as_str) != Some("1.0") {
        return Some("UNSUPPORTED_VERSION");
    }
    if let Some(failure) = first_u64_failure(
        value,
        &["session_epoch", "credential_generation", "sent_at_ms"],
    ) {
        return Some(failure);
    }
    if let Some(failure) = current_session_failure(value, context.current_session) {
        return Some(failure);
    }
    if let Some(failure) = delivery_failure(value, context) {
        return Some(failure);
    }
    match value.get("message_kind").and_then(Value::as_str) {
        Some("runtime-manifest-report") => {
            let manifest = object(object(value.get("payload")?)?.get("manifest")?)?;
            if !manifest
                .get("aether_version")
                .and_then(Value::as_str)
                .is_some_and(is_strict_semver)
            {
                return Some("SEMVER_INVALID");
            }
        }
        Some("data-loss") => {
            let payload = object(value.get("payload")?)?;
            let first = payload
                .get("first_lost_position")
                .and_then(Value::as_str)?
                .parse::<u64>()
                .ok()?;
            let last = payload
                .get("last_lost_position")
                .and_then(Value::as_str)?
                .parse::<u64>()
                .ok()?;
            let earliest = payload
                .get("earliest_retained_position")
                .and_then(Value::as_str)?
                .parse::<u64>()
                .ok()?;
            if first > last || last >= earliest {
                return Some("DATA_LOSS_RANGE_INVALID");
            }
        }
        Some("telemetry-batch") => {}
        _ => return Some("UNSUPPORTED_VERSION"),
    }
    None
}

fn non_envelope_failure(
    value: &Map<String, Value>,
    context: &CloudLinkFixtureContext<'_>,
) -> Option<&'static str> {
    match value.get("message_kind").and_then(Value::as_str) {
        Some("session-challenge-request") => {
            return session_challenge_request_failure(value);
        }
        Some("session-hello") => return session_hello_failure(value),
        Some("session-accepted") => return cursor_failure(value.get("resume")),
        Some("session-challenge") => {
            return (!valid_signature(value.get("cloud_signature")))
                .then_some("AUTHENTICATION_INVALID");
        }
        _ => {}
    }
    if value.get("protocol_version").and_then(Value::as_str) != Some("1.0") {
        return Some("UNSUPPORTED_VERSION");
    }
    if let Some(failure) = first_u64_failure(value, &["session_epoch", "credential_generation"]) {
        return Some(failure);
    }
    if let Some(failure) = current_session_failure(value, context.current_session) {
        return Some(failure);
    }
    match value.get("message_kind").and_then(Value::as_str) {
        Some("heartbeat" | "heartbeat-ack") => cursor_failure(value.get("cursors")),
        Some("durable-ack") => {
            if value
                .get("digest")
                .and_then(Value::as_str)
                .is_some_and(valid_digest)
            {
                None
            } else {
                Some("INVALID_DIGEST")
            }
        }
        Some("replay-request") => None,
        _ => Some("UNSUPPORTED_VERSION"),
    }
}

/// Validates one `CloudLink` fixture document and returns the contractual result.
#[must_use]
pub fn validate_cloudlink_fixture<'a>(
    input: &str,
    context: impl CloudLinkContextInput<'a>,
) -> CloudLinkValidationResult {
    let context = context.into_context();
    let Ok(value) = serde_json::from_str::<Value>(input) else {
        return CloudLinkValidationResult {
            accepted: false,
            failure_code: Some("JSON_SYNTAX_ERROR"),
        };
    };
    let Some(value) = object(&value) else {
        return CloudLinkValidationResult {
            accepted: false,
            failure_code: Some("UNKNOWN_FIELD"),
        };
    };
    let is_envelope = matches!(
        value.get("message_kind").and_then(Value::as_str),
        Some("runtime-manifest-report" | "telemetry-batch" | "data-loss")
    );
    let failure = if is_envelope {
        envelope_failure(value, &context)
    } else {
        non_envelope_failure(value, &context)
    };
    CloudLinkValidationResult {
        accepted: failure.is_none(),
        failure_code: failure,
    }
}
