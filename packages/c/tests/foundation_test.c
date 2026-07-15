#include "aether_contracts.h"

#include <assert.h>
#include <stdint.h>
#include <string.h>

static void test_canonical_uint64(void) {
    uint64_t parsed = 0U;
    aether_failure_t failure = {AETHER_STATUS_OK, AETHER_FAILURE_NO_OFFSET};

    assert(aether_parse_canonical_u64("18446744073709551615", &parsed) ==
           AETHER_STATUS_OK);
    assert(parsed == UINT64_MAX);

    parsed = UINT64_C(99);
    assert(aether_parse_canonical_u64_view(
               AETHER_STRING_VIEW_LITERAL("0"), &parsed, &failure) ==
           AETHER_STATUS_OK);
    assert(parsed == UINT64_C(0));
    assert(failure.status == AETHER_STATUS_OK);
    assert(failure.byte_offset == AETHER_FAILURE_NO_OFFSET);

    parsed = UINT64_C(99);
    assert(aether_parse_canonical_u64_view(
               AETHER_STRING_VIEW_LITERAL(""), &parsed, &failure) ==
           AETHER_STATUS_INTEGER_NON_CANONICAL);
    assert(parsed == UINT64_C(99));
    assert(failure.status == AETHER_STATUS_INTEGER_NON_CANONICAL);
    assert(failure.byte_offset == 0U);

    assert(aether_parse_canonical_u64_view(
               AETHER_STRING_VIEW_LITERAL("12x"), &parsed, &failure) ==
           AETHER_STATUS_INTEGER_NON_CANONICAL);
    assert(parsed == UINT64_C(99));
    assert(failure.byte_offset == 2U);

    assert(aether_parse_canonical_u64_view(
               AETHER_STRING_VIEW_LITERAL("-1"), &parsed, &failure) ==
           AETHER_STATUS_INTEGER_NON_CANONICAL);
    assert(failure.byte_offset == 0U);

    assert(aether_parse_canonical_u64("01", &parsed) ==
           AETHER_STATUS_INTEGER_NON_CANONICAL);
    assert(aether_parse_canonical_u64("11111111111111111111x", &parsed) ==
           AETHER_STATUS_INTEGER_OUT_OF_RANGE);
    assert(aether_parse_canonical_u64(
               "\xD9\xA1\xD9\xA1\xD9\xA1\xD9\xA1\xD9\xA1\xD9\xA1"
               "\xD9\xA1\xD9\xA1\xD9\xA1\xD9\xA1\xD9\xA1",
               &parsed) == AETHER_STATUS_INTEGER_OUT_OF_RANGE);
    assert(aether_parse_canonical_u64("18446744073709551616", &parsed) ==
           AETHER_STATUS_INTEGER_OUT_OF_RANGE);
    assert(aether_parse_canonical_u64(NULL, &parsed) ==
           AETHER_STATUS_INVALID_ARGUMENT);
    assert(aether_parse_canonical_u64("1", NULL) ==
           AETHER_STATUS_INVALID_ARGUMENT);

    assert(strcmp(aether_status_code(AETHER_STATUS_INTEGER_NON_CANONICAL),
                  "INTEGER_NON_CANONICAL") == 0);
    assert(strcmp(aether_failure_code(&failure),
                  "INTEGER_NON_CANONICAL") == 0);
}

