use std::fs;
use std::path::{Path, PathBuf};

use aether_contracts::{
    CloudLinkFixtureContext, CloudLinkSessionContext, validate_cloudlink_fixture,
};

#[derive(Debug)]
struct FixtureEntry {
    file: String,
    expectation: String,
    failure_code: Option<String>,
}

fn repository_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("repository root must exist")
}

fn json_string_value(line: &str) -> Option<String> {
    let (_, value) = line.split_once(':')?;
    let value = value.trim().trim_end_matches(',');
    value
        .strip_prefix('"')
        .and_then(|candidate| candidate.strip_suffix('"'))
        .map(ToOwned::to_owned)
}

fn manifest_entries(manifest: &str) -> Vec<FixtureEntry> {
    let mut entries = Vec::new();
    let mut file = None;
    let mut expectation = None;
    let mut failure_code = None;

    for line in manifest.lines().map(str::trim) {
        if line.starts_with("\"file\"") {
            file = json_string_value(line);
        } else if line.starts_with("\"expectation\"") {
            expectation = json_string_value(line);
        } else if line.starts_with("\"failure_code\"") {
            failure_code = json_string_value(line);
        } else if line.starts_with("\"sha256\"") {
            entries.push(FixtureEntry {
                file: file.take().expect("manifest fixture file"),
                expectation: expectation.take().expect("manifest fixture expectation"),
                failure_code: failure_code.take(),
            });
        }
    }
    entries
}

#[test]
fn rust_executes_every_public_cloudlink_fixture_with_its_stable_result() {
    let fixture_root = repository_root().join("fixtures/cloudlink/v1alpha1");
    let manifest = fs::read_to_string(fixture_root.join("fixture-manifest.json"))
        .expect("fixture manifest must be readable");
    let entries = manifest_entries(&manifest);
    let accepted = fs::read_to_string(fixture_root.join("telemetry-batch.valid.json"))
        .expect("accepted fixture must be readable");
    let current_session = CloudLinkSessionContext {
        gateway_id: "33333333-3333-4333-8333-333333333333",
        session_id: "44444444-4444-4444-8444-444444444444",
        session_epoch: "7",
        credential_generation: "3",
    };

    assert!(!entries.is_empty());
    for entry in entries {
        let input =
            fs::read_to_string(fixture_root.join(&entry.file)).expect("fixture must be readable");
        let context = CloudLinkFixtureContext {
            prior_accepted_delivery: entry
                .file
                .starts_with("conflicting-replay")
                .then_some(accepted.as_str()),
            current_session: (entry.expectation == "context-invalid").then_some(current_session),
        };
        let result = validate_cloudlink_fixture(&input, context);
        assert_eq!(
            result.accepted,
            entry.expectation == "valid",
            "{}",
            entry.file
        );
        assert_eq!(
            result.failure_code,
            entry.failure_code.as_deref(),
            "{}",
            entry.file,
        );
    }
}
