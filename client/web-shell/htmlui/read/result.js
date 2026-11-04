// The duel result windows (src/Result/yo2ResultWindow.h, offsets pinned there by YO2_AT; HEADER_ISSUES.md): a player's
// record (CWindowResult: its three numbers are raw CTextElms beside the captions, not controls) and the NPC record
// (CWindowResultNpc: its numbers are ShadowText controls already). screens/result.js draws them.
export default h => {
  const { i32, ptr, str, label } = h;
  // a CTaskPtr<CTextElm> (task_ at +4) as a Label: its text ("@9" + the number), its world position
  const num = a => { const e = ptr(a); return e ? label(e) : null; };
  return {
    windows: {
      // side_ 0x3d0 (0 the left window, else the right), kind_ 0x3cc (the frame's), name_ 0x3d4 (std::string),
      // wins_ / loses_ / score_ 0x3e4..0x3ec; winNum_ / loseNum_ / scoreNum_ 0x3a8 / 0x3b4 / 0x3c0
      CWindowResult: w => ({ side: i32(w + 0x3d0), kind: i32(w + 0x3cc), player: str(w + 0x3d4),
        record: { wins: i32(w + 0x3e4), loses: i32(w + 0x3e8), score: i32(w + 0x3ec) },
        nums: [num(w + 0x3a8), num(w + 0x3b4), num(w + 0x3c0)].filter(Boolean) }),
      // wins_ / loses_ / draws_ 0x420..0x428 (the counts' texts are its ShadowTexts)
      CWindowResultNpc: w => ({ record: { wins: i32(w + 0x420), loses: i32(w + 0x424), draws: i32(w + 0x428) } }),
    },
  };
};
