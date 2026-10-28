# yo2native: one native exe of everything rewritten so far (all of yo2core, yaneSDK, platform), with a generated
# logging stub for every function the rewrite calls but nobody has written yet. See native/README.md.
if(EMSCRIPTEN OR WIN32)
  return()
endif()
set(YO2_STUBS ${CMAKE_CURRENT_BINARY_DIR}/stubs)   # native/gen_stubs.py writes them
file(MAKE_DIRECTORY ${YO2_STUBS})
file(GLOB STUB_SRC CONFIGURE_DEPENDS ${YO2_STUBS}/*.cpp)
# EXCLUDE_FROM_ALL: it links only after gen_stubs.py (which builds --target yo2native); a plain build skips it
add_executable(yo2native EXCLUDE_FROM_ALL main.cpp stubhit.cpp app_glue.cpp yane_glue.cpp ${STUB_SRC})
target_compile_definitions(yo2native PRIVATE NOMINMAX)
# yane_glue.cpp includes yaneSDK's headers: their own language mode, like the yanesdk library
set_source_files_properties(yane_glue.cpp PROPERTIES COMPILE_OPTIONS
                            "-std=gnu++11;-fms-extensions;-fdelayed-template-parsing;-w;-UNOMINMAX")
target_include_directories(yo2native PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
# force_load: every rewritten function is in, called yet or not, so the stub set is the true remainder
target_link_libraries(yo2native PRIVATE -Wl,-force_load,$<TARGET_FILE:yo2core> yo2core yanesdk yo2win32 yo2net yo2vfs
                      yo2gfx yo2audio yo2platform)
