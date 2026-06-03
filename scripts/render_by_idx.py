#!/usr/bin/env python3
"""Renderiza paths por indice (vermelho, resto cinza-original) com rotulo do idx."""
import xml.etree.ElementTree as ET, cairosvg, io, sys, json
from PIL import Image, ImageDraw
SVG="http://www.w3.org/2000/svg"; ET.register_namespace("",SVG)
side="front"; path=f"apps/web/public/muscle-{side}.svg"

def pm(root): return {c:p for p in root.iter() for c in p}
def target_paths(root):
    m=pm(root); r=[]
    for el in root.iter():
        if el.tag.split('}')[-1]!="path": continue
        a=el
        while a is not None and not a.get("data-muscle"): a=m.get(a)
        if a is not None: r.append(el)
    return r

idxs=[int(x) for x in sys.argv[1].split(",")]
data={p["idx"]:p for p in json.load(open(f"muscle-validation/paths-{side}.json"))}
tiles=[]
for i in idxs:
    root=ET.parse(path).getroot(); tp=target_paths(root)
    for j,el in enumerate(tp):
        el.set("fill", "#ef4444" if j==i else "#cfcfcf")
    png=cairosvg.svg2png(bytestring=ET.tostring(root),output_width=150)
    im=Image.open(io.BytesIO(png)).convert("RGBA"); bg=Image.new("RGBA",im.size,"white"); bg.alpha_composite(im)
    d=ImageDraw.Draw(bg); d.rectangle([0,0,bg.width-1,14],fill="#222")
    cy=data[i]['cy']; d.text((2,2),f"#{i} cy{cy:.0f}",fill="white")
    tiles.append(bg)
cols=8; rows=(len(tiles)+cols-1)//cols; w,h=tiles[0].size
g=Image.new("RGBA",(cols*w,rows*h),"white")
for k,t in enumerate(tiles): g.alpha_composite(t,((k%cols)*w,(k//cols)*h))
g.convert("RGB").save(f"muscle-validation/byidx.png"); print("saved", len(tiles))
