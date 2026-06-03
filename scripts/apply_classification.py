#!/usr/bin/env python3
"""Aplica a classificacao por posicao aos SVGs. Usa EXATAMENTE o mesmo
targets()/enumerate do classify_propose (alinhado ao measure). Reetiqueta cada
grupo (data-muscle) e renomeia o id p/ {grupo}-{n}; grupos 'mao' perdem o
data-muscle. Edicao textual -> diff limpo."""
import json, xml.etree.ElementTree as ET, importlib.util, sys
sys.argv=['x']
spec=importlib.util.spec_from_file_location('cp','scripts/classify_propose.py')
cp=importlib.util.module_from_spec(spec); spec.loader.exec_module(cp)
SVG="http://www.w3.org/2000/svg"; ET.register_namespace("",SVG)

def slug(s): return s.replace(" ","-")

def group_of(root):
    """retorna lista (path_el, grupo_ancestral_com_data-muscle) na ordem do targets()"""
    pm={c:p for p in root.iter() for c in p}
    res=[]
    for el in root.iter():
        if el.tag.split('}')[-1]!="path": continue
        a=el
        while a is not None and not a.get("data-muscle"): a=pm.get(a)
        if a is not None: res.append((el,a))
    return res

for side in ("front","back"):
    p=f"apps/web/public/muscle-{side}.svg"
    data={x["idx"]:x for x in json.load(open(f"muscle-validation/paths-{side}.json"))}
    fn=cp.classify_front if side=="front" else cp.classify_back
    root=ET.parse(p).getroot()
    els=group_of(root)
    from collections import defaultdict
    grp_new=defaultdict(set); grp_dm={}; order=[]
    for i,(path,grp) in enumerate(els):
        new=fn(data[i]) if data.get(i,{}).get("n",0)>0 else None
        gid=grp.get("id")
        if gid not in grp_new: order.append(gid); grp_dm[gid]=grp.get("data-muscle")
        grp_new[gid].add(new)
    final={g:(next(iter(s)) if len(s)==1 else "MIXED") for g,s in grp_new.items()}
    assert "MIXED" not in final.values(), [g for g,v in final.items() if v=="MIXED"]
    # edicao textual em 2 passos (sentinela evita colisao de id)
    s=open(p).read()
    for i,gid in enumerate(order):
        old=f'id="{gid}" data-muscle="{grp_dm[gid]}"'
        assert s.count(old)==1, f"{side}:{old} x{s.count(old)}"
        s=s.replace(old, f"\x00{i}\x00")
    cnt={}; changes=[]
    for i,gid in enumerate(order):
        nm=final[gid]; key=slug(nm) if nm else "non-muscle"
        cnt[key]=cnt.get(key,0)+1; nid=f"{key}-{cnt[key]}"
        s=s.replace(f"\x00{i}\x00", f'id="{nid}" data-muscle="{nm}"' if nm else f'id="{nid}"')
        changes.append((gid,grp_dm[gid],nid,nm))
    open(p,"w").write(s)
    print(f"== {side}: {len(changes)} grupos, mudaram {sum(1 for _,o,_,n in changes if o!=n)} ==")
