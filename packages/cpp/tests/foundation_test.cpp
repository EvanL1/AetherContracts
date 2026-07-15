#include "aether/contracts.hpp"

#include <cassert>
#include <cstdint>
#include <limits>
#include <string_view>

namespace {

void test_canonical_uint64() {
    using aether::contracts::Status;

    const auto parsed = aether::contracts::parse_canonical_uint64(
        "18446744073709551615");
    assert(parsed.has_value());
    assert(parsed.value() == std::numeric_limits<std::uint64_t>::max());

    const auto invalid = aether::contracts::parse_canonical_uint64("01");
    assert(!invalid.has_value());
    assert(invalid.error() == Status::integer_non_canonical);
    assert(invalid.failure().code() == "INTEGER_NON_CANONICAL");

    const auto long_mixed = aether::contracts::parse_canonical_uint64(
        "11111111111111111111x");
    assert(!long_mixed.has_value());
    assert(long_mixed.error() == Status::integer_out_of_range);
    assert(long_mixed.failure().byte_offset() == 20U);

    const auto multibyte_overlength =
        aether::contracts::parse_canonical_uint64(
            "\xD9\xA1\xD9\xA1\xD9\xA1\xD9\xA1\xD9\xA1\xD9\xA1"
            "\xD9\xA1\xD9\xA1\xD9\xA1\xD9\xA1\xD9\xA1");
    assert(!multibyte_overlength.has_value());
    assert(multibyte_overlength.error() == Status::integer_out_of_range);

    const auto empty = aether::contracts::parse_canonical_uint64("");
    assert(!empty.has_value());
    assert(empty.error() == Status::integer_non_canonical);
    assert(empty.failure().byte_offset() == 0U);

    const auto non_digit =
        aether::contracts::parse_canonical_uint64("12x");
    assert(!non_digit.has_value());
    assert(non_digit.error() == Status::integer_non_canonical);
    assert(non_digit.failure().byte_offset() == 2U);

    const auto overflow = aether::contracts::parse_canonical_uint64(
        "18446744073709551616");
    assert(!overflow.has_value());
    assert(overflow.error() == Status::integer_out_of_range);
}

void test_static_thing_model_lookup() {
    static const aether_property_definition_t battery_properties[] = {
        {
            {"max_power", 9U},
            AETHER_VALUE_TYPE_FLOAT64,
            {"kW", 2U},
            AETHER_PROPERTY_AUTHORITY_ARTIFACT_REVISION,
            AETHER_PROPERTY_CHANGE_ARTIFACT_DEPLOYMENT,
        },
    };
    static const aether_point_definition_t battery_points[] = {
        {
            {"soc", 3U},
            AETHER_POINT_KIND_TELEMETRY,
            AETHER_VALUE_TYPE_FLOAT64,
            {"%", 1U},
            AETHER_POINT_AUTHORITY_EDGE,
            AETHER_POINT_ACCESS_READ_ONLY,
        },
    };
    static const aether_capability_definition_t battery_capabilities[] = {
        {
            {"start", 5U},
            AETHER_CAPABILITY_EXECUTION_GOVERNED_JOB,
            1U,
            {"gateway.capability.invoke", 25U},
            AETHER_CAPABILITY_RISK_HIGH,
            AETHER_CAPABILITY_CONFIRMATION_REQUIRED,
            1U,
            1U,
            1U,
            1U,
        },
    };
    static const aether_thing_model_t battery = {
        {"aether.energy.battery", 21U},
        {"1", 1U},
        battery_properties,
        1U,
        battery_points,
        1U,
        battery_capabilities,
        1U,
    };
    const aether::contracts::ThingModelView model{battery};

    const auto max_power = model.find_property("max_power");
    assert(max_power.has_value());
    assert(max_power.value().key() == "max_power");
    assert(max_power.value().authority() ==
           aether::contracts::PropertyAuthority::artifact_revision);
    assert(max_power.value().change_path() ==
           aether::contracts::PropertyChangePath::artifact_deployment);

    const auto soc = model.find_point("soc");
    assert(soc.has_value());
    assert(soc.value().key() == "soc");
    assert(soc.value().unit() == "%");
    assert(soc.value().kind() ==
           aether::contracts::PointKind::telemetry);
    assert(soc.value().authority() ==
           aether::contracts::PointAuthority::edge);
    assert(soc.value().access() ==
           aether::contracts::PointAccess::read_only);

    const auto start = model.find_capability("start");
    assert(start.has_value());
    assert(start.value().execution() ==
           aether::contracts::CapabilityExecution::governed_job);
    assert(start.value().deny_by_default());
    assert(start.value().edge_final_decision());
    assert(start.value().idempotency_required());
    assert(start.value().expiry_required());
    assert(start.value().audit_required());

    const auto missing = model.find_point("missing");
    assert(!missing.has_value());
    assert(missing.error() == aether::contracts::Status::point_not_found);
    assert(missing.failure().code() == "POINT_NOT_FOUND");

    const auto missing_capability = model.find_capability("missing");
    assert(!missing_capability.has_value());
    assert(missing_capability.error() ==
           aether::contracts::Status::capability_not_found);
    assert(missing_capability.failure().code() ==
           "CAPABILITY_NOT_FOUND");
}

}  // namespace

int main() {
    test_canonical_uint64();
    test_static_thing_model_lookup();

    return 0;
}
