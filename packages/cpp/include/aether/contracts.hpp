#ifndef AETHER_CONTRACTS_HPP
#define AETHER_CONTRACTS_HPP

#include "aether_contracts.h"

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string_view>
#include <utility>

namespace aether::contracts {

enum class Status : int {
    ok = AETHER_STATUS_OK,
    invalid_argument = AETHER_STATUS_INVALID_ARGUMENT,
    integer_non_canonical = AETHER_STATUS_INTEGER_NON_CANONICAL,
    integer_out_of_range = AETHER_STATUS_INTEGER_OUT_OF_RANGE,
    point_not_found = AETHER_STATUS_POINT_NOT_FOUND,
    property_not_found = AETHER_STATUS_PROPERTY_NOT_FOUND,
    capability_not_found = AETHER_STATUS_CAPABILITY_NOT_FOUND,
    unknown_field = AETHER_STATUS_UNKNOWN_FIELD,
    field_bound = AETHER_STATUS_FIELD_BOUND,
    unsupported_version = AETHER_STATUS_UNSUPPORTED_VERSION,
    invalid_digest = AETHER_STATUS_INVALID_DIGEST,
    digest_mismatch = AETHER_STATUS_DIGEST_MISMATCH,
    digest_conflict = AETHER_STATUS_DIGEST_CONFLICT,
    stale_session = AETHER_STATUS_STALE_SESSION,
    cursor_conflict = AETHER_STATUS_CURSOR_CONFLICT,
    json_syntax_error = AETHER_STATUS_JSON_SYNTAX_ERROR,
    authentication_required = AETHER_STATUS_AUTHENTICATION_REQUIRED,
    authentication_invalid = AETHER_STATUS_AUTHENTICATION_INVALID,
    semver_invalid = AETHER_STATUS_SEMVER_INVALID,
    data_loss_range_invalid = AETHER_STATUS_DATA_LOSS_RANGE_INVALID,
};

enum class PointKind : int {
    telemetry = AETHER_POINT_KIND_TELEMETRY,
    status = AETHER_POINT_KIND_STATUS,
    event = AETHER_POINT_KIND_EVENT,
};

enum class ValueType : int {
    boolean = AETHER_VALUE_TYPE_BOOLEAN,
    int64 = AETHER_VALUE_TYPE_INT64,
    uint64 = AETHER_VALUE_TYPE_UINT64,
    float64 = AETHER_VALUE_TYPE_FLOAT64,
    decimal = AETHER_VALUE_TYPE_DECIMAL,
    string = AETHER_VALUE_TYPE_STRING,
    bytes = AETHER_VALUE_TYPE_BYTES,
};

enum class PropertyAuthority : int {
    artifact_revision = AETHER_PROPERTY_AUTHORITY_ARTIFACT_REVISION,
};

enum class PropertyChangePath : int {
    artifact_deployment = AETHER_PROPERTY_CHANGE_ARTIFACT_DEPLOYMENT,
    edge_local_only = AETHER_PROPERTY_CHANGE_EDGE_LOCAL_ONLY,
};

enum class PointAuthority : int {
    edge = AETHER_POINT_AUTHORITY_EDGE,
};

enum class PointAccess : int {
    read_only = AETHER_POINT_ACCESS_READ_ONLY,
};

enum class CapabilityExecution : int {
    governed_job = AETHER_CAPABILITY_EXECUTION_GOVERNED_JOB,
};

enum class CapabilityRisk : int {
    low = AETHER_CAPABILITY_RISK_LOW,
    medium = AETHER_CAPABILITY_RISK_MEDIUM,
    high = AETHER_CAPABILITY_RISK_HIGH,
    critical = AETHER_CAPABILITY_RISK_CRITICAL,
};

enum class CapabilityConfirmation : int {
    none = AETHER_CAPABILITY_CONFIRMATION_NONE,
    required = AETHER_CAPABILITY_CONFIRMATION_REQUIRED,
};

class Failure final {
  public:
    explicit Failure(aether_failure_t failure) noexcept : failure_{failure} {}

    [[nodiscard]] Status status() const noexcept {
        return static_cast<Status>(failure_.status);
    }

    [[nodiscard]] std::size_t byte_offset() const noexcept {
        return failure_.byte_offset;
    }

