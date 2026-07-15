#ifndef AETHER_CONTRACTS_H
#define AETHER_CONTRACTS_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Numeric values are explicit for the C ABI. Cross-language conformance uses
 * the strings returned by aether_status_code as its stable failure identity.
 */
typedef enum aether_status {
    AETHER_STATUS_OK = 0,
    AETHER_STATUS_INVALID_ARGUMENT = 1,
    AETHER_STATUS_INTEGER_NON_CANONICAL = 2,
    AETHER_STATUS_INTEGER_OUT_OF_RANGE = 3,
    AETHER_STATUS_POINT_NOT_FOUND = 4,
    AETHER_STATUS_PROPERTY_NOT_FOUND = 5,
    AETHER_STATUS_CAPABILITY_NOT_FOUND = 6
} aether_status_t;

#define AETHER_FAILURE_NO_OFFSET ((size_t)-1)
#define AETHER_CANONICAL_U64_MAX_LENGTH ((size_t)20)

typedef struct aether_failure {
    aether_status_t status;
    size_t byte_offset;
} aether_failure_t;

typedef struct aether_string_view {
    const char *data;
    size_t size;
} aether_string_view_t;

/* These macros accept a string literal, not a char pointer. */
#ifdef __cplusplus
#define AETHER_STRING_VIEW_LITERAL(value) \
    aether_string_view_t{(value), sizeof(value) - 1U}
#define AETHER_STRING_VIEW_STATIC_LITERAL(value) \
    aether_string_view_t{(value), sizeof(value) - 1U}
#else
#define AETHER_STRING_VIEW_LITERAL(value) \
    (aether_string_view_t) { (value), sizeof(value) - 1U }
#define AETHER_STRING_VIEW_STATIC_LITERAL(value) \
    { (value), sizeof(value) - 1U }
#endif

typedef enum aether_point_kind {
    AETHER_POINT_KIND_TELEMETRY = 1,
    AETHER_POINT_KIND_STATUS = 2,
    AETHER_POINT_KIND_EVENT = 3
} aether_point_kind_t;

typedef enum aether_value_type {
    AETHER_VALUE_TYPE_BOOLEAN = 1,
    AETHER_VALUE_TYPE_INT64 = 2,
    AETHER_VALUE_TYPE_UINT64 = 3,
    AETHER_VALUE_TYPE_FLOAT64 = 4,
    AETHER_VALUE_TYPE_DECIMAL = 5,
    AETHER_VALUE_TYPE_STRING = 6,
    AETHER_VALUE_TYPE_BYTES = 7
} aether_value_type_t;

typedef enum aether_property_authority {
    AETHER_PROPERTY_AUTHORITY_ARTIFACT_REVISION = 1
} aether_property_authority_t;

typedef enum aether_property_change_path {
    AETHER_PROPERTY_CHANGE_ARTIFACT_DEPLOYMENT = 1,
    AETHER_PROPERTY_CHANGE_EDGE_LOCAL_ONLY = 2
} aether_property_change_path_t;

typedef enum aether_point_authority {
    AETHER_POINT_AUTHORITY_EDGE = 1
} aether_point_authority_t;

typedef enum aether_point_access {
    AETHER_POINT_ACCESS_READ_ONLY = 1
} aether_point_access_t;

typedef enum aether_capability_execution {
    AETHER_CAPABILITY_EXECUTION_GOVERNED_JOB = 1
} aether_capability_execution_t;

typedef enum aether_capability_risk {
    AETHER_CAPABILITY_RISK_LOW = 1,
    AETHER_CAPABILITY_RISK_MEDIUM = 2,
    AETHER_CAPABILITY_RISK_HIGH = 3,
    AETHER_CAPABILITY_RISK_CRITICAL = 4
} aether_capability_risk_t;

typedef enum aether_capability_confirmation {
    AETHER_CAPABILITY_CONFIRMATION_NONE = 1,
    AETHER_CAPABILITY_CONFIRMATION_REQUIRED = 2
} aether_capability_confirmation_t;

/*
 * All referenced bytes remain owned by the caller. These definitions perform
 * no allocation and are suitable for const/static model tables.
 */
typedef struct aether_property_definition {
    aether_string_view_t key;
    aether_value_type_t value_type;
    aether_string_view_t unit;
    aether_property_authority_t authority;
    aether_property_change_path_t change_path;
} aether_property_definition_t;

typedef struct aether_point_definition {
    aether_string_view_t key;
    aether_point_kind_t kind;
    aether_value_type_t value_type;
    aether_string_view_t unit;
    aether_point_authority_t authority;
    aether_point_access_t access;
} aether_point_definition_t;

/*
 * This type declares governed capability metadata only. It deliberately
 * exposes no invocation or physical-control function.
 */
typedef struct aether_capability_definition {
    aether_string_view_t key;
    aether_capability_execution_t execution;
    uint8_t deny_by_default;
    aether_string_view_t permission;
    aether_capability_risk_t risk;
    aether_capability_confirmation_t confirmation;
    uint8_t idempotency_required;
    uint8_t expiry_required;
    uint8_t audit_required;
    uint8_t edge_final_decision;
} aether_capability_definition_t;

typedef struct aether_thing_model {
    aether_string_view_t model_id;
    aether_string_view_t revision;
    const aether_property_definition_t *properties;
    size_t property_count;
    const aether_point_definition_t *points;
    size_t point_count;
    const aether_capability_definition_t *capabilities;
    size_t capability_count;
} aether_thing_model_t;

const char *aether_status_code(aether_status_t status);
const char *aether_failure_code(const aether_failure_t *failure);

/*
 * Length-aware canonical uint64 parser. The output is changed only on
 * success. failure may be NULL when diagnostics are not required.
 */
aether_status_t aether_parse_canonical_u64_view(
    aether_string_view_t input,
    uint64_t *output,
    aether_failure_t *failure);

/* Convenience adapter for a NUL-terminated string; scanning is bounded. */
aether_status_t aether_parse_canonical_u64(
    const char *input,
    uint64_t *output);

/* Exact, byte-wise key lookups with no allocation. */
aether_status_t aether_thing_model_find_property(
    const aether_thing_model_t *model,
    aether_string_view_t key,
    const aether_property_definition_t **output,
    aether_failure_t *failure);

aether_status_t aether_thing_model_find_point(
    const aether_thing_model_t *model,
    aether_string_view_t key,
    const aether_point_definition_t **output,
    aether_failure_t *failure);

aether_status_t aether_thing_model_find_capability(
    const aether_thing_model_t *model,
    aether_string_view_t key,
    const aether_capability_definition_t **output,
    aether_failure_t *failure);

#ifdef __cplusplus
}
#endif

#endif
