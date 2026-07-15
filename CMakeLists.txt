cmake_minimum_required(VERSION 3.25)
project(AetherContracts LANGUAGES C CXX)

set(AETHER_CONTRACTS_CONTRACT_VERSION "0.1.0-alpha.2")
set(AETHER_CONTRACTS_CMAKE_COMPAT_VERSION "0.1.0")

include(GNUInstallDirs)
include(CMakePackageConfigHelpers)

option(AETHER_ENABLE_SANITIZERS "Enable AddressSanitizer and UndefinedBehaviorSanitizer" OFF)
if(AETHER_ENABLE_SANITIZERS AND CMAKE_C_COMPILER_ID MATCHES "Clang|GNU")
  add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
  add_link_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
endif()

include(CTest)
add_subdirectory(packages/c)
add_subdirectory(packages/cpp)

configure_package_config_file(
  cmake/AetherContractsConfig.cmake.in
  ${CMAKE_CURRENT_BINARY_DIR}/AetherContractsConfig.cmake
  INSTALL_DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/AetherContracts
)
write_basic_package_version_file(
  ${CMAKE_CURRENT_BINARY_DIR}/AetherContractsConfigVersion.cmake
  VERSION ${AETHER_CONTRACTS_CMAKE_COMPAT_VERSION}
  COMPATIBILITY SameMinorVersion
)
install(
  EXPORT AetherContractsTargets
  FILE AetherContractsTargets.cmake
  NAMESPACE AetherContracts::
  DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/AetherContracts
)
install(
  FILES
    ${CMAKE_CURRENT_BINARY_DIR}/AetherContractsConfig.cmake
    ${CMAKE_CURRENT_BINARY_DIR}/AetherContractsConfigVersion.cmake
  DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/AetherContracts
)
install(
  FILES LICENSE
  DESTINATION ${CMAKE_INSTALL_DATADIR}/licenses/AetherContracts
)
