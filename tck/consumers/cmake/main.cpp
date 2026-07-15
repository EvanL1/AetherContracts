#include <aether/contracts.hpp>

int main() {
  const auto result =
      aether::contracts::parse_canonical_uint64("18446744073709551615");
  if (!result.has_value() || result.value() != UINT64_MAX) {
    return 1;
  }
  return 0;
}
