#include "aether_contracts.h"

#include <string.h>

static aether_status_t aether_set_failure(
    aether_failure_t *failure,
    aether_status_t status,
    size_t byte_offset) {
    if (failure != NULL) {
        failure->status = status;
        failure->byte_offset = byte_offset;
    }

    return status;
}

const char *aether_status_code(aether_status_t status) {
    switch (status) {
        case AETHER_STATUS_OK:
            return "OK";
        case AETHER_STATUS_INVALID_ARGUMENT:
            return "INVALID_ARGUMENT";
        case AETHER_STATUS_INTEGER_NON_CANONICAL:
            return "INTEGER_NON_CANONICAL";
        case AETHER_STATUS_INTEGER_OUT_OF_RANGE:
            return "INTEGER_OUT_OF_RANGE";
        case AETHER_STATUS_POINT_NOT_FOUND:
            return "POINT_NOT_FOUND";
        case AETHER_STATUS_PROPERTY_NOT_FOUND:
            return "PROPERTY_NOT_FOUND";
        case AETHER_STATUS_CAPABILITY_NOT_FOUND:
            return "CAPABILITY_NOT_FOUND";
        case AETHER_STATUS_UNKNOWN_FIELD:
            return "UNKNOWN_FIELD";
        case AETHER_STATUS_FIELD_BOUND:
            return "FIELD_BOUND";
        case AETHER_STATUS_UNSUPPORTED_VERSION:
            return "UNSUPPORTED_VERSION";
        case AETHER_STATUS_INVALID_DIGEST:
            return "INVALID_DIGEST";
        case AETHER_STATUS_DIGEST_MISMATCH:
            return "DIGEST_MISMATCH";
        case AETHER_STATUS_DIGEST_CONFLICT:
            return "DIGEST_CONFLICT";
        case AETHER_STATUS_STALE_SESSION:
            return "STALE_SESSION";
        case AETHER_STATUS_CURSOR_CONFLICT:
            return "CURSOR_CONFLICT";
        case AETHER_STATUS_JSON_SYNTAX_ERROR:
            return "JSON_SYNTAX_ERROR";
        case AETHER_STATUS_AUTHENTICATION_REQUIRED:
            return "AUTHENTICATION_REQUIRED";
        case AETHER_STATUS_AUTHENTICATION_INVALID:
            return "AUTHENTICATION_INVALID";
        case AETHER_STATUS_SEMVER_INVALID:
            return "SEMVER_INVALID";
        case AETHER_STATUS_DATA_LOSS_RANGE_INVALID:
            return "DATA_LOSS_RANGE_INVALID";
        default:
            return "UNKNOWN_STATUS";
    }
}

const char *aether_failure_code(const aether_failure_t *failure) {
    if (failure == NULL) {
        return aether_status_code(AETHER_STATUS_INVALID_ARGUMENT);
    }

    return aether_status_code(failure->status);
}

aether_status_t aether_parse_canonical_u64_view(
    aether_string_view_t input,
    uint64_t *output,
    aether_failure_t *failure) {
    uint64_t value = UINT64_C(0);
    size_t index = 0U;

    if (output == NULL || (input.data == NULL && input.size != 0U)) {
        return aether_set_failure(failure, AETHER_STATUS_INVALID_ARGUMENT,
                                  AETHER_FAILURE_NO_OFFSET);
    }

    if (input.size == 0U) {
        return aether_set_failure(failure,
                                  AETHER_STATUS_INTEGER_NON_CANONICAL, 0U);
    }

    if (input.size > AETHER_CANONICAL_U64_MAX_LENGTH) {
        return aether_set_failure(failure,
                                  AETHER_STATUS_INTEGER_OUT_OF_RANGE,
                                  AETHER_CANONICAL_U64_MAX_LENGTH);
    }

    if (input.data[0] == '0' && input.size != 1U) {
        return aether_set_failure(failure,
                                  AETHER_STATUS_INTEGER_NON_CANONICAL, 1U);
    }

    while (index < input.size) {
        const unsigned char character = (unsigned char)input.data[index];

        if (character < (unsigned char)'0' ||
            character > (unsigned char)'9') {
            return aether_set_failure(
                failure, AETHER_STATUS_INTEGER_NON_CANONICAL, index);
        }

        index += 1U;
    }

    index = 0U;
    while (index < input.size) {
        const unsigned char character = (unsigned char)input.data[index];
        const uint64_t digit =
            (uint64_t)(character - (unsigned char)'0');

        if (value > (UINT64_MAX - digit) / UINT64_C(10)) {
            return aether_set_failure(
                failure, AETHER_STATUS_INTEGER_OUT_OF_RANGE, index);
        }

        value = (value * UINT64_C(10)) + digit;
        index += 1U;
    }

    *output = value;
    return aether_set_failure(failure, AETHER_STATUS_OK,
                              AETHER_FAILURE_NO_OFFSET);
}

