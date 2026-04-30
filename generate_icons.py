#!/usr/bin/env python3
# Generate placeholder icons for the Reclaim extension

import struct
import zlib
import os

def create_png(size, color_rgb=(0, 229, 160)):
    """Create a minimal PNG with a solid color circle on dark background."""
    w, h = size, size
    bg = (13, 13, 13)
    fg = color_rgb

    raw_rows = []
    cx, cy, r = w // 2, h // 2, int(w * 0.38)

    for y in range(h):
        row = bytearray()
        for x in range(w):
            dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if dist <= r:
                row += bytes(fg)
            else:
                row += bytes(bg)
        raw_rows.append(b'\x00' + bytes(row))

    raw_data = b''.join(raw_rows)
    compressed = zlib.compress(raw_data, 9)

    def chunk(name, data):
        c = name + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    ihdr_data = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', ihdr_data)
    png += chunk(b'IDAT', compressed)
    png += chunk(b'IEND', b'')
    return png

os.makedirs('icons', exist_ok=True)
for size in [16, 48, 128]:
    with open(f'icons/icon{size}.png', 'wb') as f:
        f.write(create_png(size))
    print(f'Created icons/icon{size}.png')

print('Icons generated.')
