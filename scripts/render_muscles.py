#!/usr/bin/env python3
"""Renderiza cada grupo muscular pintado e monta um grid para validação visual."""
import xml.etree.ElementTree as ET
import cairosvg, io, os
from PIL import Image, ImageDraw, ImageFont

SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)
OUT = "/home/user/fatia/muscle-validation"
os.makedirs(OUT, exist_ok=True)
HILITE = "#ef4444"  # vermelho (mesmo do componente p/ primary)

def muscles_in(path):
    tree = ET.parse(path)
    found = set()
    for el in tree.iter():
        m = el.get("data-muscle")
        if m:
            found.add(m)
    return sorted(found)

def color_descendants(el, color):
    """Pinta o elemento e todos os descendentes com fill (sobrescreve presentation attr)."""
    tag = el.tag.split('}')[-1]
    if tag in ("path", "g", "polygon", "rect", "circle", "ellipse"):
        if el.get("fill") != "none" or tag == "path":
            el.set("fill", color)
    for child in el:
        color_descendants(child, color)

def render_one(svg_path, muscle):
    tree = ET.parse(svg_path)
    root = tree.getroot()
    for el in root.iter():
        if el.get("data-muscle") == muscle:
            color_descendants(el, HILITE)
    data = ET.tostring(root)
    png = cairosvg.svg2png(bytestring=data, output_width=300)
    return Image.open(io.BytesIO(png)).convert("RGBA")

def base_png(svg_path):
    png = cairosvg.svg2png(url=svg_path, output_width=300)
    return Image.open(io.BytesIO(png)).convert("RGBA")

def build_grid(svg_path, side):
    muscles = muscles_in(svg_path)
    print(f"[{side}] grupos:", muscles)
    imgs = []
    for mus in muscles:
        img = render_one(svg_path, mus)
        # fundo branco
        bg = Image.new("RGBA", img.size, "white")
        bg.alpha_composite(img)
        d = ImageDraw.Draw(bg)
        d.rectangle([0, 0, bg.width-1, 28], fill="#222")
        d.text((6, 6), f"{side}: {mus}", fill="white")
        imgs.append(bg)
    if not imgs:
        return
    cols = 4
    rows = (len(imgs) + cols - 1) // cols
    w, h = imgs[0].size
    grid = Image.new("RGBA", (cols*w, rows*h), "white")
    for i, im in enumerate(imgs):
        grid.alpha_composite(im, ((i % cols)*w, (i // cols)*h))
    out = f"{OUT}/grid-{side}.png"
    grid.convert("RGB").save(out)
    print("salvo:", out)

build_grid("/home/user/fatia/apps/web/public/muscle-front.svg", "front")
build_grid("/home/user/fatia/apps/web/public/muscle-back.svg", "back")

def render_individual(svg_path, side):
    for mus in muscles_in(svg_path):
        img = render_one(svg_path, mus)
        bg = Image.new("RGBA", img.size, "white")
        bg.alpha_composite(img)
        safe = mus.replace(" ", "_")
        bg.convert("RGB").save(f"{OUT}/{side}-{safe}.png")

render_individual("/home/user/fatia/apps/web/public/muscle-front.svg", "front")
render_individual("/home/user/fatia/apps/web/public/muscle-back.svg", "back")
print("individuais salvos")
