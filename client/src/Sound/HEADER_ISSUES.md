# Issues found while porting src/Sound

- labels.tsv files the WinSock layer of the message code (0x68a530, 0x68b3e0, 0x68b6c0, 0x68b7e0, 0x68b9b0) and the
  message cipher's static object (0x689e40 / 0x689e60) under Sound because of where they sit. They are ported here
  (src/Sound/ygNetWin32.cpp, Windows only); 0x68b9b0 (WSAAsyncSelect) is already marked by src/Net in the Net
  branches, so it is left to them.
- **0x68b7e0 is `__stdcall`** (`ret 0x10`). `harness/hooks/net_platform.cpp`'s `ygConnectAsync` calls it through a
  `__cdecl` pointer, which unbalances the stack by 16 bytes on every connect. The difftest case for 0x68b7e0 runs
  it as stdcall.
- `include/yo2/Sound/CSoundTest.h`: `f_0x70` is a `CElement*` (the layer New() was given), not a u32.
