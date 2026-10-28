# Platform layer (phase 3). Native: SDL2 + OpenGL 3.3 core + BSD sockets. Web (emcmake): SDL2 port + WebGL2 +
# WebSocket to Boxedwine's network-gateway.mjs. See DESIGN.md.

if(EMSCRIPTEN)
  add_library(yo2net STATIC net/net_ws.cpp net/net_yg.cpp)
  target_link_options(yo2net PUBLIC -lwebsocket.js)
else()
  add_library(yo2net STATIC net/net_posix.cpp net/net_yg.cpp)
endif()
target_include_directories(yo2net PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(yo2net PUBLIC yo2core)

add_library(yo2platform STATIC sdl/platform.cpp)
target_include_directories(yo2platform PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/sdl ${CMAKE_CURRENT_SOURCE_DIR})
if(NOT WIN32)   # the Windows SDK stand-ins: <windows.h>, <d3d8.h>, <dsound.h>, <dinput.h>, ... (win32/windows.h)
  target_include_directories(yo2platform BEFORE PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/win32)
endif()
if(EMSCRIPTEN)
  target_compile_options(yo2platform PUBLIC -sUSE_SDL=2)
  target_link_options(yo2platform PUBLIC -sUSE_SDL=2 -sMAX_WEBGL_VERSION=2 -sMIN_WEBGL_VERSION=2)
else()
  find_package(SDL2 REQUIRED CONFIG)
  find_package(OpenGL REQUIRED)
  target_link_libraries(yo2platform PUBLIC SDL2::SDL2 OpenGL::GL)
endif()

add_library(yo2audio STATIC audio/dsound.cpp)
target_link_libraries(yo2audio PUBLIC yo2platform)

if(NOT WIN32)
  add_library(yo2win32 STATIC win32/win32.cpp)   # the Win32 calls yaneSDK and the game make
  target_sources(yo2win32 PRIVATE win32/win32_nodevice.cpp)   # DirectDraw, MCI, file dialogs: "no such device"
  target_link_libraries(yo2win32 PUBLIC yo2audio yo2platform)
  # GDI, fonts (stb_truetype), code pages (tables generated from Python's codecs), OLE pictures (stb_image)
  find_package(Python3 COMPONENTS Interpreter REQUIRED)
  set(YO2_GEN ${CMAKE_CURRENT_BINARY_DIR}/gen)
  file(MAKE_DIRECTORY ${YO2_GEN})
  execute_process(COMMAND ${Python3_EXECUTABLE} -I ${CMAKE_CURRENT_SOURCE_DIR}/tools/gen_codepages.py
                          ${YO2_GEN}/codepages.inc RESULT_VARIABLE rc)
  if(rc)
    message(FATAL_ERROR "gen_codepages.py failed")
  endif()
  target_sources(yo2win32 PRIVATE win32/text.cpp win32/gdi.cpp win32/font.cpp win32/ole.cpp)
  target_include_directories(yo2win32 PRIVATE ${YO2_GEN} ${CMAKE_CURRENT_SOURCE_DIR}/third_party)
  add_executable(gdi_test tests/gdi_test.cpp)   # native, and under Node: node build-web/platform/gdi_test.js
  target_link_libraries(gdi_test PRIVATE yo2win32)
  if(EMSCRIPTEN)
    target_link_options(gdi_test PRIVATE -sENVIRONMENT=node -sEXIT_RUNTIME=1 -sNODERAWFS=1)
  endif()
  if(EMSCRIPTEN)   # Win32 threads are fibers on the browser thread (win32/coop.h)
    target_sources(yo2win32 PRIVATE win32/coop.cpp)
    target_link_options(yo2win32 PUBLIC -sASYNCIFY -sASYNCIFY_STACK_SIZE=65536)
  endif()
endif()

add_executable(yo2_skeleton sdl/main.cpp)
target_link_libraries(yo2_skeleton PRIVATE yo2platform yo2net yo2gfx)
if(EMSCRIPTEN)
  set_target_properties(yo2_skeleton PROPERTIES SUFFIX ".html")
endif()

if(NOT EMSCRIPTEN)
  add_executable(gate_hello tests/gate_hello.cpp)   # blocking test loop: native only
  target_link_libraries(gate_hello PRIVATE yo2net)
  add_executable(ygnet_test tests/ygnet_test.cpp)
  target_link_libraries(ygnet_test PRIVATE yo2net)
  add_executable(audio_test tests/audio_test.cpp)
  target_link_libraries(audio_test PRIVATE yo2audio)
  add_executable(platform_test tests/platform_test.cpp)
  target_link_libraries(platform_test PRIVATE yo2platform)
endif()

# Parts written in parallel keep their targets in their own file
include(gfx/gfx.cmake OPTIONAL)
include(vfs/vfs.cmake OPTIONAL)
include(tests/ws_e2e/ws_e2e.cmake OPTIONAL)
