add_library(yo2gfx STATIC ${CMAKE_CURRENT_LIST_DIR}/d3d8.cpp ${CMAKE_CURRENT_LIST_DIR}/d3dx8.cpp)
target_include_directories(yo2gfx PUBLIC ${CMAKE_CURRENT_LIST_DIR})
target_link_libraries(yo2gfx PUBLIC yo2platform)

if(NOT EMSCRIPTEN)
  add_executable(gfx_test ${CMAKE_CURRENT_LIST_DIR}/../tests/gfx_test.cpp)
  target_link_libraries(gfx_test PRIVATE yo2gfx)
endif()