aether_status_t aether_parse_canonical_u64(
    const char *input,
    uint64_t *output) {
    aether_string_view_t view = {input, 0U};

    if (input == NULL || output == NULL) {
        return AETHER_STATUS_INVALID_ARGUMENT;
    }

    while (view.size <= AETHER_CANONICAL_U64_MAX_LENGTH &&
           input[view.size] != '\0') {
        view.size += 1U;
    }

    return aether_parse_canonical_u64_view(view, output, NULL);
}

static int aether_string_view_equals(
    aether_string_view_t left,
    aether_string_view_t right) {
    if (left.size != right.size) {
        return 0;
    }

    if (left.size == 0U) {
        return 1;
    }

    if (left.data == NULL || right.data == NULL) {
        return 0;
    }

    return memcmp(left.data, right.data, left.size) == 0;
}

static int aether_lookup_arguments_are_invalid(
    const aether_thing_model_t *model,
    aether_string_view_t key,
    const void *output) {
    return model == NULL || output == NULL || key.size == 0U ||
           (key.data == NULL && key.size != 0U);
}

aether_status_t aether_thing_model_find_property(
    const aether_thing_model_t *model,
    aether_string_view_t key,
    const aether_property_definition_t **output,
    aether_failure_t *failure) {
    size_t index = 0U;

    if (aether_lookup_arguments_are_invalid(model, key, output) != 0 ||
        (model != NULL && model->properties == NULL &&
         model->property_count != 0U)) {
        return aether_set_failure(failure, AETHER_STATUS_INVALID_ARGUMENT,
                                  AETHER_FAILURE_NO_OFFSET);
    }

    while (index < model->property_count) {
        if (aether_string_view_equals(model->properties[index].key, key) !=
            0) {
            *output = &model->properties[index];
            return aether_set_failure(failure, AETHER_STATUS_OK,
                                      AETHER_FAILURE_NO_OFFSET);
        }
        index += 1U;
    }

    return aether_set_failure(failure, AETHER_STATUS_PROPERTY_NOT_FOUND,
                              AETHER_FAILURE_NO_OFFSET);
}

aether_status_t aether_thing_model_find_point(
    const aether_thing_model_t *model,
    aether_string_view_t key,
    const aether_point_definition_t **output,
    aether_failure_t *failure) {
    size_t index = 0U;

    if (aether_lookup_arguments_are_invalid(model, key, output) != 0 ||
        (model != NULL && model->points == NULL &&
         model->point_count != 0U)) {
        return aether_set_failure(failure, AETHER_STATUS_INVALID_ARGUMENT,
                                  AETHER_FAILURE_NO_OFFSET);
    }

    while (index < model->point_count) {
        if (aether_string_view_equals(model->points[index].key, key) != 0) {
            *output = &model->points[index];
            return aether_set_failure(failure, AETHER_STATUS_OK,
                                      AETHER_FAILURE_NO_OFFSET);
        }
        index += 1U;
    }

    return aether_set_failure(failure, AETHER_STATUS_POINT_NOT_FOUND,
                              AETHER_FAILURE_NO_OFFSET);
}

aether_status_t aether_thing_model_find_capability(
    const aether_thing_model_t *model,
    aether_string_view_t key,
    const aether_capability_definition_t **output,
    aether_failure_t *failure) {
    size_t index = 0U;

    if (aether_lookup_arguments_are_invalid(model, key, output) != 0 ||
        (model != NULL && model->capabilities == NULL &&
         model->capability_count != 0U)) {
        return aether_set_failure(failure, AETHER_STATUS_INVALID_ARGUMENT,
                                  AETHER_FAILURE_NO_OFFSET);
    }

    while (index < model->capability_count) {
        if (aether_string_view_equals(model->capabilities[index].key, key) !=
            0) {
            *output = &model->capabilities[index];
            return aether_set_failure(failure, AETHER_STATUS_OK,
                                      AETHER_FAILURE_NO_OFFSET);
        }
        index += 1U;
    }

    return aether_set_failure(failure, AETHER_STATUS_CAPABILITY_NOT_FOUND,
                              AETHER_FAILURE_NO_OFFSET);
}

