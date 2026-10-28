// The native exe's entry. The CRT start-up (0x00b0ddb0) is the host's C runtime here; like it, main() hands the
// command line to WinMain and exits with its result.
#include <string>

// @yo2-native 0x00606ab0 WinMain: written as yo2WinMain in src/System/yo2App.cpp on phase2-system (not on main yet)
int yo2WinMain(void* instance, void* prevInstance, const char* cmdLine, int show);

int main(int argc, char** argv) {
    std::string cmd;
    for (int i = 1; i < argc; i++) cmd += (i > 1 ? " " : "") + std::string(argv[i]);
    return yo2WinMain(nullptr, nullptr, cmd.c_str(), 10 /*SW_SHOWDEFAULT*/);
}
