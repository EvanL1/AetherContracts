cmake_minimum_required(VERSION 3.25)
project(AetherContractsConsumer LANGUAGES CXX)

enable_testing()
find_package(AetherContracts 0.1.0 CONFIG REQUIRED)
if(NOT AetherContracts_VERSION STREQUAL "0.1.0-alpha.2")
  message(FATAL_ERROR "unexpected AetherContracts contract version: ${AetherContracts_VERSION}")
endif()

add_executable(aether_contracts_consumer main.cpp)
target_link_libraries(aether_contracts_consumer PRIVATE AetherContracts::cpp)
add_test(NAME aether_contracts_consumer COMMAND aether_contracts_consumer)
