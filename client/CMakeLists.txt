cmake_minimum_required(VERSION 3.20)
project(yo2 CXX C)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ponytail: one library of everything rewritten so far; harness/ and platform/ add their own targets
file(GLOB_RECURSE YO2_SRC CONFIGURE_DEPENDS src/*.cpp)
add_library(yo2core STATIC ${YO2_SRC})
target_include_directories(yo2core PUBLIC include src platform)
target_compile_definitions(yo2core PUBLIC NOMINMAX)   # windows.h's min/max macros break std::min/std::max
if(WIN32)
  # mingw has the real d3d8.h but no d3dx8.h: platform/win32's declarations, on the real d3d8.h (the functions are
  # the exe's own, statically linked D3DX; nothing in yo2rep calls them yet)
  file(READ platform/win32/d3dx8.h D3DX8_DECLS)
  string(REPLACE "#include \"d3d8.h\"" "#include <d3d8.h>" D3DX8_DECLS "${D3DX8_DECLS}")
  file(WRITE ${CMAKE_BINARY_DIR}/d3dx8/d3dx8.h "${D3DX8_DECLS}")
  target_include_directories(yo2core SYSTEM AFTER PUBLIC ${CMAKE_BINARY_DIR}/d3dx8)
endif()
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
