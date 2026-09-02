import fitz
import time
import re
from typing import List, Dict, Any, Set
from collections import defaultdict

from app.models.schemas import Section, ContentBlock, ExtractionMetadata, ExtractionResponse, FileSummary

def extract_pdf_content(file_bytes: bytes, filename: str) -> ExtractionResponse:
    start_time = time.time()
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    page_count = len(doc)
    
    file_summary = FileSummary()
    
    # 1. Gather all cells page by page
    all_bands = [] # list of (page_num, band_cells)
    
    font_sizes = []
    text_occurrences = defaultdict(set)
    text_total_occurrences = defaultdict(int)

    for page_num in range(page_count):
        page = doc[page_num]
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
                
                # Filter out running SERFF tracking top-bar and bottom pipeline footer
                if bbox[1] < 45 or bbox[3] > page.rect.height - 35:
                    continue
                if "PDF Pipeline for SERFF" in text:
                    continue
                
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
                
                font_sizes.append(s0["size"])
                norm_text = text.lower().strip()
                if len(norm_text) > 3:
                    text_occurrences[norm_text].add(page_num)
                    text_total_occurrences[norm_text] += 1

        # Cluster lines into Cells (vertical stacking with same left margin)
        lines.sort(key=lambda l: (l["x0"], l["y0"]))
        cells = []
        for line in lines:
            if not cells:
                cells.append([line])
                continue
            
            appended = False
            # Check last 3 cells (in case of slight interleaving)
            for cell in reversed(cells[-5:]):
                last_line = cell[-1]
                x_diff = abs(line["x0"] - last_line["x0"])
                y_gap = line["y0"] - last_line["y1"]
                
                # Same margin, directly below (tight line spacing indicates wrapped cell)
                if x_diff < 8 and -2 < y_gap < 6:
                    cell.append(line)
                    appended = True
                    break
            
            if not appended:
                cells.append([line])
                
        # Aggregate cell bboxes and text
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
            
        # Cluster cells into Row Bands (horizontal alignment)
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
            band.sort(key=lambda c: c["x0"])
            all_bands.append({
                "page_num": page_num,
                "cells": band
            })

    avg_font_size = sum(font_sizes) / len(font_sizes) if font_sizes else 11.0
    
    repeated_texts = set()
    for text, pages in text_occurrences.items():
        if len(pages) >= max(3, page_count * 0.3):
            repeated_texts.add(text)

    metadata_keys = {
        "State:": "state",
        "Filing Company:": "filing_company",
        "TOI/Sub-TOI:": "toi_sub_toi",
        "Product Name:": "product_name",
        "Project Name/Number:": "project_name_number",
        "Company Tracking #:": "company_tracking_number",
        "SERFF Tracking #:": "serff_tracking_number",
        "State Tracking #:": "state_tracking_number"
    }

    DATE_TIME_PATTERN = re.compile(
        r"^\s*\d{1,4}[/\-]\d{1,2}[/\-]\d{1,4}"
        r"(\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?)?\s*$",
        re.IGNORECASE,
    )

    def is_heading(cell: dict) -> bool:
        text = cell["text"].strip()
        norm_text = text.lower()
        confidence = 0.0
        
        is_large = cell["size"] > avg_font_size * 1.1
        is_very_large = cell["size"] > avg_font_size * 1.3
        is_bold = bool(cell["flags"] & 2**4) or "bold" in cell["font"].lower() or "black" in cell["font"].lower()
        
        if is_large:
            confidence += 2.0
        if is_very_large:
            confidence += 1.0
        if is_bold:
            confidence += 2.0
            
        if text.isupper():
            confidence += 1.0
        elif text.istitle():
            confidence += 0.5
            
        pattern = r"^([0-9]+(\.[0-9]+)*[A-Za-z]?|[A-Z])[\.\-\)]?\s+[A-Z]"
        if re.match(pattern, text):
            confidence += 1.5
            
        if text.endswith(":"):
            confidence -= 3.0
        if norm_text in repeated_texts:
            confidence -= 5.0
        if DATE_TIME_PATTERN.match(text):
            confidence -= 6.0
        if len(text) > 120:
            confidence -= 5.0
        if text.replace(".", "").replace(",", "").isdigit():
            confidence -= 3.0
            
        return confidence >= 3.0

    # 2. Parse Semantics and Group Sections
    sections = []
    
    current_heading = "General"
    current_heading_page = 1
    current_id = "general"
    
    blocks = []
    current_table_rows = []
    current_table_headers = []
    current_paragraph_parts = []
    current_kv_items = []
    
    def flush_paragraph():
        if current_paragraph_parts:
            raw = "\n".join(current_paragraph_parts).strip()
            if raw:
                blocks.append(ContentBlock(
                    type="paragraph",
                    raw_markdown=raw
                ))
            current_paragraph_parts.clear()

    def flush_table():
        nonlocal current_table_headers, current_table_rows
        if current_table_rows:
            if not current_table_headers and current_table_rows:
                current_table_headers = current_table_rows[0]
                current_table_rows = current_table_rows[1:]
            
            raw = ""
            if current_table_headers:
                raw += "| " + " | ".join(current_table_headers).replace('\n', ' ') + " |\n"
                raw += "| " + " | ".join("---" for _ in current_table_headers) + " |\n"
            for row in current_table_rows:
                raw += "| " + " | ".join(c.replace('\n', ' ') for c in row) + " |\n"
            
            blocks.append(ContentBlock(
                type="table",
                headers=[h.replace('\n', ' ') for h in current_table_headers] if current_table_headers else None,
                rows=[[c.replace('\n', ' ') for c in r] for r in current_table_rows],
                raw_markdown=raw.strip()
            ))
            current_table_rows.clear()
            current_table_headers = []

    def flush_kv_grid():
        if current_kv_items:
            raw = ""
            for k, v in current_kv_items:
                raw += f"- **{k}**: {v}\n"
            blocks.append(ContentBlock(
                type="key_value_grid",
                items=[{"label": k.replace('\n', ' '), "value": v.replace('\n', ' ')} for k, v in current_kv_items],
                raw_markdown=raw.strip()
            ))
            current_kv_items.clear()
            
    def flush_section():
        flush_paragraph()
        flush_table()
        flush_kv_grid()
        if blocks:
            full_text = "\n\n".join(b.raw_markdown for b in blocks)
            sections.append(Section(
                id=current_id,
                title=current_heading,
                page=current_heading_page,
                blocks=list(blocks),
                raw_markdown=full_text
            ))
            blocks.clear()

    heading_count = 0
    character_count = 0

    for band_dict in all_bands:
        page_num = band_dict["page_num"]
        cells = band_dict["cells"]
        
        # Extract File Summary on first few pages
        if page_num < 3:
            for i, cell in enumerate(cells):
                text = cell["text"].strip().replace('\n', ' ')
                for key, field in metadata_keys.items():
                    if getattr(file_summary, field) is None:
                        if text == key and i + 1 < len(cells):
                            setattr(file_summary, field, cells[i+1]["text"].replace('\n', ' ').strip())
                        elif text.startswith(key):
                            val = text[len(key):].strip()
                            if val:
                                setattr(file_summary, field, val)

        # Check if the band is a single large heading
        if len(cells) == 1 and is_heading(cells[0]):
            flush_section()
            
            text = cells[0]["text"].replace('\n', ' ').strip()
            current_heading = text
            current_heading_page = page_num + 1
            current_id = text.lower().replace(" ", "-")
            heading_count += 1
            character_count += len(text)
            continue
            
        # Parse band semantics
        for c in cells:
            character_count += len(c["text"])
            
        if len(cells) == 1:
            text = cells[0]["text"].strip()
            # Subheading
            is_bold = bool(cells[0]["flags"] & 2**4) or "bold" in cells[0]["font"].lower()
            if is_bold and not text.endswith(":") and len(text) > 3:
                flush_paragraph()
                flush_table()
                flush_kv_grid()
                blocks.append(ContentBlock(
                    type="subheading",
                    title=text.replace('\n', ' '),
                    raw_markdown=f"### {text.replace(chr(10), ' ')}"
                ))
            # Isolated Key-Value
            elif "\n" not in text and re.match(r"^[^:]+:\s+.+$", text):
                flush_paragraph()
                flush_table()
                flush_kv_grid() # Maybe it's not part of the grid
                blocks.append(ContentBlock(type="key_value", raw_markdown=text))
            elif "\n" not in text and re.match(r"^(\*|-|•|\d+\.)\s+", text):
                flush_paragraph()
                flush_table()
                flush_kv_grid()
                blocks.append(ContentBlock(type="list", raw_markdown=text))
            else:
                flush_table()
                flush_kv_grid()
                current_paragraph_parts.append(text)
        else:
            # Multi-cell band
            
            # 1. Attempt Key-Value Grid
            kv_pairs = []
            i = 0
            while i < len(cells) - 1:
                t0 = cells[i]["text"].strip()
                if t0.endswith(":"):
                    kv_pairs.append((t0.rstrip(":"), cells[i+1]["text"].strip()))
                    i += 2
                else:
                    i += 1
                    
            if kv_pairs and len(kv_pairs) * 2 >= len(cells) - 1:
                flush_paragraph()
                flush_table()
                current_kv_items.extend(kv_pairs)
            else:
                # 2. Table Row
                flush_paragraph()
                flush_kv_grid()
                row_texts = [c["text"].strip() for c in cells]
                
                is_header_row = any(kw in t for t in row_texts for kw in ["Name", "Number", "Type", "Status", "Date"])
                if not current_table_rows and is_header_row:
                    current_table_headers = row_texts
                else:
                    current_table_rows.append(row_texts)

    flush_section()
    doc.close()
    
    end_time = time.time()
    
    metadata = ExtractionMetadata(
        processing_time_ms=int((end_time - start_time) * 1000),
        heading_count=heading_count,
        character_count=character_count,
    )
    
    return ExtractionResponse(
        filename=filename,
        total_pages=page_count,
        file_summary=file_summary,
        sections=sections,
        metadata=metadata
    )
