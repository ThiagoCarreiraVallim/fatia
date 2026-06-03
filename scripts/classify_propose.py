#!/usr/bin/env python3
"""Classifica cada path por posicao real e renderiza uma PROPOSTA (sem gravar o SVG)."""
import xml.etree.ElementTree as ET
import cairosvg, io, json, sys
from PIL import Image, ImageDraw

SVG="http://www.w3.org/2000/svg"; ET.register_namespace("",SVG)

COLOR={"neck":"#e6194b","shoulders":"#f58231","chest":"#911eb4","biceps":"#4363d8",
       "triceps":"#800000","forearms":"#42d4f4","abdominals":"#ffe119","adductors":"#3cb44b",
       "abductors":"#f032e6","quadriceps":"#bfef45","hamstrings":"#469990","calves":"#fabed4",
       "glutes":"#f58231","lats":"#42d4f4","traps":"#9A6324","middle back":"#bfef45",
       "lower back":"#f032e6", None:"#dddddd"}

def classify_front(p):
    cy,cx,arm,far=p["cy"],p["cx"],p["arm"],p["far"]
    is_arm = arm>0.35 or cx<30 or cx>70
    if is_arm:
        if cy>=47 or (far>0.6 and cy>43): return None  # mao
        if cy<26: return "shoulders"           # deltoide (so a capa)
        if cy<35: return "biceps"              # braco superior
        return "forearms"                       # antebraco (cotovelo->pulso)
    if cy<17: return "neck"
    if cy<29: return "chest"                    # peitorais
    if cy<48: return "abdominals"               # abdomen (reto+obliquos)
    if cy<60: return "adductors" if 40<cx<60 else "quadriceps"
    if cy<76: return "quadriceps"
    return "calves"

def classify_back(p):
    cy,cx,arm,far,old=p["cy"],p["cx"],p["arm"],p["far"],p["old"]
    # bracos (so abaixo do ombro p/ nao roubar o deltoide posterior)
    is_arm = (arm>0.3 or cx<22 or cx>78) and cy>=22
    if is_arm:
        if cy>=46 or (far>0.6 and cy>=43): return None   # mao
        if cy<37: return "triceps"
        return "forearms"
    # gluteo x posterior de coxa: separa pela altura
    if old in ("glutes","hamstrings"):
        return "glutes" if cy<57 else "hamstrings"
    # demais grupos (traps, lats, middle back, lower back, shoulders, neck,
    # abductors, calves) ja estavam corretos -> mantem
    return old

def parent_map(root): return {c:p for p in root.iter() for c in p}

def targets(root):
    pm=parent_map(root); res=[]
    for el in root.iter():
        if el.tag.split('}')[-1]!="path": continue
        a=el
        while a is not None and not a.get("data-muscle"): a=pm.get(a)
        if a is not None: res.append(el)
    return res

def propose(side):
    path=f"apps/web/public/muscle-{side}.svg"
    data={p["idx"]:p for p in json.load(open(f"muscle-validation/paths-{side}.json"))}
    fn=classify_front if side=="front" else classify_back
    tree=ET.parse(path); root=tree.getroot()
    els=targets(root)
    from collections import Counter
    cnt=Counter()
    for i,el in enumerate(els):
        p=data.get(i,{})
        m=fn(p) if p.get("n",0)>0 else None
        cnt[m]+=1
        el.set("fill", COLOR.get(m,"#dddddd"))
    png=cairosvg.svg2png(bytestring=ET.tostring(root),output_width=420)
    body=Image.open(io.BytesIO(png)).convert("RGBA")
    bg=Image.new("RGBA",body.size,"white"); bg.alpha_composite(body)
    legw=190; cv=Image.new("RGBA",(bg.width+legw,bg.height),"white"); cv.alpha_composite(bg,(0,0))
    d=ImageDraw.Draw(cv); y=10
    groups=sorted([k for k in cnt if k], key=str)
    for m in groups:
        d.rectangle([bg.width+10,y,bg.width+30,y+14],fill=COLOR[m],outline="black")
        d.text((bg.width+36,y+2),f"{m} ({cnt[m]})",fill="black"); y+=20
    cv.convert("RGB").save(f"muscle-validation/propose-{side}.png")
    print(f"propose-{side}.png", dict(cnt))

for s in (sys.argv[1:] or ["front"]): propose(s)

def isolate_grid(side):
    path=f"apps/web/public/muscle-{side}.svg"
    data={p["idx"]:p for p in json.load(open(f"muscle-validation/paths-{side}.json"))}
    fn=classify_front if side=="front" else classify_back
    tree=ET.parse(path); root=tree.getroot(); els=targets(root)
    labels=[(fn(data[i]) if data.get(i,{}).get("n",0)>0 else None) for i in range(len(els))]
    muscles=sorted({m for m in labels if m}, key=str)
    tiles=[]
    for mus in muscles:
        tr=ET.parse(path); rt=tr.getroot(); e2=targets(rt)
        for i,el in enumerate(e2):
            if labels[i]==mus: el.set("fill", "#ef4444")  # resto fica na cor original (como o app)
        png=cairosvg.svg2png(bytestring=ET.tostring(rt),output_width=200)
        im=Image.open(io.BytesIO(png)).convert("RGBA")
        bg=Image.new("RGBA",im.size,"white"); bg.alpha_composite(im)
        d=ImageDraw.Draw(bg); d.rectangle([0,0,bg.width-1,15],fill="#222"); d.text((3,3),mus,fill="white")
        tiles.append(bg)
    cols=5; rows=(len(tiles)+cols-1)//cols; w,h=tiles[0].size
    grid=Image.new("RGBA",(cols*w,rows*h),"white")
    for k,t in enumerate(tiles): grid.alpha_composite(t,((k%cols)*w,(k//cols)*h))
    grid.convert("RGB").save(f"muscle-validation/isolate-{side}.png"); print("isolate-"+side)

isolate_grid("front")
