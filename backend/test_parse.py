import fitz

doc = fitz.open('test_results/UNAM-135051123.pdf')
page = doc[7]
blocks = page.get_text("dict").get("blocks", [])

lines = []
for b in blocks:
    if b.get("type") != 0:
        continue
    for l in b.get("lines", []):
        text = " ".join(s["text"] for s in l.get("spans", [])).strip()
        if not text:
            continue
        bbox = l["bbox"]
        s0 = l["spans"][0]
        lines.append({
            "text": text,    
            "x0": bbox[0],
            "y0": bbox[1],
            "x1": bbox[2],
            "y1": bbox[3],
            "size": s0["size"],
            "font": s0.get("font", ""),
            "flags": s0.get("flags", 0)
        })

lines.sort(key=lambda l: (l["x0"], l["y0"]))
cells = []
for line in lines:
    if not cells:
        cells.append([line])
        continue
    
    appended = False
    for cell in reversed(cells[-5:]):
        last_line = cell[-1]
        x_diff = abs(line["x0"] - last_line["x0"])
        y_gap = line["y0"] - last_line["y1"]
        
        if x_diff < 8 and -2 < y_gap < 6 and line["font"] == last_line["font"] and abs(line["size"] - last_line["size"]) < 0.5:
            cell.append(line)
            appended = True
            break
    
    if not appended:
        cells.append([line])

merged_cells = []
for cell in cells:
    cell.sort(key=lambda l: l["y0"])
    text = "\n".join(l["text"] for l in cell)
    x0 = min(l["x0"] for l in cell)
    y0 = min(l["y0"] for l in cell)
    x1 = max(l["x1"] for l in cell)
    y1 = max(l["y1"] for l in cell)
    merged_cells.append({
        "text": text, 
        "x0": x0, "y0": y0, "x1": x1, "y1": y1,
        "size": cell[0]["size"], 
        "font": cell[0]["font"], 
        "flags": cell[0]["flags"]
    })

merged_cells.sort(key=lambda c: c["y0"])
row_bands = []
for cell in merged_cells:
    if not row_bands:
        row_bands.append([cell])
        continue
        
    last_band = row_bands[-1]
    band_y0 = min(c["y0"] for c in last_band)
    band_y1 = max(c["y1"] for c in last_band)
    
    overlap = max(0, min(cell["y1"], band_y1) - max(cell["y0"], band_y0))
    
    if overlap > 0 or cell["y0"] - band_y1 < 0:
        row_bands[-1].append(cell)
    else:
        row_bands.append([cell])

for band in row_bands:
    if len(band) > 1:
        print([c["text"] for c in band])
