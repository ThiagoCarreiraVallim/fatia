#!/usr/bin/env python3
"""Gera o corpo base com grade de coordenadas (% da largura/altura) para calibrar zonas."""
import cairosvg, io
from PIL import Image, ImageDraw

def grid(svg, out, W=380):
    png=cairosvg.svg2png(url=svg, output_width=W)
    im=Image.open(io.BytesIO(png)).convert("RGBA")
    bg=Image.new("RGBA",im.size,"white"); bg.alpha_composite(im)
    d=ImageDraw.Draw(bg); w,h=bg.size
    for p in range(0,101,5):
        y=int(h*p/100); d.line([(0,y),(w,y)],fill=(255,0,0,90))
        d.text((2,y),str(p),fill="red")
    for p in range(0,101,10):
        x=int(w*p/100); d.line([(x,0),(x,h)],fill=(0,0,255,90))
        d.text((x,2),str(p),fill="blue")
    bg.convert("RGB").save(out); print("salvo",out)

grid("apps/web/public/muscle-front.svg","muscle-validation/calib-front.png")
grid("apps/web/public/muscle-back.svg","muscle-validation/calib-back.png")