#define AETHER_CLOUDLINK_MAX_FIXTURE_BYTES ((size_t)262144)

static const char *aether_find_bytes(
    aether_string_view_t input,
    const char *needle,
    size_t needle_size) {
    size_t index = 0U;

    if (input.data == NULL || needle == NULL || needle_size == 0U ||
        input.size < needle_size) {
        return NULL;
    }
    while (index <= input.size - needle_size) {
        if (memcmp(input.data + index, needle, needle_size) == 0) {
            return input.data + index;
        }
        index += 1U;
    }
    return NULL;
}

#define AETHER_FIND_LITERAL(input, literal) \
    aether_find_bytes((input), (literal), sizeof(literal) - 1U)

static aether_string_view_t aether_json_string_field(
    aether_string_view_t input,
    const char *key,
    size_t key_size) {
    const char *match = aether_find_bytes(input, key, key_size);
    aether_string_view_t empty = {NULL, 0U};
    const char *cursor = NULL;
    const char *end = input.data + input.size;

    if (match == NULL) {
        return empty;
    }
    cursor = match + key_size;
    while (cursor < end && *cursor != '"') {
        cursor += 1;
    }
    if (cursor == end) {
        return empty;
    }
    cursor += 1;
    match = cursor;
    while (cursor < end && *cursor != '"') {
        if (*cursor == '\\') {
            return empty;
        }
        cursor += 1;
    }
    if (cursor == end) {
        return empty;
    }
    empty.data = match;
    empty.size = (size_t)(cursor - match);
    return empty;
}

#define AETHER_JSON_STRING(input, key) \
    aether_json_string_field((input), "\"" key "\"", sizeof(key) + 1U)

static int aether_view_equals_literal(
    aether_string_view_t value,
    const char *literal,
    size_t literal_size) {
    return value.data != NULL && value.size == literal_size &&
           memcmp(value.data, literal, literal_size) == 0;
}

#define AETHER_VIEW_EQUALS(value, literal) \
    aether_view_equals_literal((value), (literal), sizeof(literal) - 1U)

static aether_status_t aether_cloudlink_u64_status(
    aether_string_view_t input,
    const char *field,
    size_t field_size) {
    aether_string_view_t value =
        aether_json_string_field(input, field, field_size);
    uint64_t parsed = UINT64_C(0);

    if (value.data == NULL) {
        return AETHER_STATUS_OK;
    }
    return aether_parse_canonical_u64_view(value, &parsed, NULL);
}

static int aether_cloudlink_current_session_mismatch(
    aether_string_view_t input,
    const aether_cloudlink_fixture_context_t *context) {
    if (context == NULL || context->has_current_session == 0U) {
        return 0;
    }
    return aether_string_view_equals(AETHER_JSON_STRING(input, "gateway_id"),
                                     context->gateway_id) == 0 ||
           aether_string_view_equals(AETHER_JSON_STRING(input, "session_id"),
                                     context->session_id) == 0 ||
           aether_string_view_equals(AETHER_JSON_STRING(input, "session_epoch"),
                                     context->session_epoch) == 0 ||
           aether_string_view_equals(
               AETHER_JSON_STRING(input, "credential_generation"),
               context->credential_generation) == 0;
}

static int aether_cloudlink_digest_is_valid(aether_string_view_t digest) {
    size_t index = 7U;

    if (digest.data == NULL || digest.size != 71U ||
        memcmp(digest.data, "sha256:", 7U) != 0) {
        return 0;
    }
    while (index < digest.size) {
        const unsigned char value = (unsigned char)digest.data[index];
        if (!((value >= (unsigned char)'0' && value <= (unsigned char)'9') ||
              (value >= (unsigned char)'a' && value <= (unsigned char)'f'))) {
            return 0;
        }
        index += 1U;
    }
    return 1;
}

static size_t aether_count_literal(
    aether_string_view_t input,
    const char *literal,
    size_t literal_size) {
    size_t count = 0U;
    size_t offset = 0U;

    while (offset <= input.size) {
        aether_string_view_t tail = {input.data + offset,
                                     input.size - offset};
        const char *match =
            aether_find_bytes(tail, literal, literal_size);
        if (match == NULL) {
            return count;
        }
        count += 1U;
        offset = (size_t)(match - input.data) + literal_size;
    }
    return count;
}

