# include/yo2 issues seen while porting src/team (for the include/ owner)

`src/team/yo2TeamFlag.h` keeps CTeamFlagManager (0xb0) and CTeamFlagLoader (0xc8) at the generated sizes; no offset
disagrees.

- **CTeamFlagManager**: +0x74 is a std::map<uint32_t, {u32 version, u32 id, std::string path, bool loaded}> (ctor
  0xb05130: head node at +0x78, size +0x80; node value at +0x10), +0x84 a std::string ("teamflag/"), +0x98 the flag
  being downloaded, +0x9c a `CTaskPtr<CTeamFlagLoader>` (vtable 0xbf463c), +0xa8 the current `IFlagLoadState*`. The
  header shows `f_0x78` int32 / `_pad` / `f_0xa0`..`f_0xa8`.
- **IFlagLoadContext** slots (0xb05640, 0xb05300, 0xb05330, 0xb05d50, 0xb05350, 0xb05370): startDownload(u32),
  loader() -> CTeamFlagLoader*, flags() -> map*, setState(IFlagLoadState*) -> bool, changed() -> bool,
  setChanged(bool). **IFlagLoadState** has one slot, update(IFlagLoadContext*) (generated with no virtuals; the
  subclasses declare `vf00(void*)`).
- **CFlagLoadIdle / CFlagLoadLoading** are generated under include/yo2/System, but their code (0xb04a10, 0xb04b60, and
  the instance getters 0xb049a0 / 0xb04af0, labelled System) sits in yo2TeamFlag.cpp's block; src/team ports them.
- **CTeamFlagLoader**: +0x74 is a `CDownloadTask*` (0x6a04b0), +0x78/+0x79/+0x7a finished/busy/ok, three std::strings
  at +0x7c (URL), +0x8c (file name), +0x9c (local path), and a 0x18-byte buffer at +0xac (0xb05f10 / 0xb06080).
- **labels.tsv**: CTeamFlagLoader::reset 0xb06890 is labelled 3rd-party (it sits among the map template instances);
  src/team ports it.
