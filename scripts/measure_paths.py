#!/usr/bin/env python3
"""Mede centroide + distribuicao de cada PATH que pertence a um grupo muscular.
Salva em JSON p/ iterar a classificacao sem re-renderizar."""
import xml.etree.ElementTree as ET
import cairosvg, io, json, sys
from PIL import Image
import numpy as np

SVG="http://www.w3.org/2000/svg"; ET.register_namespace("",SVG)

def parent_map(root):
    return {c: p for p in root.iter() for c in p}

def measure(side):
    path=f"apps/web/public/muscle-{side}.svg"
    tree=ET.parse(path); root=tree.getroot()
    pm=parent_map(root)
    # paths cujo ancestral tem data-muscle
    targets=[]
    for el in root.iter():
        if el.tag.split('}')[-1]!="path": continue
        a=el
        while a is not None:
            if a.get("data-muscle"): break
            a=pm.get(a)
        if a is not None:
            targets.append((el, a.get("data-muscle"), a.get("id")))
    print(f"[{side}] {len(targets)} paths musculares")
    out=[]
    W=200
    for idx,(el,old_dm,grp) in enumerate(targets):
        saved=el.get("fill")
        el.set("fill","#ff0000")
        png=cairosvg.svg2png(bytestring=ET.tostring(root),output_width=W)
        if saved is None: el.attrib.pop("fill",None)
        else: el.set("fill",saved)
        a=np.asarray(Image.open(io.BytesIO(png)).convert("RGB")).astype(int); H=a.shape[0]
        red=(a[:,:,0]>180)&(a[:,:,1]<80)&(a[:,:,2]<80)
        ys,xs=np.where(red)
        if len(xs)==0:
            out.append(dict(idx=idx,old=old_dm,grp=grp,n=0)); continue
        xp=xs/W*100; yp=ys/H*100; n=len(xs)
        out.append(dict(idx=idx, old=old_dm, grp=grp, n=int(n),
            cx=float(xp.mean()), cy=float(yp.mean()),
            arm=float(((xp<26)|(xp>74)).sum()/n),
            far=float(((xp<14)|(xp>86)).sum()/n),
            cymin=float(yp.min()), cymax=float(yp.max()),
            cxmin=float(xp.min()), cxmax=float(xp.max())))
    json.dump(out, open(f"muscle-validation/paths-{side}.json","w"))
    print(f"  salvo muscle-validation/paths-{side}.json")

for s in (sys.argv[1:] or ["front","back"]):
    measure(s)