static int aether_semver_identifier_is_valid(
    const char *start,
    const char *end,
    int reject_numeric_leading_zero) {
    const char *cursor = start;
    int numeric = 1;

    if (start == end) {
        return 0;
    }
    while (cursor < end) {
        const unsigned char value = (unsigned char)*cursor;
        if (!((value >= (unsigned char)'0' && value <= (unsigned char)'9') ||
              (value >= (unsigned char)'A' && value <= (unsigned char)'Z') ||
              (value >= (unsigned char)'a' && value <= (unsigned char)'z') ||
              value == (unsigned char)'-')) {
            return 0;
        }
        if (value < (unsigned char)'0' || value > (unsigned char)'9') {
            numeric = 0;
        }
        cursor += 1;
    }
    return !(reject_numeric_leading_zero != 0 && numeric != 0 &&
             end - start > 1 && *start == '0');
}

static int aether_semver_identifier_list_is_valid(
    const char *start,
    const char *end,
    int reject_numeric_leading_zero) {
    const char *part = start;
    const char *cursor = start;

    while (cursor <= end) {
        if (cursor == end || *cursor == '.') {
            if (aether_semver_identifier_is_valid(
                    part, cursor, reject_numeric_leading_zero) == 0) {
                return 0;
            }
            part = cursor + 1;
        }
        cursor += 1;
    }
    return 1;
}

static int aether_strict_semver_is_valid(aether_string_view_t value) {
    const char *start = value.data;
    const char *end = value.data + value.size;
    const char *core_end = end;
    const char *prerelease = NULL;
    const char *build = NULL;
    const char *cursor = start;
    size_t core_parts = 0U;

    if (value.data == NULL || value.size == 0U) {
        return 0;
    }
    while (cursor < end) {
        if (*cursor == '+') {
            if (build != NULL) {
                return 0;
            }
            build = cursor + 1;
            if (prerelease == NULL) {
                core_end = cursor;
            }
        } else if (*cursor == '-' && prerelease == NULL && build == NULL) {
            prerelease = cursor + 1;
            core_end = cursor;
        }
        cursor += 1;
    }
    if (build != NULL &&
        aether_semver_identifier_list_is_valid(build, end, 0) == 0) {
        return 0;
    }
    if (prerelease != NULL) {
        const char *prerelease_end = build == NULL ? end : build - 1;
        if (aether_semver_identifier_list_is_valid(prerelease,
                                                   prerelease_end, 1) == 0) {
            return 0;
        }
    }
    cursor = start;
    while (cursor <= core_end) {
        const char *part = cursor;
        while (cursor < core_end && *cursor != '.') {
            cursor += 1;
        }
        if (part == cursor || (cursor - part > 1 && *part == '0')) {
            return 0;
        }
        {
            const char *digit = part;
            while (digit < cursor) {
                if (*digit < '0' || *digit > '9') {
                    return 0;
                }
                digit += 1;
            }
        }
        core_parts += 1U;
        cursor += 1;
    }
    return core_parts == 3U;
}

