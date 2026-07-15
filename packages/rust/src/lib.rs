//! Language-neutral foundation primitives for Aether interoperability contracts.
//!
//! Protocol `uint64` values are represented as canonical decimal JSON strings.
//! This crate intentionally exposes parsing separately from any transport or
//! application runtime.

use core::fmt;

mod cloudlink;

pub use cloudlink::{
    CloudLinkContextInput, CloudLinkFixtureContext, CloudLinkSessionContext,
    CloudLinkValidationResult, is_strict_semver, validate_cloudlink_fixture,
};

const UINT64_MAX_DECIMAL: &str = "18446744073709551615";

/// Stable failure identifiers shared by every conforming language binding.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[non_exhaustive]
pub enum ContractFailureCode {
    /// The decimal representation was not in canonical unsigned form.
    IntegerNonCanonical,
    /// The canonical decimal value exceeded the `uint64` range.
    IntegerOutOfRange,
    /// A closed core object contains an undeclared field.
    UnknownField,
    /// Input exceeds a portable field bound.
    FieldBound,
    /// The selected protocol version is unsupported.
    UnsupportedVersion,
    /// A digest has an invalid representation.
    InvalidDigest,
    /// A digest does not match its canonical business projection.
    DigestMismatch,
    /// A replay position changed a stable binding.
    DigestConflict,
    /// A message does not match the current session.
    StaleSession,
    /// A cursor identity is repeated.
    CursorConflict,
    /// Raw JSON syntax is invalid.
    JsonSyntaxError,
    /// Authentication is required for the selected origin mode.
    AuthenticationRequired,
    /// Authentication material violates the selected profile.
    AuthenticationInvalid,
    /// A version is not strict `SemVer` 2.0.0.
    SemverInvalid,
    /// A data-loss range is not ordered.
    DataLossRangeInvalid,
}

impl ContractFailureCode {
    /// Returns the language-neutral contractual identifier.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::IntegerNonCanonical => "INTEGER_NON_CANONICAL",
            Self::IntegerOutOfRange => "INTEGER_OUT_OF_RANGE",
            Self::UnknownField => "UNKNOWN_FIELD",
            Self::FieldBound => "FIELD_BOUND",
            Self::UnsupportedVersion => "UNSUPPORTED_VERSION",
            Self::InvalidDigest => "INVALID_DIGEST",
            Self::DigestMismatch => "DIGEST_MISMATCH",
            Self::DigestConflict => "DIGEST_CONFLICT",
            Self::StaleSession => "STALE_SESSION",
            Self::CursorConflict => "CURSOR_CONFLICT",
            Self::JsonSyntaxError => "JSON_SYNTAX_ERROR",
            Self::AuthenticationRequired => "AUTHENTICATION_REQUIRED",
            Self::AuthenticationInvalid => "AUTHENTICATION_INVALID",
            Self::SemverInvalid => "SEMVER_INVALID",
            Self::DataLossRangeInvalid => "DATA_LOSS_RANGE_INVALID",
        }
    }
}

impl fmt::Display for ContractFailureCode {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// A typed contract validation failure.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractFailure {
    code: ContractFailureCode,
}

impl ContractFailure {
    pub(crate) const fn new(code: ContractFailureCode) -> Self {
        Self { code }
    }

    /// Returns the stable, language-neutral failure code.
    #[must_use]
    pub const fn code(&self) -> ContractFailureCode {
        self.code
    }
}

impl fmt::Display for ContractFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.code.fmt(formatter)
    }
}

impl std::error::Error for ContractFailure {}

/// Parses a canonical unsigned decimal string into the full Rust `u64` range.
///
/// Canonical input is either `"0"` or an ASCII decimal sequence beginning with
/// `1` through `9`. Signs, whitespace, leading zeroes, decimal points, exponent
/// notation, and non-ASCII digits are rejected.
///
/// # Errors
///
/// Returns [`ContractFailureCode::IntegerNonCanonical`] for invalid syntax and
/// [`ContractFailureCode::IntegerOutOfRange`] for values greater than `u64::MAX`.
pub fn parse_canonical_u64(input: &str) -> Result<u64, ContractFailure> {
    if input.len() > UINT64_MAX_DECIMAL.len() {
        return Err(ContractFailure::new(ContractFailureCode::IntegerOutOfRange));
    }

    let mut bytes = input.bytes();
    let first = bytes.next();

    match first {
        Some(b'0') if bytes.next().is_none() => return Ok(0),
        Some(b'1'..=b'9') if bytes.all(|byte| byte.is_ascii_digit()) => {}
        _ => {
            return Err(ContractFailure::new(
                ContractFailureCode::IntegerNonCanonical,
            ));
        }
    }

    if input.len() == UINT64_MAX_DECIMAL.len() && input > UINT64_MAX_DECIMAL {
        return Err(ContractFailure::new(ContractFailureCode::IntegerOutOfRange));
    }

    input
        .parse::<u64>()
        .map_err(|_error| ContractFailure::new(ContractFailureCode::IntegerOutOfRange))
}
