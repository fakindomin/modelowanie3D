"""Exports glyph outlines of a TrueType font to the compact JSON used by the text part.

Usage: python3 tools/font2json.py FONT.ttf OUT.json
Each glyph is [advance, path] in font units, the path made of M/L/Q/Z commands.
"""
import json
import sys

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont

CHARS = ''.join(chr(c) for c in range(32, 127)) + 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ°±×÷–—„”“’·€²³½¼¾µ←→↑↓⌀Øø'


class Compact(BasePen):
    def __init__(self, glyphs):
        super().__init__(glyphs)
        self.out = []

    def _moveTo(self, p):
        self.out.append('M%d %d' % p)

    def _lineTo(self, p):
        self.out.append('L%d %d' % p)

    def _qCurveToOne(self, c, p):
        self.out.append('Q%d %d %d %d' % (c + p))

    def _curveToOne(self, c1, c2, p):
        # Cubic segments (OpenType CFF fonts) are approximated by one quadratic.
        x0, y0 = self._getCurrentPoint()
        cx = (3 * (c1[0] + c2[0]) - x0 - p[0]) / 4
        cy = (3 * (c1[1] + c2[1]) - y0 - p[1]) / 4
        self.out.append('Q%d %d %d %d' % (cx, cy, p[0], p[1]))

    def _closePath(self):
        self.out.append('Z')


def main(src, dst):
    font = TTFont(src)
    cmap = font.getBestCmap()
    gs = font.getGlyphSet()
    hmtx = font['hmtx']
    glyphs = {}
    for ch in CHARS:
        name = cmap.get(ord(ch))
        if not name:
            continue
        pen = Compact(gs)
        gs[name].draw(pen)
        glyphs[ch] = [hmtx[name][0], ''.join(pen.out)]
    os2 = font['OS/2']
    data = {'em': font['head'].unitsPerEm, 'cap': getattr(os2, 'sCapHeight', 0) or int(font['head'].unitsPerEm * 0.7), 'glyphs': glyphs}
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
