#!/usr/bin/env python3
"""Renomeia os ids dos elementos com data-muscle para um esquema uniforme
'{grupo}-{n}', de modo que o id sempre reflita o grupo muscular real e nunca
mais possa divergir do data-muscle. Preserva a formatacao original (opera em texto)."""
import re, sys

def slug(s): return s.replace(" ", "-")

def rename(path):
    s = open(path).read()
    counters = {}
    tag_re = re.compile(r'<(\w+)\b([^>]*\bdata-muscle="([^"]*)"[^>]*)>')
    # ids que NAO serao renomeados (wrappers, base, Vector...) -> set de colisao.
    # os ids com data-muscle serao todos substituidos, entao nao entram aqui.
    renamed_old = set()
    for m in tag_re.finditer(s):
        idm = re.search(r'\bid="([^"]*)"', m.group(2))
        if idm: renamed_old.add(idm.group(1))
    used = {i for i in re.findall(r'\bid="([^"]*)"', s) if i not in renamed_old}
    out = []
    # itera tags de abertura que contenham data-muscle, em ordem do documento
    pairs = []
    for m in tag_re.finditer(s):
        group = m.group(3)
        counters[group] = counters.get(group, 0) + 1
        new_id = f"{slug(group)}-{counters[group]}"
        while new_id in used:  # seguranca contra colisao improvavel
            counters[group] += 1
            new_id = f"{slug(group)}-{counters[group]}"
        used.add(new_id)
        old_attrs = m.group(2)
        old_id_m = re.search(r'\bid="([^"]*)"', old_attrs)
        old_id = old_id_m.group(1) if old_id_m else None
        # reescreve o atributo id dentro do span exato desta tag
        if old_id_m:
            new_attrs = re.sub(r'\bid="[^"]*"', f'id="{new_id}"', old_attrs, count=1)
        else:
            new_attrs = f' id="{new_id}"' + old_attrs
        pairs.append((old_id, new_id, group))
        out.append((m.start(), m.end(), f"<{m.group(1)}{new_attrs}>"))
    # aplica de tras pra frente p/ nao baguncar offsets
    for start, end, rep in reversed(out):
        s = s[:start] + rep + s[end:]
    open(path, "w").write(s)
    return pairs

for path in ["apps/web/public/muscle-front.svg", "apps/web/public/muscle-back.svg"]:
    pairs = rename(path)
    print(f"\n== {path}: {len(pairs)} ids renomeados ==")
    for old, new, g in pairs:
        print(f"  {old:24} -> {new}")
