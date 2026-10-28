// MSVC multibyte-character helpers for non-Windows: code page 932 (Shift-JIS), the game's ANSI code page.
#pragma once
inline int _ismbblead(unsigned int c) { return (c >= 0x81 && c <= 0x9F) || (c >= 0xE0 && c <= 0xFC); }
