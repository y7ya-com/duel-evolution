"""custom_assets.py: the authored items' loose game files, and that every place naming them agrees.

python3 client/tools/custom_assets_test.py   (the last tests need the owner's merge.dat: YO2_MERGE, numpy, and the
packs' art from infra/fetch-private.sh)
"""
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import unittest

from custom_assets import NEWSTYLE, NEWSTYLE_WU, newstyle_wu_table, build, load_packs, newstyle_table, patch_pbin, patch_waistup, rehash, write_manifest

ROOT = Path(__file__).resolve().parents[2]
PACKS = ROOT / "client/custom-assets"
MERGE = Path(os.environ.get("YO2_MERGE", str(Path.home() / ".cache/yo2-game/merge.dat")))
try:
    import numpy  # noqa: F401  (cardart.py's)
    HAVE_NUMPY = True
except ImportError:
    HAVE_NUMPY = False


def native_pbin():
    rows = [f"{b},{b & 255},0,0,0,0,---,0" for b in range(1024)]
    rows[180] = "180,180,0,1,8,3417,disk,2"
    return ("\r\n".join(["// pbin", *rows]) + "\r\n").encode("cp932")


CSV = ("12,180,wm_dd_02_c02_r.png,wm_dd_02_c02_l.png,****,****,****,****,****,0,360,768,344\r\n"
       "10,121,wm_dc_04_c01_r.png,wm_dc_04_c01_l.png,****,****,****,****,****,0,248,768,520\r\n").encode("cp932")
DISK = {"id": "dueldisk:test", "name": "Test Disk", "kind": "dueldisk", "part": 216, "pbin": [216, 472], "text": 60001,
        "art": "tt_01_c01", "waistup": {"wm": [0, 0, 768, 768], "ww": [0, 375, 768, 360]}}
OUTFIT = {"id": "outfit:test", "name": "Test Garms", "kind": "outfit", "newstyle": [["m", "79", "01"]],
          "replaces": ["merge/data/avatar/wu/wm_dc_04_c01_r.png"]}


class FakeMerge:
    def __init__(self, files): self.files = files
    def read(self, name): return self.files[name]


def merge():
    return FakeMerge({"data/common/yo2pbinmap.dat": native_pbin(), "data/avatar/wu/wm_data.csv": CSV,
                      "data/avatar/wu/ww_data.csv": CSV, "data/avatar/wu/wm_dc_04_c01_r.png": b"old"})


class TablesTest(unittest.TestCase):
    def test_pbin_rows_fill_vacant_bits_for_both_bodies(self):
        out = patch_pbin(native_pbin(), [DISK]).decode("cp932").split("\r\n")
        self.assertIn("216,216,0,1,8,60001,Test Disk,1", out)
        self.assertIn("472,216,0,2,8,60001,Test Disk,1", out)
        self.assertEqual(out[0], "// pbin")
        self.assertEqual(len(out), 1026)   # the comment, 1024 rows, the last CRLF
        with self.assertRaises(ValueError):   # an occupied bit
            patch_pbin(native_pbin(), [{**DISK, "pbin": [180, 436]}])

    def test_waistup_row_names_both_poses_at_the_pack_rect(self):
        out = patch_waistup(CSV, "ww", [DISK]).decode("cp932")
        self.assertTrue(out.endswith("\r\n12,216,ww_tt_01_c01_r.png,ww_tt_01_c01_l.png,****,****,****,****,****,0,375,768,360\r\n"))
        self.assertTrue(out.startswith(CSV.decode()))
        with self.assertRaises(ValueError):
            patch_waistup(CSV, "wm", [{**DISK, "part": 180}])

    def test_an_existing_waistup_row_gets_the_new_art_rect(self):
        out = patch_waistup(CSV, "wm", [{**OUTFIT, "waistupRows": {"wm": {"10,121": [0, 200, 768, 568]}}}]).decode("cp932")
        self.assertIn("\r\n10,121,wm_dc_04_c01_r.png,wm_dc_04_c01_l.png,****,****,****,****,****,0,200,768,568\r\n", out)
        self.assertEqual(out.count("\r\n"), 2)
        with self.assertRaises(ValueError):   # no such row
            patch_waistup(CSV, "wm", [{**OUTFIT, "waistupRows": {"wm": {"10,999": [0, 0, 1, 1]}}}])

    def test_newstyle_table(self):
        t = newstyle_table([OUTFIT, DISK]).decode()
        self.assertEqual([line.split("#")[0].split() for line in t.splitlines() if not line.startswith("#")], [["m", "79", "01"]])
        self.assertIsNone(newstyle_table([DISK]))
        for bad in (["x", "79", "01"], ["m", "7g", "01"], ["m", "79", "00"], ["m", "79", "1"]):
            with self.assertRaises(ValueError):
                newstyle_table([{**OUTFIT, "newstyle": [bad]}])
        with self.assertRaises(ValueError):   # the same code twice
            newstyle_table([OUTFIT, {**OUTFIT, "id": "outfit:other", "newstyle": [["m", "7a", "01"]]}])


