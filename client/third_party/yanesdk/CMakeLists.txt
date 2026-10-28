# yaneSDK 2nd v1.65 + Konami's changes, as linked into yo2.exe. Windows-only (Win32/DirectX/MMX) for now.
#   standalone: cmake -S third_party/yanesdk -B build-yane -DCMAKE_TOOLCHAIN_FILE=$PWD/third_party/yanesdk/cmake/mingw-i686.cmake
cmake_minimum_required(VERSION 3.20)
if(NOT DEFINED PROJECT_NAME)
  project(yanesdk CXX)
endif()
if(NOT WIN32)
  # [portable] Non-Windows (native SDL/GL, Emscripten): the Win32/DirectX headers come from platform/win32, and
  # the Shift-JIS sources are rewritten for clang first (platform/tools/sjis_for_clang.py: comments to UTF-8,
  # literals escaped to the same bytes MSVC produced). Needs the platform targets (yo2win32).
  if(NOT TARGET yo2win32)
    message(STATUS "yanesdk: needs platform/ (yo2win32) for a non-Windows build; skipped")
    return()
  endif()
  find_package(Python3 REQUIRED COMPONENTS Interpreter)
  file(GLOB YANE_ALL RELATIVE ${CMAKE_CURRENT_SOURCE_DIR} CONFIGURE_DEPENDS
       ${CMAKE_CURRENT_SOURCE_DIR}/*.cpp ${CMAKE_CURRENT_SOURCE_DIR}/*.h
       ${CMAKE_CURRENT_SOURCE_DIR}/YTL/*.h ${CMAKE_CURRENT_SOURCE_DIR}/config/*.h)
  set(YANE_GEN ${CMAKE_CURRENT_BINARY_DIR}/src)
  set(SJIS_TOOL ${CMAKE_CURRENT_SOURCE_DIR}/../../platform/tools/sjis_for_clang.py)
  execute_process(COMMAND ${Python3_EXECUTABLE} -I ${SJIS_TOOL} ${CMAKE_CURRENT_SOURCE_DIR} ${YANE_GEN} ${YANE_ALL}
                  RESULT_VARIABLE rc)
  if(rc)
    message(FATAL_ERROR "yanesdk: sjis_for_clang.py failed")
  endif()
  set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${SJIS_TOOL})
  foreach(f ${YANE_ALL})   # editing a source re-runs the conversion
    set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/${f})
  endforeach()
  set(YANE_SRC "")
  foreach(f ${YANE_ALL})
    if(f MATCHES "\\.cpp$")
      list(APPEND YANE_SRC ${YANE_GEN}/${f})
    endif()
  endforeach()
  add_library(yanesdk STATIC ${YANE_SRC})
  target_include_directories(yanesdk PUBLIC ${YANE_GEN})
  target_compile_options(yanesdk PRIVATE -fms-extensions -fdelayed-template-parsing -w)
  set_target_properties(yanesdk PROPERTIES CXX_STANDARD 11 CXX_EXTENSIONS ON)
  target_link_libraries(yanesdk PUBLIC yo2win32)
  add_executable(yane_test ${CMAKE_CURRENT_SOURCE_DIR}/../../platform/tests/yane_test.cpp)
  target_compile_options(yane_test PRIVATE -fms-extensions -fdelayed-template-parsing -w)
  set_target_properties(yane_test PROPERTIES CXX_STANDARD 11 CXX_EXTENSIONS ON)
  target_link_libraries(yane_test PRIVATE yanesdk)
  if(EMSCRIPTEN)   # node build/web/third_party/yanesdk/yane_test.js: the same app on the cooperative loop
    target_link_options(yane_test PRIVATE -sENVIRONMENT=node -sEXIT_RUNTIME=1 -sNODERAWFS=1)
  endif()
  return()
endif()

# ponytail: every .cpp; the ones yaneConfig.h switches off (CPlane, saver, AVI/DS movie, MIDI MCI/DM) compile to nothing
file(GLOB YANESDK_SRC CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/*.cpp)
add_library(yanesdk STATIC ${YANESDK_SRC})
target_include_directories(yanesdk PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
# MSVC6-era C++: no ISO for-scope / iterator rules, Shift-JIS sources and string literals
set_target_properties(yanesdk PROPERTIES CXX_STANDARD 98 CXX_EXTENSIONS ON)
if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
  target_compile_options(yanesdk PRIVATE -fpermissive -finput-charset=CP932 -fexec-charset=CP932 -w)
endif()
target_link_libraries(yanesdk INTERFACE winmm dxguid ddraw dsound dinput msacm32 vfw32 strmiids imm32 ole32 oleaut32 uuid
  gdi32 comdlg32 shell32 version)
