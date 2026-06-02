#!/usr/bin/env python3
"""Mede a posicao REAL (centroide dos pixels) de cada id renderizando-o sozinho."""
import xml.etree.ElementTree as ET
import cairosvg, io
from PIL import Image
import numpy as np

SVG="http://www.w3.org/2000/svg"; ET.register_namespace("",SVG)
PATH="/home/user/fatia/apps/web/public/muscle-front.svg"

def color_desc(el,c):
    tag=el.tag.split('}')[-1]
    if tag=="path" or el.get("fill") not in (None,"none"):
        if tag in ("path","g","polygon","rect","circle","ellipse"): el.set("fill",c)
    for ch in el: color_desc(ch,c)

def measure(target_id, W=300):
    tree=ET.parse(PATH); root=tree.getroot()
    for el in root.iter():
        if el.get("id")==target_id: color_desc(el,"#ff0000")
    png=cairosvg.svg2png(bytestring=ET.tostring(root),output_width=W)
    a=np.asarray(Image.open(io.BytesIO(png)).convert("RGB")).astype(int)
    H=a.shape[0]
    red=(a[:,:,0]>180)&(a[:,:,1]<80)&(a[:,:,2]<80)
    ys,xs=np.where(red)
    if len(xs)==0: return None
    xp=xs/W*100
    n=len(xs)
    center=((xp>40)&(xp<60)).sum()/n
    outer=((xp<30)|(xp>70)).sum()/n
    return (xs.mean()/W*100, ys.mean()/H*100, n,
            xs.min()/W*100,xs.max()/W*100, center, outer)

# todos os ids anatomicos do tronco/bracos
ids=("sternocleidomastoid sternocleidomastoid-2 sternocleidomastoid-3 sternocleidomastoid-4 sternocleidomastoid-5 "
     "deltoid-anterior deltoid-anterior-2 deltoid-anterior-3 deltoid-anterior-4 deltoid-anterior-5 deltoid-anterior-6 "
     "deltoid-lateral deltoid-lateral-2 deltoid-lateral-3 deltoid-lateral-4 deltoid-lateral-5 "
     "pectoralis-major pectoralis-major-2 pectoralis-major-3 pectoralis-major-4 pectoralis-major-5 pectoralis-major-6 pectoralis-major-7 "
     "serratus-anterior serratus-anterior-2 serratus-anterior-3 serratus-anterior-4 "
     "rectus-abdominis rectus-abdominis-lower obliques obliques-2 obliques-3 "
     "biceps-brachii forearms forearms-2 forearms-3 forearms-4").split()
print(f"{'id':24} cy%  xrange   center outer  px")
for i in ids:
    m=measure(i)
    if m: print(f"{i:24} {m[1]:4.0f}  {m[3]:3.0f}-{m[4]:3.0f}  {m[5]:5.2f} {m[6]:5.2f}  {m[2]}")
    else: print(f"{i:24} (vazio)")
