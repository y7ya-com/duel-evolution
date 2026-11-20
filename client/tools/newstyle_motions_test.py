"""newstyle_motions.py: the 56 dumps per body, in the shape src/Swf/yo2SwfReader.cpp reads, naming only pictures that
exist (a missing or unreadable chibi PNG stops the game: CTextureManager's assert). No game data needed."""
import os
from pathlib import Path
import re
import tempfile
import unittest

import newstyle_motions as N

# the legacy template names applyMaleParts / applyFemaleParts rewrite, and the shared legacy pictures: in merge.dat
LEGACY = re.compile(r"^cm_(atari_01|sh_01_c01_n01_01|(bo|h1|h2)_01_c01_[nw]0[1-5]_0[1-3]|(mo|ey|a1|a2)_01_c01_n0[1-5]_0[1-3]"
                    r"|dd_01_c01_d01_0[1-5])\.png$")


class MotionsTest(unittest.TestCase):
    def test_every_engine_has_a_dump_whose_pictures_exist(self):
        with tempfile.TemporaryDirectory() as out:
            anchors = N.default_anchors()
            for body in 'mf':
                files = N.motion_files(body)
                self.assertEqual(len(files), 4 * 8 + 3)   # n w g t x 8 facings, d01_01..03 for every facing: 56 engines
                N.placeholder(out, body, anchors)
                pre = 'cm' if body == 'm' else 'cw'
                for name, (m, f) in files.items():
                    text = N.motion_dump(m, f, anchors, 'shape').decode('ascii')
                    self.assertIn('\r\n', text)
                    pngs = re.findall(r'png => ([^,]+),', text)
                    for p in pngs:
                        body_pic = p.replace('cm_', pre + '_', 1)
                        self.assertTrue(LEGACY.match(p) or os.path.exists(Path(out) / body_pic), (name, p))
                    frames = sum(1 for l in text.split('\r\n') if l.startswith('SWF::Element::Tag::ShowFrame->new('))
                    count, total, _ = N.MOTIONS[m]
                    self.assertEqual(frames, total, name)
                    self.assertIn('Name => "cm_atari_01_mc"', text)   # the lobby's hit area

    def test_the_head_follows_the_neck_anchor(self):
        anchors = N.default_anchors()
        anchors['w'][2][3] = [N.NECK_REF[0] + 5, N.NECK_REF[1] - 4]   # facing 3, walk frame 4: 5 right, 4 up
        text = N.motion_dump('w', 3, anchors, 'shape').decode('ascii')
        hair = (N.HAIR_AT[0] + 5) * 20, (N.HAIR_AT[1] - 4) * 20
        self.assertIn(f'TranslateX => {hair[0]},\r\n        TranslateY => {hair[1]},', text)

    def test_facings_6_to_8_use_the_mirrored_legacy_head(self):
        text = N.motion_dump('n', 7, N.default_anchors(), 'shape').decode('ascii')
        self.assertIn('cm_h1_01_c01_n03_01.png', text)    # facing 7 = facing 3 drawn mirrored by the engine
        self.assertIn('cm_nb_00_c01_n07_01.png', text)    # but its own body

    def test_the_head_is_drawn_over_the_body(self):
        for f in range(1, 9):
            text = N.motion_dump('n', f, N.default_anchors(), 'trim').decode('ascii')
            pngs = re.findall(r'png => ([^,]+),', text)
            body, head = pngs.index(f'cm_nb_00_c01_n{f:02d}_01.png'), pngs.index(f'cm_nb_00_c01_hsn{f:02d}_01.png')
            places = [int(x) for x in re.findall(r'FileName => (\d+),', text)]
            self.assertLess(places.index(body), places.index(head), f)   # characters are defined in depth order

    def test_legacy_frame_counts_and_every_body_frame_shown(self):
        anchors = N.default_anchors()
        for m, (count, total, code) in N.MOTIONS.items():
            text = N.motion_dump(m, 1, anchors, 'trim').decode('ascii')
            self.assertIn(f'Frame count = {total}', text)
            shown = set(re.findall(rf'cm_nb_00_c01_{code}01_(\d\d)\.png', text))
            self.assertEqual(len(shown), count, m)


if __name__ == '__main__':
    unittest.main()
