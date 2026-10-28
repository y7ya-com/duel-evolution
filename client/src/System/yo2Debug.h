// The game's debug helpers: printf into a shared buffer, the assertion box, and the (release-empty) trace.
#pragma once

// printf into one static 1 KB-ish buffer; the result is valid until the next call.
const char* yo2Format(const char* fmt, ...);

// The assertion dialog. The exe builds "file(line) msg", copies it to the clipboard, shows a MessageBox and
// returns false, after which every caller exits. `ignore` is the per-site "don't ask again" flag (never set in
// the shipped exe). We print to stderr instead of the clipboard/MessageBox.
bool yo2AssertFailed(bool* ignore, const char* msg, const char* file, int line);

// yaneSDK's debug trace: compiled out of the shipped exe (an empty function). Kept as a hook for debugging.
void yo2Trace(const char* fmt, ...);

// The pattern every yo2 assert expands to: a static ignore flag per site, then exit(1) if the box returns false.
#define YO2_ASSERT(cond, ...)                                                                        \
    do {                                                                                              \
        static bool yo2Ignore_;                                                                       \
        if (!yo2Ignore_ && !(cond) && !yo2AssertFailed(&yo2Ignore_, yo2Format(__VA_ARGS__), __FILE__, \
                                                       __LINE__))                                     \
            yo2Exit(1);                                                                               \
    } while (0)

[[noreturn]] void yo2Exit(int code);
