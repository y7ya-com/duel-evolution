cmake_minimum_required(VERSION 3.20)
project(yo2 CXX C)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ponytail: one library of everything rewritten so far; harness/ and platform/ add their own targets
file(GLOB_RECURSE YO2_SRC CONFIGURE_DEPENDS src/*.cpp)
add_library(yo2core STATIC ${YO2_SRC})
target_include_directories(yo2core PUBLIC include src platform)
if(NOT WIN32)
  # native + web: src/System's CD3DDevice draws through platform/gfx (D3D8 API on GL/WebGL2)
  target_link_libraries(yo2core PUBLIC yo2gfx)
endif()

foreach(sub harness platform third_party native)
  # platform/ replaces Win32/D3D8 for native + web builds; the Windows (harness) build runs inside the real exe
  if(sub STREQUAL "platform" AND WIN32)
    continue()
  endif()
  if(EXISTS ${CMAKE_CURRENT_SOURCE_DIR}/${sub}/CMakeLists.txt)
    add_subdirectory(${sub})
  endif()
endforeach()