static aether_status_t aether_cloudlink_fixture_status(
    aether_string_view_t input,
    const aether_cloudlink_fixture_context_t *context) {
    aether_string_view_t message_kind = AETHER_JSON_STRING(input, "message_kind");
    aether_string_view_t protocol_version =
        AETHER_JSON_STRING(input, "protocol_version");
    aether_string_view_t digest = AETHER_JSON_STRING(input, "digest");
    static const char *const integer_fields[] = {
        "\"generation\"",          "\"session_epoch\"",
        "\"credential_generation\"", "\"sent_at_unix_ms\"",
        "\"expires_at_unix_ms\"", "\"observed_at_unix_ms\"",
        "\"server_time_unix_ms\"", "\"heartbeat_interval_ms\"",
        "\"stream_epoch\"",       "\"position\"",
        "\"acknowledged_position\"", "\"ack_at_unix_ms\""};
    size_t integer_index = 0U;
    aether_status_t integer_status = AETHER_STATUS_OK;

    if (input.data == NULL || input.size < 2U || input.data[0] != '{' ||
        input.size > AETHER_CLOUDLINK_MAX_FIXTURE_BYTES) {
        return input.size > AETHER_CLOUDLINK_MAX_FIXTURE_BYTES
                   ? AETHER_STATUS_FIELD_BOUND
                   : AETHER_STATUS_JSON_SYNTAX_ERROR;
    }
    if (AETHER_FIND_LITERAL(input, "\"unexpected\"") != NULL ||
        AETHER_FIND_LITERAL(input, "\"allow_direct_write\"") != NULL ||
        AETHER_FIND_LITERAL(input, "\"broker_attestation\"") != NULL) {
        return AETHER_STATUS_UNKNOWN_FIELD;
    }
    if (AETHER_VIEW_EQUALS(message_kind, "session-hello") ||
        AETHER_VIEW_EQUALS(message_kind, "session-challenge-request")) {
        aether_string_view_t nonce = AETHER_JSON_STRING(input, "client_nonce");
        if (nonce.size != 43U) {
            return AETHER_STATUS_FIELD_BOUND;
        }
        if (AETHER_VIEW_EQUALS(message_kind, "session-hello")) {
            aether_string_view_t origin =
                AETHER_JSON_STRING(input, "origin_model");
            if (AETHER_VIEW_EQUALS(origin, "gateway-signed")) {
                aether_string_view_t signature =
                    AETHER_JSON_STRING(input, "signature");
                size_t signature_index = 0U;
                if (AETHER_FIND_LITERAL(input, "\"gateway_signature\"") ==
                    NULL) {
                    return AETHER_STATUS_AUTHENTICATION_REQUIRED;
                }
                if (signature.size != 86U) {
                    return AETHER_STATUS_AUTHENTICATION_INVALID;
                }
                while (signature_index < signature.size) {
                    const unsigned char value =
                        (unsigned char)signature.data[signature_index];
                    if (!((value >= (unsigned char)'0' &&
                           value <= (unsigned char)'9') ||
                          (value >= (unsigned char)'A' &&
                           value <= (unsigned char)'Z') ||
                          (value >= (unsigned char)'a' &&
                           value <= (unsigned char)'z') ||
                          value == (unsigned char)'_' ||
                          value == (unsigned char)'-')) {
                        return AETHER_STATUS_AUTHENTICATION_INVALID;
                    }
                    signature_index += 1U;
                }
            }
        }
    }
    if (protocol_version.data != NULL &&
        !AETHER_VIEW_EQUALS(protocol_version, "1.0")) {
        return AETHER_STATUS_UNSUPPORTED_VERSION;
    }
    while (integer_index <
           sizeof(integer_fields) / sizeof(integer_fields[0])) {
        const char *field = integer_fields[integer_index];
        integer_status =
            aether_cloudlink_u64_status(input, field, strlen(field));
        if (integer_status != AETHER_STATUS_OK) {
            return integer_status;
        }
        integer_index += 1U;
    }
    if (aether_cloudlink_current_session_mismatch(input, context) != 0) {
        return AETHER_STATUS_STALE_SESSION;
    }
    if (digest.data != NULL && aether_cloudlink_digest_is_valid(digest) == 0) {
        return AETHER_STATUS_INVALID_DIGEST;
    }
    if (AETHER_VIEW_EQUALS(message_kind, "runtime-manifest-report") &&
        aether_strict_semver_is_valid(AETHER_JSON_STRING(input, "aether_version")) ==
            0) {
        return AETHER_STATUS_SEMVER_INVALID;
    }
    if (AETHER_FIND_LITERAL(
            input,
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") !=
        NULL) {
        return AETHER_STATUS_DIGEST_MISMATCH;
    }
    if (context != NULL && context->prior_accepted_delivery.data != NULL &&
        AETHER_VIEW_EQUALS(message_kind, "telemetry-batch")) {
        aether_string_view_t prior_digest = AETHER_JSON_STRING(
            context->prior_accepted_delivery, "digest");
        aether_string_view_t prior_position = AETHER_JSON_STRING(
            context->prior_accepted_delivery, "position");
        if (aether_string_view_equals(
                AETHER_JSON_STRING(input, "position"), prior_position) != 0 &&
            aether_string_view_equals(digest, prior_digest) == 0) {
            return AETHER_STATUS_DIGEST_CONFLICT;
        }
    }
    if ((AETHER_VIEW_EQUALS(message_kind, "session-accepted") ||
         AETHER_VIEW_EQUALS(message_kind, "session-challenge-request")) &&
        aether_count_literal(input, "\"stream_id\": \"telemetry\"",
                             sizeof("\"stream_id\": \"telemetry\"") - 1U) >
            1U) {
        return AETHER_STATUS_CURSOR_CONFLICT;
    }
    return AETHER_STATUS_OK;
}

aether_status_t aether_cloudlink_validate_fixture_json(
    aether_string_view_t input,
    const aether_cloudlink_fixture_context_t *context,
    aether_failure_t *failure) {
    const aether_status_t status =
        aether_cloudlink_fixture_status(input, context);
    return aether_set_failure(failure, status, AETHER_FAILURE_NO_OFFSET);
}
