add_library(aether_contracts_cpp INTERFACE)
add_library(AetherContracts::cpp ALIAS aether_contracts_cpp)
target_include_directories(
  aether_contracts_cpp
  INTERFACE
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}>
)
target_compile_features(aether_contracts_cpp INTERFACE cxx_std_17)
target_link_libraries(aether_contracts_cpp INTERFACE aether_contracts_c)
set_target_properties(aether_contracts_cpp PROPERTIES EXPORT_NAME cpp)

if(BUILD_TESTING)
  add_executable(aether_contracts_cpp_foundation_test tests/foundation_test.cpp)
  target_link_libraries(aether_contracts_cpp_foundation_test PRIVATE aether_contracts_cpp)
  if(CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
    target_compile_options(aether_contracts_cpp_foundation_test PRIVATE -Wall -Wextra -Wpedantic -Werror)
  endif()
  add_test(NAME aether_contracts_cpp_foundation COMMAND aether_contracts_cpp_foundation_test)
  add_executable(aether_contracts_cpp_cloudlink_fixture_test tests/cloudlink_fixture_test.cpp)
  target_link_libraries(aether_contracts_cpp_cloudlink_fixture_test PRIVATE aether_contracts_cpp)
  target_include_directories(
    aether_contracts_cpp_cloudlink_fixture_test
    PRIVATE ${PROJECT_SOURCE_DIR}/packages/c/tests
  )
  target_compile_definitions(
    aether_contracts_cpp_cloudlink_fixture_test
    PRIVATE AETHER_CLOUDLINK_FIXTURE_DIR="${PROJECT_SOURCE_DIR}/fixtures/cloudlink/v1alpha1"
  )
  if(CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
    target_compile_options(aether_contracts_cpp_cloudlink_fixture_test PRIVATE -Wall -Wextra -Wpedantic -Werror)
  endif()
  add_test(NAME aether_contracts_cpp_cloudlink_fixtures COMMAND aether_contracts_cpp_cloudlink_fixture_test)
endif()

install(TARGETS aether_contracts_cpp EXPORT AetherContractsTargets)
install(
  FILES include/aether/contracts.hpp
  DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}/aether
)
