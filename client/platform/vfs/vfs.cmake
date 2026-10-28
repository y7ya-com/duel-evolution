# File layer (DESIGN.md §4): byte sources + the KCEJYUGI archive. Included from platform/CMakeLists.txt.
set(VFS_DIR ${CMAKE_CURRENT_LIST_DIR})

if(EMSCRIPTEN)
  add_library(yo2vfs STATIC ${VFS_DIR}/vfs.cpp ${VFS_DIR}/vfs_url.cpp)
else()
  add_library(yo2vfs STATIC ${VFS_DIR}/vfs.cpp)
endif()
target_include_directories(yo2vfs PUBLIC ${VFS_DIR}/..)

if(NOT EMSCRIPTEN)
  add_executable(vfs_test ${VFS_DIR}/../tests/vfs_test.cpp)   # vfs_test <merge.dat> [kcej-list.txt]
  target_link_libraries(vfs_test PRIVATE yo2vfs)
else()
  # Node: node platform/tests/vfs_node.cjs build-web/platform/vfs_test_web.js <merge.dat>
  add_executable(vfs_test_web ${VFS_DIR}/../tests/vfs_test.cpp)
  target_link_libraries(vfs_test_web PRIVATE yo2vfs)
  target_link_options(vfs_test_web PRIVATE -sALLOW_MEMORY_GROWTH=1 -sEXIT_RUNTIME=1)
endif()
