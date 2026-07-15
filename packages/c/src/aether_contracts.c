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