static void test_static_thing_model_lookup(void) {
    static const aether_property_definition_t battery_properties[] = {
        {
            AETHER_STRING_VIEW_STATIC_LITERAL("max_power"),
            AETHER_VALUE_TYPE_FLOAT64,
            AETHER_STRING_VIEW_STATIC_LITERAL("kW"),
            AETHER_PROPERTY_AUTHORITY_ARTIFACT_REVISION,
            AETHER_PROPERTY_CHANGE_ARTIFACT_DEPLOYMENT,
        },
    };
    static const aether_point_definition_t battery_points[] = {
        {
            AETHER_STRING_VIEW_STATIC_LITERAL("soc"),
            AETHER_POINT_KIND_TELEMETRY,
            AETHER_VALUE_TYPE_FLOAT64,
            AETHER_STRING_VIEW_STATIC_LITERAL("%"),
            AETHER_POINT_AUTHORITY_EDGE,
            AETHER_POINT_ACCESS_READ_ONLY,
        },
    };
    static const aether_capability_definition_t battery_capabilities[] = {
        {
            AETHER_STRING_VIEW_STATIC_LITERAL("start"),
            AETHER_CAPABILITY_EXECUTION_GOVERNED_JOB,
            1U,
            AETHER_STRING_VIEW_STATIC_LITERAL("gateway.capability.invoke"),
            AETHER_CAPABILITY_RISK_HIGH,
            AETHER_CAPABILITY_CONFIRMATION_REQUIRED,
            1U,
            1U,
            1U,
            1U,
        },
    };
    static const aether_thing_model_t battery = {
        AETHER_STRING_VIEW_STATIC_LITERAL("aether.energy.battery"),
        AETHER_STRING_VIEW_STATIC_LITERAL("1"),
        battery_properties,
        sizeof(battery_properties) / sizeof(battery_properties[0]),
        battery_points,
        sizeof(battery_points) / sizeof(battery_points[0]),
        battery_capabilities,
        sizeof(battery_capabilities) / sizeof(battery_capabilities[0]),
    };
    const aether_property_definition_t *property = NULL;
    const aether_point_definition_t *point = NULL;
    const aether_capability_definition_t *capability = NULL;
    aether_failure_t failure = {AETHER_STATUS_OK, AETHER_FAILURE_NO_OFFSET};

    assert(aether_thing_model_find_property(
               &battery, AETHER_STRING_VIEW_LITERAL("max_power"), &property,
               &failure) == AETHER_STATUS_OK);
    assert(property == &battery_properties[0]);
    assert(property->authority ==
           AETHER_PROPERTY_AUTHORITY_ARTIFACT_REVISION);
    assert(property->change_path ==
           AETHER_PROPERTY_CHANGE_ARTIFACT_DEPLOYMENT);

    assert(aether_thing_model_find_point(
               &battery, AETHER_STRING_VIEW_LITERAL("soc"), &point,
               &failure) == AETHER_STATUS_OK);
    assert(point == &battery_points[0]);
    assert(point->authority == AETHER_POINT_AUTHORITY_EDGE);
    assert(point->access == AETHER_POINT_ACCESS_READ_ONLY);
    assert(point->value_type == AETHER_VALUE_TYPE_FLOAT64);
    assert(failure.status == AETHER_STATUS_OK);

    assert(aether_thing_model_find_capability(
               &battery, AETHER_STRING_VIEW_LITERAL("start"), &capability,
               &failure) == AETHER_STATUS_OK);
    assert(capability == &battery_capabilities[0]);
    assert(capability->execution ==
           AETHER_CAPABILITY_EXECUTION_GOVERNED_JOB);
    assert(capability->deny_by_default == 1U);
    assert(capability->edge_final_decision == 1U);
    assert(capability->idempotency_required == 1U);
    assert(capability->expiry_required == 1U);
    assert(capability->audit_required == 1U);

    point = &battery_points[0];
    assert(aether_thing_model_find_point(
               &battery, AETHER_STRING_VIEW_LITERAL("missing"), &point,
               &failure) == AETHER_STATUS_POINT_NOT_FOUND);
    assert(point == &battery_points[0]);
    assert(strcmp(aether_failure_code(&failure),
                  "POINT_NOT_FOUND") == 0);

    capability = &battery_capabilities[0];
    assert(aether_thing_model_find_capability(
               &battery, AETHER_STRING_VIEW_LITERAL("missing"), &capability,
               &failure) == AETHER_STATUS_CAPABILITY_NOT_FOUND);
    assert(capability == &battery_capabilities[0]);
    assert(strcmp(aether_failure_code(&failure),
                  "CAPABILITY_NOT_FOUND") == 0);
}

int main(void) {
    test_canonical_uint64();
    test_static_thing_model_lookup();

    return 0;
}
