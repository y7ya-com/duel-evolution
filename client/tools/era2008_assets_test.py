"""Integration check against the owner's game data; no derived outputs are kept in the repository."""
import json
import os
from pathlib import Path
import tempfile
import unittest

from era2008_assets import build, Merge

ROOT = Path(__file__).resolve().parents[2]
MERGE = Path(os.environ.get("YO2_MERGE", str(Path.home() / ".cache/yo2-game/merge.dat")))
CARDS = ROOT / "server/gamedata/cards.json"


@unittest.skipUnless(MERGE.exists() and CARDS.exists(), "requires original game data")
class LegacyAssetsTest(unittest.TestCase):
    def test_faces_and_descriptions_match_original_effects_and_cover_alternate_art(self):
        catalog = json.loads((ROOT / "server/src/duel/engine/era2008.json").read_text())
        cards = json.loads(CARDS.read_text())
        with tempfile.TemporaryDirectory() as out:
            m = Merge(str(MERGE))
            try:
                entries = build(m, cards, catalog, out)
                by_pc = {c["pc"]: c for c in cards}
                for entry in entries.values():
                    pc = entry["pc"]
                    self.assertTrue(all(entry["text"].get(lang) for lang in "EFGISJK"))
                    for folder, key in (("card", "big"), ("mini", "mini")):
                        expected = m.read(f"data/{folder}/{by_pc[pc][key]}")
                        for ext in ("png", "jpg"):
                            self.assertEqual((Path(out) / f"merge/data/{folder}/{pc}.{ext}").read_bytes(), expected)
                text = {e["pc"]: e["text"]["E"] for e in entries.values()}
                self.assertNotIn("Normal Summoned", text[87910978])
                self.assertIn("both players", text[83555666])
                self.assertNotIn("1st Standby", text[77565204])
                self.assertIn(57728571, text)  # alternate-art Crush Card Virus
                self.assertEqual(len((Path(out) / "files.txt").read_text().splitlines()), len(entries) * 4)
            finally:
                m.f.close()


if __name__ == "__main__":
    unittest.main()
