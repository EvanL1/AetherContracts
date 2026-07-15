use aether_contracts::{ContractFailureCode, parse_canonical_u64};

#[test]
fn preserves_zero_and_full_unsigned_range() {
    assert_eq!(parse_canonical_u64("0"), Ok(0));
    assert_eq!(parse_canonical_u64("18446744073709551615"), Ok(u64::MAX));
}

#[test]
fn rejects_leading_zeroes_with_stable_code() {
    let failure = parse_canonical_u64("01").expect_err("leading zero must fail");
    assert_eq!(failure.code(), ContractFailureCode::IntegerNonCanonical);
}

#[test]
fn rejects_every_non_canonical_decimal_form() {
    for input in ["", "+1", "-1", " 1", "1 ", "1.0", "1e0", "١"] {
        let failure = parse_canonical_u64(input).expect_err("invalid syntax must fail");
        assert_eq!(
            failure.code(),
            ContractFailureCode::IntegerNonCanonical,
            "input: {input:?}"
        );
    }
}

#[test]
fn rejects_values_above_unsigned_range() {
    let failure =
        parse_canonical_u64("18446744073709551616").expect_err("uint64 overflow must fail");
    assert_eq!(failure.code(), ContractFailureCode::IntegerOutOfRange);
}

#[test]
fn classifies_overlength_before_lexical_content() {
    for input in ["11111111111111111111x".to_owned(), "١".repeat(11)] {
        let failure = parse_canonical_u64(&input)
            .expect_err("overlength input must fail before lexical validation");
        assert_eq!(failure.code(), ContractFailureCode::IntegerOutOfRange);
    }
}

#[test]
fn exposes_language_neutral_failure_code_strings() {
    assert_eq!(
        ContractFailureCode::IntegerNonCanonical.as_str(),
        "INTEGER_NON_CANONICAL"
    );
    assert_eq!(
        ContractFailureCode::IntegerOutOfRange.as_str(),
        "INTEGER_OUT_OF_RANGE"
    );
}
