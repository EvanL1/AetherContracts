#include "aether/contracts.hpp"
#include "cloudlink_fixture_test_support.h"

int main() {
    const auto malformed = aether::contracts::validate_cloudlink_fixture_json(
        "[]", aether_cloudlink_fixture_context_t{});
    if (malformed.has_value() ||
        malformed.error() != aether::contracts::Status::json_syntax_error) {
        return 1;
    }
    aether_test_run_cloudlink_fixture_manifest();
    return 0;
}
