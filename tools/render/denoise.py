"""Clean up a path-traced render (this Blender build has no OpenImageDenoise).

Non-local means takes out the grain of a few hundred samples while keeping
edges; a light unsharp mask gives back the crispness it costs.

  /usr/bin/python3.12 tools/render/denoise.py <in.png> <out.png> [strength]
"""
import sys

import cv2

src, dst = sys.argv[1], sys.argv[2]
h = float(sys.argv[3]) if len(sys.argv) > 3 else 4.0
img = cv2.imread(src, cv2.IMREAD_COLOR)
clean = cv2.fastNlMeansDenoisingColored(img, None, h, h, 7, 21)
blur = cv2.GaussianBlur(clean, (0, 0), 1.2)
sharp = cv2.addWeighted(clean, 1.35, blur, -0.35, 0)
cv2.imwrite(dst, sharp, [cv2.IMWRITE_PNG_COMPRESSION, 6])
print("DENOISED", dst)
