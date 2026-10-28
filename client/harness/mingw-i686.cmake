# cmake -S . -B build-i686 -DCMAKE_TOOLCHAIN_FILE=harness/mingw-i686.cmake
set(CMAKE_SYSTEM_NAME Windows)
set(CMAKE_SYSTEM_PROCESSOR i686)
set(CMAKE_C_COMPILER i686-w64-mingw32-gcc)
set(CMAKE_CXX_COMPILER i686-w64-mingw32-g++)
set(CMAKE_RC_COMPILER i686-w64-mingw32-windres)
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
# MSVC 6 (the original's compiler) had no thread-safe local statics; gcc's guards pull winpthreads into every static.
set(CMAKE_CXX_FLAGS_INIT -fno-threadsafe-statics)
