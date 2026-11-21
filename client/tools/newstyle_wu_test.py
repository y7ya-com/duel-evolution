"""newstyle_wu.py: the pack format, the ramp, the pixel helpers and the calibration, on synthetic data (no game art).

python3 client/tools/newstyle_wu_test.py   (numpy, opencv, scipy, pillow; skipped without them)
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import numpy as np
    import cv2  # noqa: F401
    import scipy  # noqa: F401
    from PIL import Image  # noqa: F401
    HAVE = True
except ImportError:
    HAVE = False
import newstyle_wu as N   # noqa: E402


@unittest.skipUnless(HAVE, "numpy, opencv, scipy, pillow")
class PackTest(unittest.TestCase):
    def test_the_placeholder_round_trips_with_the_renderers_numbers(self):
        ents = N.read_pak(N.placeholder())
        wu = N.parse_wu(ents['wu.txt'])
        self.assertEqual(wu['bare'], [0, N.BODY_Y])
        self.assertEqual(wu['pose']['r']['disk'], [300, 430, 10, 1, 6, -4])
        # the ramp: the numbers rt/nwpak_test.c and waistup_newstyle_test.mjs check
        lut = N.ramp_lut(N.PLACEHOLDER_RAMP, 3)
        self.assertEqual((lut[150], lut[200], lut[73]), ([151, 71, 49], [184, 101, 72], [68, 37, 27]))

    def test_broken_packs_are_refused(self):
        good = N.placeholder()
        for bad in (good[:-5], good + b'\0', b'YO2NSPK2' + good[8:], good[:200] + bytes([good[200] ^ 1]) + good[201:]):
            with self.assertRaises(ValueError):
                N.read_pak(bad)
        txt = N.read_pak(good)['wu.txt'].decode()
        for old, new in (('bare 0 112\n', ''), ('disk l', 'disc l'), ('ramp 0 73', 'ramp 1 73'), ('pose r 284 300 200 300', 'pose r 600 300 200 300')):
            with self.assertRaises(ValueError, msg=new):
                N.parse_wu(txt.replace(old, new, 1).encode())

    def test_skin_greys_only_are_swapped(self):
        img = np.zeros((2, 2, 4), np.uint8)
        img[0, 0] = (200, 200, 200, 255)   # skin
        img[0, 1] = (128, 128, 129, 255)   # cloth, nudged off grey
        img[1, 0] = (40, 60, 160, 255)
        out = N.swap_skin(img, N.PLACEHOLDER_RAMP, 3)
        self.assertEqual(out[0, 0, :3].tolist(), [184, 101, 72])
        self.assertEqual(out[0, 1].tolist(), [128, 128, 129, 255])
        self.assertEqual(out[1, 0].tolist(), [40, 60, 160, 255])

    def test_the_disk_transform_turns_clockwise_on_screen(self):
        M = N.similarity(50, 60, 90, 1, 0, 0)
        x, y = M @ np.array([65.0, 60.0, 1.0])   # 15 px right of the pivot
        self.assertAlmostEqual(x, 50, places=6)
        self.assertAlmostEqual(y, 75, places=6)


@unittest.skipUnless(HAVE, "numpy, opencv, scipy, pillow")
class CalibrateTest(unittest.TestCase):
    """The silhouette match on a synthetic arm: the base outline filled with skin grey on a blank body, moved by a
    known transform; calibrate must find it back. Needs only BASE_ARM (no game art): `bare` is stubbed."""

    def setUp(self):
        self._bare = N.bare

        def bare(wu, pose, skin=1, sex='wm'):   # a body that is only its disk arm
            b = np.zeros((N.CANVAS, N.CANVAS, 4), np.uint8)
            b[N.arm_mask(pose)] = (250, 200, 160, 255)
            return b
        N.bare = bare

    def tearDown(self):
        N.bare = self._bare

    def test_a_moved_arm_is_found(self):
        for pose in 'rl':
            arm = N.arm_mask(pose)
            body = np.zeros((N.CANVAS, N.CANVAS, 4), np.uint8)
            body[arm] = (190, 190, 190, 255)
            wx, wy = N.BASE_ARM[pose]['wrist']
            M = N.similarity(wx, wy, 8, 1, 12, -7)
            moved = cv2.warpAffine(body, M, (N.CANVAS, N.CANVAS), flags=cv2.INTER_NEAREST)
            a, hand = N.calibrate(None, moved, pose)
            d = a['disk']
            self.assertLessEqual(abs(d['angle'] - 8), 1.0, (pose, d))
            self.assertLessEqual(abs(d['dx'] - 12) + abs(d['dy'] + 7), 3, (pose, d))
            self.assertTrue(hand.any(), 'a front hand')


if __name__ == '__main__':
    unittest.main()
