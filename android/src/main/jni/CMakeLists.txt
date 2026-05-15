cmake_minimum_required(VERSION 3.10)
project(lexbor_bridge)

set(CMAKE_CXX_STANDARD 17)

# Lexbor headers and library from prebuilt binaries
set(LEXBOR_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../../native/lexbor-android-arm64-v8a/bin")
set(LEXBOR_INCLUDE_DIR "${LEXBOR_DIR}/include")
set(LEXBOR_LIB_DIR "${LEXBOR_DIR}/lib")

# Import liblexbor.so as a prebuilt shared library
add_library(lexbor SHARED IMPORTED)
set_target_properties(lexbor PROPERTIES
    IMPORTED_LOCATION "${LEXBOR_LIB_DIR}/liblexbor.so"
)

# JNI bridge library
add_library(lexbor_bridge SHARED lexbor_jni.cpp)

target_include_directories(lexbor_bridge PRIVATE
    ${LEXBOR_INCLUDE_DIR}
)

target_link_libraries(lexbor_bridge
    lexbor
    log
)
