#ifndef AETHER_CLOUDLINK_FIXTURE_TEST_SUPPORT_H
#define AETHER_CLOUDLINK_FIXTURE_TEST_SUPPORT_H

#include "aether_contracts.h"

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef AETHER_CLOUDLINK_FIXTURE_DIR
#error "AETHER_CLOUDLINK_FIXTURE_DIR must identify the public fixture directory"
#endif

static char *aether_test_read_file(const char *path, size_t *size) {
    FILE *file = fopen(path, "rb");
    long length = 0L;
    char *bytes = NULL;

    assert(file != NULL);
    assert(fseek(file, 0L, SEEK_END) == 0);
    length = ftell(file);
    assert(length >= 0L);
    assert(fseek(file, 0L, SEEK_SET) == 0);
    bytes = (char *)malloc((size_t)length + 1U);
    assert(bytes != NULL);
    assert(fread(bytes, 1U, (size_t)length, file) == (size_t)length);
    assert(fclose(file) == 0);
    bytes[(size_t)length] = '\0';
    *size = (size_t)length;
    return bytes;
}

static int aether_test_json_line_value(
    const char *line,
    char *output,
    size_t output_size) {
    const char *colon = strchr(line, ':');
    const char *start = NULL;
    const char *end = NULL;
    size_t length = 0U;

    if (colon == NULL) {
        return 0;
    }
    start = strchr(colon, '"');
    if (start == NULL) {
        return 0;
    }
    start += 1;
    end = strchr(start, '"');
    if (end == NULL) {
        return 0;
    }
    length = (size_t)(end - start);
    if (length + 1U > output_size) {
        return 0;
    }
    memcpy(output, start, length);
    output[length] = '\0';
    return 1;
}

static void aether_test_execute_fixture(
    const char *file_name,
    const char *expectation,
    const char *failure_code,
    const char *accepted_json,
    size_t accepted_size) {
    char path[1024];
    size_t input_size = 0U;
    char *input = NULL;
    aether_failure_t failure = {AETHER_STATUS_OK, AETHER_FAILURE_NO_OFFSET};
    aether_cloudlink_fixture_context_t context;
    aether_status_t status = AETHER_STATUS_OK;

    assert(snprintf(path, sizeof(path), "%s/%s", AETHER_CLOUDLINK_FIXTURE_DIR,
                    file_name) > 0);
    input = aether_test_read_file(path, &input_size);
    memset(&context, 0, sizeof(context));
    if (strncmp(file_name, "conflicting-replay", 18U) == 0) {
        context.prior_accepted_delivery.data = accepted_json;
        context.prior_accepted_delivery.size = accepted_size;
    }
    if (strcmp(expectation, "context-invalid") == 0) {
        context.has_current_session = 1U;
        context.gateway_id = AETHER_STRING_VIEW_LITERAL(
            "33333333-3333-4333-8333-333333333333");
        context.session_id = AETHER_STRING_VIEW_LITERAL(
            "44444444-4444-4444-8444-444444444444");
        context.session_epoch = AETHER_STRING_VIEW_LITERAL("7");
        context.credential_generation = AETHER_STRING_VIEW_LITERAL("3");
    }
    {
        const aether_string_view_t input_view = {input, input_size};
        status = aether_cloudlink_validate_fixture_json(
            input_view, &context, &failure);
    }
    if (strcmp(expectation, "valid") == 0) {
        if (status != AETHER_STATUS_OK) {
            (void)fprintf(stderr, "%s: expected OK, got %s\n", file_name,
                          aether_failure_code(&failure));
        }
        assert(status == AETHER_STATUS_OK);
    } else {
        if (status == AETHER_STATUS_OK ||
            strcmp(aether_failure_code(&failure), failure_code) != 0) {
            (void)fprintf(stderr, "%s: expected %s, got %s\n", file_name,
                          failure_code, aether_failure_code(&failure));
        }
        assert(status != AETHER_STATUS_OK);
        assert(strcmp(aether_failure_code(&failure), failure_code) == 0);
    }
    free(input);
}

static void aether_test_run_cloudlink_fixture_manifest(void) {
    char manifest_path[1024];
    char accepted_path[1024];
    FILE *manifest = NULL;
    char line[1024];
    char file_name[256] = "";
    char expectation[64] = "";
    char failure_code[128] = "";
    size_t accepted_size = 0U;
    char *accepted_json = NULL;
    size_t executed = 0U;

    assert(snprintf(manifest_path, sizeof(manifest_path),
                    "%s/fixture-manifest.json",
                    AETHER_CLOUDLINK_FIXTURE_DIR) > 0);
    assert(snprintf(accepted_path, sizeof(accepted_path),
                    "%s/telemetry-batch.valid.json",
                    AETHER_CLOUDLINK_FIXTURE_DIR) > 0);
    accepted_json = aether_test_read_file(accepted_path, &accepted_size);
    manifest = fopen(manifest_path, "r");
    assert(manifest != NULL);

    while (fgets(line, (int)sizeof(line), manifest) != NULL) {
        if (strstr(line, "\"file\"") != NULL) {
            assert(aether_test_json_line_value(
                       line, file_name, sizeof(file_name)) != 0);
            failure_code[0] = '\0';
        } else if (strstr(line, "\"expectation\"") != NULL) {
            assert(aether_test_json_line_value(
                       line, expectation, sizeof(expectation)) != 0);
        } else if (strstr(line, "\"failure_code\"") != NULL) {
            assert(aether_test_json_line_value(
                       line, failure_code, sizeof(failure_code)) != 0);
        } else if (strstr(line, "\"sha256\"") != NULL &&
                   file_name[0] != '\0') {
            aether_test_execute_fixture(file_name, expectation, failure_code,
                                        accepted_json, accepted_size);
            file_name[0] = '\0';
            expectation[0] = '\0';
            failure_code[0] = '\0';
            executed += 1U;
        }
    }
    assert(fclose(manifest) == 0);
    free(accepted_json);
    assert(executed > 20U);
}

#endif
