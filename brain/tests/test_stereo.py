# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Speakers that say they are one stereo pair are one card with no question (design/speaker-pair/, "told", A)."""
import unittest
from hub.model import Home
from hub.stereo import Stereo, pairs_of
from tests.test_music import ent, st

# What two HomePods set up as a pair beside an Apple TV announce, cut to the parts that matter, and a HomePod mini on its own.
LEFT = {"deviceid": "92:20:1C:13:8D:59", "pgid": "E8DC5A69-31B6-5FFD-A4BA-F0AD47959FB6", "pgm": "2", "pgmid": "1", "model": "AudioAccessory6,1"}
RIGHT = {"deviceid": "6E:DE:EF:44:6D:0B", "pgid": "E8DC5A69-31B6-5FFD-A4BA-F0AD47959FB6", "pgm": "2", "pgmid": "2", "model": "AudioAccessory6,1"}
MINI = {"deviceid": "56:E9:69:EC:1E:E9", "gid": "9C29DD78-8099-4D89-88F2-330D1A34AFF4", "model": "AudioAccessory5,1"}
PAIR = frozenset({"92201c138d59", "6edeef446d0b"})


class Announced(unittest.TestCase):
    def test_two_speakers_with_one_pair_id_are_a_pair(self):
        self.assertEqual(pairs_of({"Left": LEFT, "Right": RIGHT, "Pod": MINI}), {PAIR})

    def test_half_a_pair_is_not_a_pair(self):
        self.assertEqual(pairs_of({"Left": LEFT, "Pod": MINI}), set())

    def test_the_listener_says_only_when_the_pairs_change(self):
        heard = []
        s = Stereo(heard.append)
        s.records = {"Left": LEFT}; s._settle()
        s.records["Right"] = RIGHT; s._settle(); s._settle()
        s.records["Right"] = {**RIGHT, "pgid": "", "pgm": ""}; s._settle()   # unpaired on the speakers themselves
        self.assertEqual(heard, [{PAIR}, set()])


class OneCard(unittest.TestCase):
    AREAS = [{"area_id": "living", "name": "Living room"}]
    ENTS = [ent("media_player.left", "music_assistant", "ap92201c138d59", area_id="living"),
            ent("media_player.right", "music_assistant", "ap6edeef446d0b", area_id="living"),
            ent("media_player.pod", "music_assistant", "ap56e969ec1ee9", area_id="living")]
    STATES = [st("media_player.left", "playing", media_title="Home Alone 2"), st("media_player.right", "playing", media_title="Home Alone 2"),
              st("media_player.pod", "idle")]

    def home(self, pairs=()):
        h = Home(); h.speaker_pairs = list(pairs)
        return h.build(self.AREAS, [], self.ENTS, self.STATES)

    def test_an_announced_pair_is_told_to_both_and_kept_through_a_rebuild(self):
        h = self.home()
        changed = h.set_stereo({PAIR})
        self.assertEqual(sorted(d.id for d in changed), ["media_player.left", "media_player.right"])
        self.assertEqual((h.devices["media_player.left"].attrs["pair"], h.devices["media_player.right"].attrs["pair"]), ("media_player.right", "media_player.left"))
        self.assertNotIn("pair", h.devices["media_player.pod"].attrs)
        h.build(self.AREAS, [], self.ENTS, self.STATES)
        self.assertEqual(h.devices["media_player.left"].attrs["pair"], "media_player.right")

    def test_the_speakers_word_outranks_an_earlier_two_speakers(self):
        h = self.home([{"speakers": ["media_player.left", "media_player.right"], "pair": False}])
        self.assertEqual(h.devices["media_player.left"].attrs["apart"], ["media_player.right"])
        h.set_stereo({PAIR})
        self.assertEqual(h.devices["media_player.left"].attrs["pair"], "media_player.right")
        self.assertNotIn("apart", h.devices["media_player.left"].attrs)

    def test_unpaired_on_the_speakers_they_are_two_again(self):
        h = self.home(); h.set_stereo({PAIR})
        changed = h.set_stereo(set())
        self.assertEqual(len(changed), 2)
        self.assertNotIn("pair", h.devices["media_player.left"].attrs)

    def test_a_speaker_the_house_does_not_have_pairs_nothing(self):
        h = self.home(); h.set_stereo({frozenset({"92201c138d59", "000000000000"})})
        self.assertNotIn("pair", h.devices["media_player.left"].attrs)


if __name__ == "__main__": unittest.main()
