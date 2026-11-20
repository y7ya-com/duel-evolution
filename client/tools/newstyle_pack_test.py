"""newstyle_pack.py: the pack format round-trips, and read_pak (the engine's check, ovr/nspak.h) refuses every broken
pack. No game data needed (newstyle_motions.py's placeholder body)."""
import struct
import unittest
import zlib

import newstyle_pack as P


class PackTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ents = P.placeholder_entries('99', 1)
        cls.blob = P.write_pak(cls.ents)

    def test_round_trip_and_complete(self):
        got = P.read_pak(self.blob)
        self.assertEqual(set(got), {n for n, _ in self.ents})
        self.assertEqual(sorted(n for n in P.required('cm', '99', 1) if n not in got), [])
        self.assertTrue(all(isinstance(v, bytes) for v in got.values()))

    def test_dumps_are_compressed(self):
        raw = sum(len(b) for n, b in self.ents)
        self.assertLess(len(self.blob), raw * 0.6)

    def test_every_dump_picture_is_in_the_pack(self):
        import re
        got = P.read_pak(self.blob)
        for n, b in got.items():
            if n.endswith('.txt'):
                for p in re.findall(r'png => ([^,]+),', b.decode('ascii')):
                    if 'nb_00_c01' in p:
                        self.assertIn(p.replace('nb_00_c01', 'nb_99_c01'), got, n)

    def test_broken_packs_are_refused(self):
        b = self.blob
        cases = {
            'magic': b'XXXXXXXX' + b[8:],
            'truncated': b[:-100],
            'trailing': b + b'\0',
            'flipped byte': b[:-5000] + bytes([b[-5000] ^ 0xff]) + b[-4999:],
            'empty': b'',
        }
        for why, bad in cases.items():
            with self.assertRaises(Exception, msg=why):
                P.read_pak(bad)

    def test_an_undecodable_png_with_a_good_crc_is_refused(self):
        ents = [(n, (b'\x89PNG\r\n\x1a\n' + b'\0' * 40) if i == len(self.ents) - 1 else d) for i, (n, d) in enumerate(self.ents)]
        with self.assertRaises(Exception):
            P.read_pak(P.write_pak(ents))


if __name__ == '__main__':
    unittest.main()
