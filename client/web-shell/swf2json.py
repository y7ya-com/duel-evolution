"""swf2json.py <dump.txt> <lang> <out.json>: turn a YO2 SWF::Element text dump (the client's own movie format, e.g.
data/title/title_flash_01.txt) into compact JSON for the browser player in site/ygo-title.js.

Supported subset (all the title movie uses): DefineBitsLossless (PNG by file table), DefineShape/2 (bitmap-filled
straight-edge shapes), DefineSprite, DefineButton2, PlaceObject2, RemoveObject2, ShowFrame. Twips are kept as-is."""
import json
import re
import sys

src, lang, out = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(src, encoding="latin-1").read()

files = [m.replace("?", lang) for m in re.findall(r"png => ([^,\n]+),", text.split("Header:")[0])]
body = text.split("Frame count")[1].split("\n", 1)[1]

# Perl constructor syntax -> JSON
j = re.sub(r"#[^\n]*", "", body)
j = re.sub(r"SWF::Element::(?:Array::)?[A-Za-z0-9_:]+->new\(\[", "[", j)
j = re.sub(r"SWF::Element::(?:Tag::)?([A-Za-z0-9_:]+)->new\(", r'{"_t": "\1",', j)
j = j.replace("]),", "],").replace("])", "]")
j = re.sub(r"\)(\s*,)?", r"}\1", j)
j = re.sub(r"(\w+) => ([^\s,{\[]+)", lambda m: f'"{m.group(1)}": {m.group(2) if re.fullmatch(r"-?\d+(\.\d+)?", m.group(2)) else json.dumps(m.group(2))}', j)
j = re.sub(r"(\w+) => ", r'"\1": ', j)
j = re.sub(r",(\s*[}\]])", r"\1", j)
j = "[" + re.sub(r"}\s*{", "},{", j.strip()) + "]"
tags = json.loads(j)


def mat(m):
    if not m:
        return [1, 0, 0, 1, 0, 0]
    return [m.get("ScaleX", 1), m.get("RotateSkew0", 0), m.get("RotateSkew1", 0), m.get("ScaleY", 1),
            m.get("TranslateX", 0), m.get("TranslateY", 0)]


def cx(c):
    if not c or not c.get("Flags"):
        return None
    f = c["Flags"]
    mul = [c.get(k, 256) / 256 for k in ("RedMultTerm", "GreenMultTerm", "BlueMultTerm", "AlphaMultTerm")] if f & 2 else [1, 1, 1, 1]
    add = [c.get(k, 0) for k in ("RedAddTerm", "GreenAddTerm", "BlueAddTerm", "AlphaAddTerm")] if f & 1 else [0, 0, 0, 0]
    return mul + add


def ops(taglist):
    """Timeline -> frames, each a list of display-list ops."""
    frames, cur = [], []
    for t in taglist:
        k = t["_t"]
        if k == "PlaceObject2":
            op = {"d": t["Depth"], "move": bool(t["Flags"] & 1)}
            if "CharacterID" in t:
                op["c"] = t["CharacterID"]
            if "Matrix" in t:
                op["m"] = mat(t["Matrix"])
            if "ColorTransform" in t:
                op["cx"] = cx(t["ColorTransform"])
            if "Name" in t:
                op["n"] = t["Name"].strip("\"")
            cur.append(op)
        elif k == "RemoveObject2":
            cur.append({"d": t["Depth"], "rm": True})
        elif k == "ShowFrame":
            frames.append(cur)
            cur = []
    return frames


chars, timeline = {}, []
for t in tags:
    k = t["_t"]
    if k == "DefineBitsLossless":
        chars[t["CharacterID"]] = {"k": "bmp", "f": files[t["FileName"]], "w": t["BitmapWidth"], "h": t["BitmapHeight"]}
    elif k in ("DefineShape", "DefineShape2"):
        fills = t["Shapes"]["FillStyles"]
        x = y = 0
        pts = []
        for r in t["Shapes"]["ShapeRecords"]:
            if r["_t"].endswith("STYLECHANGERECORD") and "MoveDeltaX" in r:
                x, y = r["MoveDeltaX"], r["MoveDeltaY"]
            elif r["_t"].endswith("STRAIGHTEDGERECORD"):
                pts.append([x, y])
                x += r.get("DeltaX", 0)
                y += r.get("DeltaY", 0)
        f = fills[0]
        b = t["ShapeBounds"]
        chars[t["ShapeID"]] = {"k": "shape", "bmp": f["BitmapID"], "bm": mat(f["BitmapMatrix"]), "pts": pts,
                               "b": [b["Xmin"], b["Ymin"], b["Xmax"], b["Ymax"]]}
    elif k == "DefineSprite":
        chars[t["SpriteID"]] = {"k": "sprite", "frames": ops(t["ControlTags"])}
    elif k == "DefineButton2":
        recs = [{"s": r["ButtonStates"], "c": r["CharacterID"], "d": r["PlaceDepth"], "m": mat(r["PlaceMatrix"]),
                 "cx": cx(r.get("ColorTransform"))} for r in t["Characters"]]
        chars[t["ButtonID"]] = {"k": "button", "recs": recs}
    else:
        timeline.append(t)

movie = {"w": 20480, "h": 15360, "fps": 30, "chars": chars, "frames": ops(timeline)}
json.dump(movie, open(out, "w"), separators=(",", ":"))
print(f"{len(chars)} characters, {len(movie['frames'])} frames, {len(files)} files")
