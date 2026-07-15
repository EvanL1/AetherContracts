add_library(aether_contracts_c STATIC src/aether_contracts.c)
add_library(AetherContracts::c ALIAS aether_contracts_c)
target_include_directories(
  aether_contracts_c
  PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}>
)
target_compile_features(aether_contracts_c PUBLIC c_std_99)
set_target_properties(
  aether_contracts_c
  PROPERTIES
    C_EXTENSIONS OFF
    EXPORT_NAME c
    OUTPUT_NAME aether_contracts
)

if(CMAKE_C_COMPILER_ID MATCHES "Clang|GNU")
  target_compile_options(aether_contracts_c PRIVATE -Wall -Wextra -Wpedantic -Werror)
endif()

if(BUILD_TESTING)
  add_executable(aether_contracts_c_foundation_test tests/foundation_test.c)
  target_link_libraries(aether_contracts_c_foundation_test PRIVATE aether_contracts_c)
  if(CMAKE_C_COMPILER_ID MATCHES "Clang|GNU")
    target_compile_options(aether_contracts_c_foundation_test PRIVATE -Wall -Wextra -Wpedantic -Werror)
  endif()
  add_test(NAME aether_contracts_c_foundation COMMAND aether_contracts_c_foundation_test)
  add_executable(aether_contracts_c_cloudlink_fixture_test tests/cloudlink_fixture_test.c)
  target_link_libraries(aether_contracts_c_cloudlink_fixture_test PRIVATE aether_contracts_c)
  target_compile_definitions(
    aether_contracts_c_cloudlink_fixture_test
    PRIVATE AETHER_CLOUDLINK_FIXTURE_DIR="${PROJECT_SOURCE_DIR}/fixtures/cloudlink/v1alpha1"
  )
  if(CMAKE_C_COMPILER_ID MATCHES "Clang|GNU")
    target_compile_options(aether_contracts_c_cloudlink_fixture_test PRIVATE -Wall -Wextra -Wpedantic -Werror)
  endif()
  add_test(NAME aether_contracts_c_cloudlink_fixtures COMMAND aether_contracts_c_cloudlink_fixture_test)
endif()

install(
  TARGETS aether_contracts_c
  EXPORT AetherContractsTargets
  ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
  LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)
install(
  FILES include/aether_contracts.h
  DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}
)
