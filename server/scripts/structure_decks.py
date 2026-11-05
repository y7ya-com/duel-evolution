"""Apply curated, versioned structure decks after importing the archived cardpack files."""
import json
from pathlib import Path


def apply_structure_decks(shop):
    source = Path(__file__).resolve().parents[1] / 'data' / 'structure-decks.json'
    overrides = json.loads(source.read_text(encoding='utf-8'))
    sold = {str(pid) for pid, kind, _ in shop['packs'] if kind == 1 and pid >= 7000}
    if sold != set(overrides['decks']):
        raise ValueError('Sold structure decks differ from curated overrides; review the lineup')
    for pid, deck in overrides['decks'].items():
        if len(deck['cards']) != len(shop['ydc'][pid]):
            raise ValueError(f'Structure deck {pid} changed size')
        shop['ydc'][pid] = list(deck['cards'])
