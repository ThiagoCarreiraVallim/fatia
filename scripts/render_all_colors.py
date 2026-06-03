#!/usr/bin/env python3
"""Pinta TODOS os grupos musculares, cada um numa cor distinta, com legenda."""
import xml.etree.ElementTree as ET
import cairosvg, io, os
from PIL import Image, ImageDraw

SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)
OUT = "/home/user/fatia/muscle-validation"

PALETTE = ["#e6194b","#3cb44b","#4363d8","#f58231","#911eb4","#42d4f4",
           "#f032e6","#bfef45","#fabed4","#469990","#9A6324","#800000",
           "#808000","#000075","#a9a9a9"]

def muscles_in(path):
    s=set()
    for el in ET.parse(path).iter():
        if el.get("data-muscle"): s.add(el.get("data-muscle"))
    return sorted(s)

def color_desc(el,c):
    tag=el.tag.split('}')[-1]
    if tag=="path" or el.get("fill") not in (None,"none"):
        if tag in ("path","g","polygon","rect","circle","ellipse"):
            el.set("fill",c)
    for ch in el: color_desc(ch,c)

def build(svg_path, side):
    muscles=muscles_in(svg_path)
    cmap={m:PALETTE[i%len(PALETTE)] for i,m in enumerate(muscles)}
    tree=ET.parse(svg_path); root=tree.getroot()
    for el in root.iter():
        m=el.get("data-muscle")
        if m: color_desc(el,cmap[m])
    png=cairosvg.svg2png(bytestring=ET.tostring(root),output_width=420)
    body=Image.open(io.BytesIO(png)).convert("RGBA")
    bg=Image.new("RGBA",body.size,"white"); bg.alpha_composite(body)
    # legenda
    legw=190
    canvas=Image.new("RGBA",(bg.width+legw,bg.height),"white")
    canvas.alpha_composite(bg,(0,0))
    d=ImageDraw.Draw(canvas)
    y=10
    d.text((bg.width+10,y),f"== {side} ==",fill="black"); y+=22
    for m in muscles:
        d.rectangle([bg.width+10,y,bg.width+30,y+14],fill=cmap[m],outline="black")
        d.text((bg.width+36,y+2),m,fill="black"); y+=20
    out=f"{OUT}/allcolors-{side}.png"
    canvas.convert("RGB").save(out); print("salvo",out)

build("/home/user/fatia/apps/web/public/muscle-front.svg","front")
build("/home/user/fatia/apps/web/public/muscle-back.svg","back")
