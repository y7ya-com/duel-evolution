# yo2rep.dll: every yo2_<addr> export replaces the original function in the running exe (rep/main.cpp), and the
# differential tester (difftest/run.py) loads the same DLL into Unicorn next to yo2.exe. i686 mingw only.
if(NOT (WIN32 AND CMAKE_SIZEOF_VOID_P EQUAL 4))
  return()
endif()

file(GLOB HOOKS CONFIGURE_DEPENDS hooks/*.cpp)
add_library(yo2rep SHARED rep/main.cpp rep/version.def ${HOOKS})
target_link_libraries(yo2rep PRIVATE yo2core wsock32 d3d8)   # d3d8: CD3DDevice calls Direct3DCreate8
set_target_properties(yo2rep PROPERTIES PREFIX "")
# Fixed base, no relocations needed in Unicorn; no runtime DLL deps beyond msvcrt/kernel32/wsock32.
target_link_options(yo2rep PRIVATE -static -static-libgcc -static-libstdc++
  -Wl,--image-base,0x10000000 -Wl,--disable-dynamicbase -Wl,--kill-at -Wl,--no-insert-timestamp)
