"""Wartości wzorcowe dla scripts/check/swieta.ts: objętości i wymiary z Pythona (repozytorium linia-3d).

Użycie:  python3 tools/swieta/make_ref.py /ścieżka/do/linia-3d  > tools/swieta/ref.json
Wymaga w linia-3d: etykieta.py, foremki_piernik.py, czubek_choinkowy.py (+ trimesh, shapely, numpy).
Źródłem prawdy jest Python; src/figurines/swieta.ts ma te same stałe i wzory.
"""
import json
import sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'
sys.path.insert(0, root)
from shapely import affinity  # noqa: E402
import etykieta as ET  # noqa: E402
import foremki_piernik as FP  # noqa: E402
import czubek_choinkowy as CZ  # noqa: E402

out = {'label': [], 'cutter': [], 'topper': []}
font = ET.Font()
for name, cap in (('Ania', 11), ('Łukasz', 11), ('Babcia Ela', 11), ('Jan', 14)):
    m, _ = ET.build_label(name, cap, font)
    out['label'].append({'name': name, 'cap': cap, 'volume': float(m.volume), 'extents': [float(v) for v in m.extents]})
for k in FP.SHAPES:
    FP.FL_W, FP.FL_T = 5.0, 2.0
    m = FP.cutter(FP.dough(k))
    out['cutter'].append({'shape': k, 'scale': 1.0, 'flw': 5.0, 'flt': 2.0, 'volume': float(m.volume)})
FP.FL_W, FP.FL_T = 8.0, 3.0
m = FP.cutter(affinity.scale(FP.dough('renifer'), 1.2, 1.2, origin=(0, 0)))
out['cutter'].append({'shape': 'renifer', 'scale': 1.2, 'flw': 8.0, 'flt': 3.0, 'volume': float(m.volume)})
FP.FL_W, FP.FL_T = 5.0, 2.0
for top, h, bulb, sleeve in ((18, 240, 62, 62), (14, 200, 54, 50), (26, 260, 80, 70), (10, 180, 40, 30)):
    m, g, _ = CZ.build(top, h, bulb, sleeve)
    out['topper'].append({'top': top, 'h': h, 'bulb': bulb, 'sleeve': sleeve, 'volume': float(m.volume), 'extents': [float(v) for v in m.extents]})
json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
