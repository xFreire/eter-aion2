"""Gera public/data/gear.json a partir dos dados públicos do Atreia Lens.

Uso: python3 scripts/gerar-dados.py <items.json> <build-names.pt.json>
Baixe os arquivos de https://atreialens.com/build/data/items.json e
https://atreialens.com/data/build-names.pt.json.
"""
import json, os, sys

items_path, names_path = sys.argv[1], sys.argv[2]
items = json.load(open(items_path, encoding="utf-8"))
pt = json.load(open(names_path, encoding="utf-8"))["n"]
ICON = "https://assets.playnccdn.com/static-aion2-gamedata/resources/"

def icon(path):
    name = os.path.basename(path or "")
    return ICON + name.rsplit(".", 1)[0] + ".png" if name else ""

out = []
for group in ("gear", "arcana"):
    for x in items.get(group, []):
        out.append({
            "id": int(x["id"]), "n": pt.get(x["n"], x["n"]), "en": x["n"],
            "c": x["c"], "s": x["s"], "lv": x["lv"], "t": x["t"], "g": x["g"],
            "r": x.get("r", "all"), "i": icon(x.get("i")),
        })
dest = os.path.join(os.path.dirname(__file__), "..", "public", "data", "gear.json")
json.dump(out, open(dest, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(out)} itens -> {os.path.normpath(dest)}")
