"""Build problems/known.json: formats a problem can be launched for, with the best known rank
from fmm's snapshot of Sedoglavic's catalogue and the team's own best scheme (from fmm's
records), so the launch page can show the record and disclose when the team already meets a
target. Rank does not depend on the order of the dimensions, so records match by sorted shape.

    python tools/known_formats.py [F:/fmm]
"""

import json
import re
import sys
from pathlib import Path

FMM = Path(sys.argv[1] if len(sys.argv) > 1 else 'F:/fmm')
OUT = Path(__file__).resolve().parent.parent / 'problems' / 'known.json'
SOURCE = {
    'name': 'Sedoglavic, Yet another catalogue of fast matrix multiplication algorithms',
    'url': 'https://fmm.univ-lille.fr/',
}


def team_records():
    best = {}
    for folder, coefficients in (('records', '{-1, 0, 1}'), ('records_z', 'integers')):
        for path in (FMM / folder).glob('*.json'):
            m = re.match(r'(\d+)x(\d+)x(\d+)_m(\d+)_', path.name)
            if not m:
                continue
            shape = tuple(sorted(int(x) for x in m.groups()[:3]))
            rank = int(m.group(4))
            if shape not in best or rank < best[shape]['rank']:
                best[shape] = {'rank': rank, 'coefficients': coefficients}
    return best


def main():
    team = team_records()
    formats = []
    for line in (FMM / 'trackers' / 'sedoglavic.txt').read_text().splitlines():
        parts = line.split()
        if len(parts) != 5:
            continue
        n1, n2, n3, rank = (int(x) for x in parts[:4])
        entry = {
            'n': [n1, n2, n3],
            'naive': n1 * n2 * n3,
            'bestKnown': {'rank': rank, 'source': SOURCE['name'], 'url': SOURCE['url'], 'asOf': parts[4], 'ring': None},
        }
        ours = team.get(tuple(sorted((n1, n2, n3))))
        if ours:
            entry['team'] = {**ours, 'tool': 'fmm'}
        formats.append(entry)
    formats.sort(key=lambda f: (f['naive'], f['n']))
    OUT.write_text(json.dumps({'generated': 'tools/known_formats.py', 'formats': formats}, indent=2) + '\n', encoding='utf-8')
    print(f'{len(formats)} formats, {sum(1 for f in formats if "team" in f)} with a team record -> {OUT}')


if __name__ == '__main__':
    main()