    [[nodiscard]] std::string_view code() const noexcept {
        return aether_failure_code(&failure_);
    }

  private:
    aether_failure_t failure_;
};

template <typename T>
class Result final {
  public:
    static Result success(T value) {
        return Result{std::move(value)};
    }

    static Result failed(Failure failure) {
        return Result{std::move(failure)};
    }

    [[nodiscard]] bool has_value() const noexcept {
        return value_.has_value();
    }

    [[nodiscard]] const T &value() const {
        return value_.value();
    }

    [[nodiscard]] Status error() const noexcept {
        return failure_.status();
    }

    [[nodiscard]] const Failure &failure() const noexcept {
        return failure_;
    }

  private:
    explicit Result(T value)
        : value_{std::move(value)},
          failure_{aether_failure_t{AETHER_STATUS_OK,
                                    AETHER_FAILURE_NO_OFFSET}} {}

    explicit Result(Failure failure)
        : value_{std::nullopt}, failure_{std::move(failure)} {}

    std::optional<T> value_;
    Failure failure_;
};

[[nodiscard]] inline Result<std::uint64_t> parse_canonical_uint64(
    std::string_view input) {
    std::uint64_t value = 0U;
    aether_failure_t failure{AETHER_STATUS_OK, AETHER_FAILURE_NO_OFFSET};
    const aether_string_view_t view{input.data(), input.size()};
    const auto status =
        aether_parse_canonical_u64_view(view, &value, &failure);

    if (status != AETHER_STATUS_OK) {
        return Result<std::uint64_t>::failed(Failure{failure});
    }

    return Result<std::uint64_t>::success(value);
}

/*
 * Executes the bounded experimental fixture profile through the C core. The
 * context and input remain caller-owned; this does not expose transport or
 * physical-control operations.
 */
[[nodiscard]] inline Result<bool> validate_cloudlink_fixture_json(
    std::string_view input,
    const aether_cloudlink_fixture_context_t &context) {
    aether_failure_t failure{AETHER_STATUS_OK, AETHER_FAILURE_NO_OFFSET};
    const aether_string_view_t view{input.data(), input.size()};
    const auto status =
        aether_cloudlink_validate_fixture_json(view, &context, &failure);

    if (status != AETHER_STATUS_OK) {
        return Result<bool>::failed(Failure{failure});
    }
    return Result<bool>::success(true);
}

class PropertyDefinitionView final {
  public:
    explicit PropertyDefinitionView(
        const aether_property_definition_t &definition) noexcept
        : definition_{&definition} {}

    [[nodiscard]] std::string_view key() const noexcept {
        return {definition_->key.data, definition_->key.size};
    }

    [[nodiscard]] ValueType value_type() const noexcept {
        return static_cast<ValueType>(definition_->value_type);
    }

    [[nodiscard]] std::string_view unit() const noexcept {
        return {definition_->unit.data, definition_->unit.size};
    }

    [[nodiscard]] PropertyAuthority authority() const noexcept {
        return static_cast<PropertyAuthority>(definition_->authority);
    }

    [[nodiscard]] PropertyChangePath change_path() const noexcept {
        return static_cast<PropertyChangePath>(definition_->change_path);
    }

    [[nodiscard]] const aether_property_definition_t &native() const noexcept {
        return *definition_;
    }

  private:
    const aether_property_definition_t *definition_;
};

class PointDefinitionView final {
  public:
    explicit PointDefinitionView(
        const aether_point_definition_t &definition) noexcept
        : definition_{&definition} {}

    [[nodiscard]] std::string_view key() const noexcept {
        return {definition_->key.data, definition_->key.size};
    }

    [[nodiscard]] PointKind kind() const noexcept {
        return static_cast<PointKind>(definition_->kind);
    }

    [[nodiscard]] ValueType value_type() const noexcept {
        return static_cast<ValueType>(definition_->value_type);
    }

    [[nodiscard]] std::string_view unit() const noexcept {
        return {definition_->unit.data, definition_->unit.size};
    }

    [[nodiscard]] PointAuthority authority() const noexcept {
        return static_cast<PointAuthority>(definition_->authority);
    }

    [[nodiscard]] PointAccess access() const noexcept {
        return static_cast<PointAccess>(definition_->access);
    }

