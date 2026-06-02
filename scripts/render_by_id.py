#!/usr/bin/env python3
"""Pinta cada ID individualmente para descobrir a geometria real de cada path."""
import xml.etree.ElementTree as ET
import cairosvg, io, os, sys
from PIL import Image, ImageDraw

SVG="http://www.w3.org/2000/svg"; ET.register_namespace("",SVG)
OUT="/home/user/fatia/muscle-validation"; os.makedirs(OUT,exist_ok=True)

def color_desc(el,c):
    tag=el.tag.split('}')[-1]
    if tag=="path" or el.get("fill") not in (None,"none"):
        if tag in ("path","g","polygon","rect","circle","ellipse"): el.set("fill",c)
    for ch in el: color_desc(ch,c)

def render_id(svg_path, target_id):
    tree=ET.parse(svg_path); root=tree.getroot()
    for el in root.iter():
        if el.get("id")==target_id: color_desc(el,"#ef4444")
    png=cairosvg.svg2png(bytestring=ET.tostring(root),output_width=240)
    img=Image.open(io.BytesIO(png)).convert("RGBA")
    bg=Image.new("RGBA",img.size,"white"); bg.alpha_composite(img)
    d=ImageDraw.Draw(bg); d.rectangle([0,0,bg.width-1,16],fill="#222")
    d.text((4,3),target_id,fill="white")
    return bg

ids=sys.argv[1].split(",")
svg="/home/user/fatia/apps/web/public/muscle-front.svg"
imgs=[render_id(svg,i) for i in ids]
cols=5; rows=(len(imgs)+cols-1)//cols; w,h=imgs[0].size
grid=Image.new("RGBA",(cols*w,rows*h),"white")
for k,im in enumerate(imgs): grid.alpha_composite(im,((k%cols)*w,(k//cols)*h))
grid.convert("RGB").save(f"{OUT}/byid-front.png"); print("salvo byid-front.png")
