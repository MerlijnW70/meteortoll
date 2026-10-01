"""Encode an fmm scheme JSON into the sparse byte format read by src/scheme.rs."""

import json
import struct
import sys
from fractions import Fraction


def factor(row, length):
    if len(row) != length:
        raise ValueError(f"row has {len(row)} entries, want {length}")
    entries = []
    for index, raw in enumerate(row):
        value = Fraction(str(raw))
        if value == 0:
            continue
        if value.denominator != 1 or not -128 <= value.numerator <= 127:
            raise ValueError(f"coefficient {raw} does not fit the i8 encoding")
        entries.append(struct.pack("<Hb", index, value.numerator))
    return struct.pack("<H", len(entries)) + b"".join(entries)


def encode(scheme):
    n1, n2, n3 = scheme["n"]
    if scheme.get("z2"):
        raise ValueError("schemes over Z2 are not accepted")
    rank = len(scheme["u"])
    out = [struct.pack("<BBBI", n1, n2, n3, rank)]
    for u, v, w in zip(scheme["u"], scheme["v"], scheme["w"], strict=True):
        out.append(factor(u, n1 * n2))
        out.append(factor(v, n2 * n3))
        out.append(factor(w, n3 * n1))
    return b"".join(out)


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: encode.py <scheme.json> <out.bin>")
    with open(sys.argv[1], encoding="utf-8") as source:
        data = encode(json.load(source))
    with open(sys.argv[2], "wb") as target:
        target.write(data)


if __name__ == "__main__":
    main()