class BuildTest(unittest.TestCase):
    def make(self, tmp, pack, files):
        pack_dir = Path(tmp) / "packs" / "p"
        for rel, data in files.items():
            (pack_dir / "art" / rel).parent.mkdir(parents=True, exist_ok=True)
            (pack_dir / "art" / rel).write_bytes(data)
        (pack_dir / "pack.json").write_text(json.dumps({**pack, "files": {}}))
        rehash(str(pack_dir))
        return pack_dir

    def outfit_files(self):
        f = {f"merge/data/avatar/chibi/cm_nb_01_c0{s}.pak": f"pak {s}".encode() for s in (1, 2, 3)}
        f["merge/data/avatar/wu/wm_dc_04_c01_r.png"] = b"new waist-up"
        return f

    def test_a_newstyle_outfit_ships_its_packs_the_table_and_the_replaced_waistup(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make(tmp, OUTFIT, self.outfit_files())
            out = Path(tmp) / "out"
            out.mkdir()
            (out / "files.txt").write_text("5\tmerge/data/card/1.png\n")
            written = build(merge(), load_packs(str(Path(tmp) / "packs")), str(out))
            write_manifest(str(out), written)
            self.assertEqual(sorted(written), sorted([*self.outfit_files(), NEWSTYLE]))
            self.assertTrue((out / NEWSTYLE).read_text().splitlines()[1].startswith("m 79 01"))
            manifest = (out / "files.txt").read_text().splitlines()
            self.assertIn("5\tmerge/data/card/1.png", manifest)
            self.assertIn("12\tmerge/data/avatar/wu/wm_dc_04_c01_r.png", manifest)
            self.assertFalse((out / "merge/data/common/yo2pbinmap.dat").exists(), "no table changed: none written")

    def test_refusals(self):
        cases = {
            "a skin tone's pack missing": (OUTFIT, {k: v for k, v in self.outfit_files().items() if not k.endswith("c03.pak")}),
            "an override not listed": ({**OUTFIT, "replaces": []}, self.outfit_files()),
            "listed but nothing to override": ({**OUTFIT, "replaces": [*OUTFIT["replaces"], "merge/data/avatar/wu/wm_zz_01_c01_r.png"]},
                                               {**self.outfit_files(), "merge/data/avatar/wu/wm_zz_01_c01_r.png": b"x"}),
            "a placeholder": ({**OUTFIT, "placeholder": OUTFIT["replaces"]}, self.outfit_files()),
            "the table itself": (OUTFIT, {**self.outfit_files(), NEWSTYLE: b"m 79 01\n"}),
        }
        for why, (pack, files) in cases.items():
            with tempfile.TemporaryDirectory() as tmp, self.subTest(why):
                self.make(tmp, pack, files)
                with self.assertRaises(ValueError):
                    build(merge(), load_packs(str(Path(tmp) / "packs")), str(Path(tmp) / "out"))
        with tempfile.TemporaryDirectory() as tmp:   # a placeholder on a DRY test page: allowed
            self.make(tmp, {**OUTFIT, "placeholder": OUTFIT["replaces"]}, self.outfit_files())
            build(merge(), load_packs(str(Path(tmp) / "packs")), str(Path(tmp) / "out"), allow_placeholders=True)

    def test_art_that_is_not_the_pack_json_s_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = self.make(tmp, OUTFIT, self.outfit_files())
            (d / "art/merge/data/avatar/chibi/cm_nb_01_c02.pak").write_bytes(b"other")
            with self.assertRaises(ValueError):
                build(merge(), load_packs(str(Path(tmp) / "packs")), str(Path(tmp) / "out"))
            (d / "art/merge/data/avatar/chibi/cm_nb_01_c02.pak").unlink()
            with self.assertRaises(FileNotFoundError):
                build(merge(), load_packs(str(Path(tmp) / "packs")), str(Path(tmp) / "out2"))


WU_OUTFIT = {"id": "outfit:wu", "name": "Waist Garms", "kind": "outfit", "newstyleWaistup": [["m", "79", "01", "wm_dc_04_c01"]]}


class NewstyleWaistupTest(unittest.TestCase):
    make = BuildTest.make

    def test_the_table_names_the_clothes_row_s_own_picture(self):
        t = newstyle_wu_table([WU_OUTFIT], merge()).decode()
        self.assertEqual(t.splitlines()[1], "m 79 01 wm_dc_04_c01  # outfit:wu")
        self.assertIsNone(newstyle_wu_table([DISK]))
        for bad in (["m", "79", "01", "wm_dc_05_c01"], ["m", "78", "01", "wm_dc_04_c01"], ["f", "79", "01", "wm_dc_04_c01"],
                    ["m", "79", "00", "wm_dc_04_c01"], ["m", "79", "01", "wm_dc_04_c01; rm"]):
            with self.assertRaises(ValueError, msg=bad):
                newstyle_wu_table([{**WU_OUTFIT, "newstyleWaistup": [bad]}], merge())
        with self.assertRaises(ValueError):   # one clothes number, two items
            newstyle_wu_table([WU_OUTFIT, {**WU_OUTFIT, "id": "outfit:o", "newstyleWaistup": [["m", "79", "02", "wm_dc_04_c01"]]}])

    def test_the_pack_and_the_table_ship(self):
        with tempfile.TemporaryDirectory() as tmp:
            files = {"merge/data/avatar/wu/wm_nw_01.pak": b"pak"}
            self.make(tmp, WU_OUTFIT, files)
            written = build(merge(), load_packs(str(Path(tmp) / "packs")), str(Path(tmp) / "out"))
            self.assertEqual(sorted(written), sorted([*files, NEWSTYLE_WU]))
        with tempfile.TemporaryDirectory() as tmp:   # its pack missing
            self.make(tmp, WU_OUTFIT, {"merge/data/avatar/wu/wm_nw_02.pak": b"another code"})
            with self.assertRaises(ValueError):
                build(merge(), load_packs(str(Path(tmp) / "packs")), str(Path(tmp) / "out"))


class AgreementTest(unittest.TestCase):
    """The packs' new-style rows name the server's items (cosmetics-catalog.ts) and their native rows (lobby.json)."""

    def test_every_newstyle_row_is_the_item_s_own_row(self):
        catalog = (ROOT / "server/src/game/cosmetics-catalog.ts").read_text()
        outfits = dict((f"outfit:{m[1]}", int(m[0])) for m in re.findall(r'(\d+): \["([a-z-]+)", "[^"]+", "\w+"\]', catalog))
        lobby = ROOT / "server/gamedata/lobby.json"
        rows = json.loads(lobby.read_text())["avatar_pbin"] if lobby.exists() else None
        packs = load_packs(str(PACKS))
        self.assertIn("outfit:yugi", [p["id"] for p in packs])
        for p in packs:
            for body, clothes, code in p.get("newstyle", []):
                self.assertIn(p["id"], outfits, "a catalog item")
                if rows is not None:   # [number, initial, kind 1 male / 2 female, slot, text, series]
                    hit = [r for r in rows.values() if r[4] == outfits[p["id"]] and r[2] == (1 if body == "m" else 2)]
                    self.assertEqual([r[0] for r in hit], [int(clothes, 16)], p["id"])
                    self.assertEqual(hit[0][3], 6, "an outfit row")
        yugi = next(p for p in packs if p["id"] == "outfit:yugi")
        self.assertEqual(yugi["newstyle"], [["m", "79", "01"]])   # male only: Téa's Garms (female, also dc_04) stay legacy


@unittest.skipUnless(MERGE.exists() and HAVE_NUMPY, "requires original game data (and numpy for cardart.py)")
class OriginalTablesTest(unittest.TestCase):
    def test_the_packs_build_against_the_original_archive(self):
        from cardart import Merge
        packs = load_packs(str(PACKS))
        if not all((Path(p["dir"]) / "art" / rel).exists() for p in packs for rel in p["files"]):
            self.skipTest("the packs' art (infra/fetch-private.sh)")
        m = Merge(str(MERGE))
        try:
            with tempfile.TemporaryDirectory() as tmp:
                written = build(m, packs, tmp, allow_placeholders=True)
                self.assertIn(NEWSTYLE, written)
                for p in packs:
                    for rel in p.get("replaces", []):
                        self.assertTrue(m.read(rel[len("merge/"):]), rel)
        finally:
            m.f.close()

    def test_the_newstyle_packs_pass_the_engine_s_check(self):
        import newstyle_pack as NP
        for p in load_packs(str(PACKS)):
            for body, _, code in p.get("newstyle", []):
                pre = "cw" if body == "f" else "cm"
                for s in (1, 2, 3):
                    f = Path(p["dir"]) / "art/merge/data/avatar/chibi" / f"{pre}_nb_{code}_c0{s}.pak"
                    if not f.exists():
                        self.skipTest("the packs' art (infra/fetch-private.sh)")
                    got = NP.read_pak(f.read_bytes())
                    self.assertEqual([n for n in NP.required(pre, code, s) if n not in got], [])
                    self.assertEqual(hashlib.sha256(f.read_bytes()).hexdigest(), p["files"][str(f.relative_to(Path(p["dir"]) / "art"))])


if __name__ == "__main__":
    unittest.main()
