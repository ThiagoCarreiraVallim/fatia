#!/usr/bin/env python3
"""Reatribui data-muscle no SVG frontal pela POSICAO REAL de cada path (pixel centroid),
ignorando os ids/labels originais que estao embaralhados. Verifica medindo de novo."""
import xml.etree.ElementTree as ET
import cairosvg, io
from PIL import Image
import numpy as np

SVG="http://www.w3.org/2000/svg"; ET.register_namespace("",SVG)
PATH="/home/user/fatia/apps/web/public/muscle-front.svg"

# ids do tronco/bracos a reclassificar (resto do corpo ja estava correto)
TARGET=("sternocleidomastoid sternocleidomastoid-2 sternocleidomastoid-3 sternocleidomastoid-4 sternocleidomastoid-5 "
        "deltoid-anterior deltoid-anterior-2 deltoid-anterior-3 deltoid-anterior-4 deltoid-anterior-5 deltoid-anterior-6 "
        "deltoid-lateral deltoid-lateral-2 deltoid-lateral-3 deltoid-lateral-4 deltoid-lateral-5 "
        "pectoralis-major pectoralis-major-2 pectoralis-major-3 pectoralis-major-4 pectoralis-major-5 pectoralis-major-6 pectoralis-major-7 "
        "serratus-anterior serratus-anterior-2 serratus-anterior-3 serratus-anterior-4 "
        "rectus-abdominis rectus-abdominis-lower obliques obliques-2 obliques-3 "
        "biceps-brachii forearms forearms-2 forearms-3 forearms-4").split()

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
    a=np.asarray(Image.open(io.BytesIO(png)).convert("RGB")).astype(int); H=a.shape[0]
    red=(a[:,:,0]>180)&(a[:,:,1]<80)&(a[:,:,2]<80)
    ys,xs=np.where(red)
    if len(xs)==0: return None
    xp=xs/W*100; n=len(xs)
    return dict(cy=ys.mean()/H*100, outer=((xp<30)|(xp>70)).sum()/n)

def classify(cy, outer):
    if outer > 0.45:                 # nos bracos
        if cy < 32:  return "shoulders"   # deltoide (capa do ombro)
        if cy < 40:  return "biceps"      # braco superior frontal
        return "forearms"                  # antebraco
    # tronco central
    if cy < 19:  return "neck"
    if cy < 35:  return "chest"            # peitorais
    return "abdominals"                    # abdomen

# 1) decide nova classificacao
newmap={}
for i in TARGET:
    m=measure(i)
    if not m: continue
    newmap[i]=classify(m["cy"], m["outer"])
    print(f"{i:24} cy={m['cy']:4.0f} outer={m['outer']:.2f} -> {newmap[i]}")

# 2) aplica no arquivo
tree=ET.parse(PATH); root=tree.getroot()
changed=0
for el in root.iter():
    i=el.get("id")
    if i in newmap:
        if el.get("data-muscle")!=newmap[i]: changed+=1
        el.set("data-muscle", newmap[i])
tree.write(PATH, xml_declaration=False, encoding="unicode")
print(f"\n{changed} atributos data-muscle atualizados em {PATH}")