    [[nodiscard]] const aether_point_definition_t &native() const noexcept {
        return *definition_;
    }

  private:
    const aether_point_definition_t *definition_;
};

class CapabilityDefinitionView final {
  public:
    explicit CapabilityDefinitionView(
        const aether_capability_definition_t &definition) noexcept
        : definition_{&definition} {}

    [[nodiscard]] std::string_view key() const noexcept {
        return {definition_->key.data, definition_->key.size};
    }

    [[nodiscard]] CapabilityExecution execution() const noexcept {
        return static_cast<CapabilityExecution>(definition_->execution);
    }

    [[nodiscard]] bool deny_by_default() const noexcept {
        return definition_->deny_by_default != 0U;
    }

    [[nodiscard]] std::string_view permission() const noexcept {
        return {definition_->permission.data, definition_->permission.size};
    }

    [[nodiscard]] CapabilityRisk risk() const noexcept {
        return static_cast<CapabilityRisk>(definition_->risk);
    }

    [[nodiscard]] CapabilityConfirmation confirmation() const noexcept {
        return static_cast<CapabilityConfirmation>(definition_->confirmation);
    }

    [[nodiscard]] bool idempotency_required() const noexcept {
        return definition_->idempotency_required != 0U;
    }

    [[nodiscard]] bool expiry_required() const noexcept {
        return definition_->expiry_required != 0U;
    }

    [[nodiscard]] bool audit_required() const noexcept {
        return definition_->audit_required != 0U;
    }

    [[nodiscard]] bool edge_final_decision() const noexcept {
        return definition_->edge_final_decision != 0U;
    }

    [[nodiscard]] const aether_capability_definition_t &native()
        const noexcept {
        return *definition_;
    }

  private:
    const aether_capability_definition_t *definition_;
};

class ThingModelView final {
  public:
    explicit ThingModelView(const aether_thing_model_t &model) noexcept
        : model_{&model} {}

    [[nodiscard]] std::string_view model_id() const noexcept {
        return {model_->model_id.data, model_->model_id.size};
    }

    [[nodiscard]] std::string_view revision() const noexcept {
        return {model_->revision.data, model_->revision.size};
    }

    [[nodiscard]] Result<PropertyDefinitionView> find_property(
        std::string_view key) const {
        const aether_property_definition_t *property = nullptr;
        aether_failure_t failure{AETHER_STATUS_OK,
                                 AETHER_FAILURE_NO_OFFSET};
        const aether_string_view_t key_view{key.data(), key.size()};
        const auto status = aether_thing_model_find_property(
            model_, key_view, &property, &failure);

        if (status != AETHER_STATUS_OK) {
            return Result<PropertyDefinitionView>::failed(Failure{failure});
        }

        return Result<PropertyDefinitionView>::success(
            PropertyDefinitionView{*property});
    }

    [[nodiscard]] Result<PointDefinitionView> find_point(
        std::string_view key) const {
        const aether_point_definition_t *point = nullptr;
        aether_failure_t failure{AETHER_STATUS_OK,
                                 AETHER_FAILURE_NO_OFFSET};
        const aether_string_view_t key_view{key.data(), key.size()};
        const auto status = aether_thing_model_find_point(
            model_, key_view, &point, &failure);

        if (status != AETHER_STATUS_OK) {
            return Result<PointDefinitionView>::failed(Failure{failure});
        }

        return Result<PointDefinitionView>::success(
            PointDefinitionView{*point});
    }

    [[nodiscard]] Result<CapabilityDefinitionView> find_capability(
        std::string_view key) const {
        const aether_capability_definition_t *capability = nullptr;
        aether_failure_t failure{AETHER_STATUS_OK,
                                 AETHER_FAILURE_NO_OFFSET};
        const aether_string_view_t key_view{key.data(), key.size()};
        const auto status = aether_thing_model_find_capability(
            model_, key_view, &capability, &failure);

        if (status != AETHER_STATUS_OK) {
            return Result<CapabilityDefinitionView>::failed(
                Failure{failure});
        }

        return Result<CapabilityDefinitionView>::success(
            CapabilityDefinitionView{*capability});
    }

    [[nodiscard]] const aether_thing_model_t &native() const noexcept {
        return *model_;
    }

  private:
    const aether_thing_model_t *model_;
};

}  // namespace aether::contracts

#endif
