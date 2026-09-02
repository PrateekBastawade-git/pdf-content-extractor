import fitz
import time
import re
from collections import defaultdict

from app.models.schemas import (
    ContentBlock, ExtractionMetadata, ExtractionResponse, FileSummary, Page,
    DocumentSection, StructuredDocument, TableBlock, KeyValueItem
)


DATE_TIME_PATTERN = re.compile(
    r"^\s*(\d{1,4}[/\-]\d{1,2}[/\-]\d{1,4}|\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b)"
    r"(\s+\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?)?\s*$",
    re.IGNORECASE,
)
PAGE_NUMBER_PATTERN = re.compile(
    r"^\s*(-?\s*page\s+\d+(\s+of\s+\d+)?\s*-?|-?\s*\d+\s+of\s+\d+\s*-?|-?\s*\d+\s*-?)\s*$",
    re.IGNORECASE
)
NUMBERED_HEADING = re.compile(r"^(\d+(?:\.\d+)*[A-Za-z]?|[A-Z])[\.\-\)]?\s+[A-Z]")
ADDRESS_PATTERN = re.compile(
    r"^\d+\s+.*(blvd|street|st\.|st|avenue|ave\.|ave|road|rd\.|rd|drive|dr\.|dr|suite|ste\.|ste|floor|fl\.|fl|way|court|ct\.|ct|box)\b",
    re.IGNORECASE
)
CURRENCY_OR_NUMBER_PATTERN = re.compile(r"^\s*[\$\€\£]?\s*[\d,]+(\.\d+)?%?\s*$")

KNOWN_SECTION_HEADINGS = {
    "table of contents", "filing at a glance", "general information",
    "company and contact", "filing contact information", "filing company information",
    "filing fees", "state fees", "state specific", "correspondence summary",
    "filing notes", "note to reviewer", "note to filer", "objection letter",
    "response letter", "disposition", "form attachments", "user usage agreement",
    "supporting document", "schedule item changes", "product description",
    "executive summary", "terms and conditions", "financial information",
    "employee details", "project overview", "introduction", "conclusion",
    "document information", "financial details", "document overview", "overview", "summary"
}

NOISE_WORDS = {
    "confidential", "draft", "all rights reserved", "copyright", "page", "serff",
    "pdf pipeline for serff", "www", "http", "https"
}

METADATA_KEYS = {
    "State:": "state",
    "Filing Company:": "filing_company",
    "TOI/Sub-TOI:": "toi_sub_toi",
    "Product Name:": "product_name",
    "Project Name/Number:": "project_name_number",
    "Company Tracking #:": "company_tracking_number",
    "SERFF Tracking #:": "serff_tracking_number",
    "State Tracking #:": "state_tracking_number"
}


def is_meaningful_heading(text: str, max_span_size: float, avg_font_size: float, is_bold: bool, repeated_texts: set) -> bool:
    norm = text.strip().lower()
    if not norm or norm in repeated_texts:
        return False

    # Page numbers
    if PAGE_NUMBER_PATTERN.match(text):
        return False

    # Dates and timestamps
    if DATE_TIME_PATTERN.match(text) or "generated " in norm:
        return False

    # Address, currency, email, URL
    if ADDRESS_PATTERN.match(text) or CURRENCY_OR_NUMBER_PATTERN.match(text):
        return False
    if any(noise in norm for noise in ["www.", "http://", "https://", "@", "all rights reserved"]):
        return False

    # Key-value labels or trailing colons/semicolons
    if text.strip().endswith(":") or text.strip().endswith(";"):
        return False
    if ":" in text and len(text.split(":")[0]) < 35:
        return False

    # Paragraph sentences ending with period (unless short numbered heading like "1. Introduction")
    if text.strip().endswith(".") and not NUMBERED_HEADING.match(text):
        return False

    # Noise words
    if norm in NOISE_WORDS:
        return False

    # Length limits
    if len(text) > 90 or len(text) < 3:
        return False

    # Known section headings (always True)
    if norm in KNOWN_SECTION_HEADINGS:
        return True

    # Numbered section headings
    if NUMBERED_HEADING.match(text) and len(text) < 80:
        return True

    # Standalone large font / bold title text
    if max_span_size >= avg_font_size * 1.25 and 2 <= len(text.split()) <= 10 and not text.isdigit():
        return True

    if is_bold and max_span_size >= avg_font_size * 1.1 and 2 <= len(text.split()) <= 8 and text.istitle():
        return True

    return False


def is_2col_key_value_table(headers: list, rows: list) -> bool:
    """Checks if a table is essentially a 2-column key-value layout."""
    all_rows = []
    if headers and len(headers) == 2:
        all_rows.append(headers)
    for r in rows or []:
        if r and len(r) == 2:
            all_rows.append(r)

    if not all_rows:
        return False

    # Check if column 0 consists of field names / keys
    key_like_count = 0
    for r in all_rows:
        col0 = r[0].strip()
        col0_norm = col0.lower()
        if (col0.endswith(":") or 
            any(k in col0_norm for k in ["company", "date", "status", "product", "number", "author", "reviewer", "type", "toi", "state", "name", "re:", "naic", "fein", "requested", "effective", "disposition", "submitted"]) or
            (len(col0) < 40 and not col0.replace(".", "").isdigit())):
            key_like_count += 1

    return key_like_count >= max(1, len(all_rows) * 0.6)


def extract_key_values_from_table(headers: list, rows: list) -> list:
    """Extracts KeyValueItem list from a 2-column key-value table."""
    items = []
    all_rows = []
    if headers and len(headers) == 2 and (headers[0] or headers[1]):
        all_rows.append(headers)
    for r in rows or []:
        if len(r) >= 2:
            all_rows.append(r[:2])

    for r in all_rows:
        k_str = r[0].strip().rstrip(":").strip()
        v_str = r[1].strip()
        if k_str or v_str:
            items.append(KeyValueItem(
                key=k_str or "Field",
                value=v_str,
                label=f"{k_str}:" if k_str else "Field:"
            ))
    return items


def is_header_banner_row(text: str) -> bool:
    """Detects top header banner rows like 'SERFF Tracking #: AMGN-135003565...'."""
    norm = text.lower()
    return any(k in norm for k in ["serff tracking #", "state tracking #", "company tracking #", "pdf pipeline for serff"])


def extract_pdf_content(file_bytes: bytes, filename: str) -> ExtractionResponse:
    start_time = time.time()
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    page_count = len(doc)

    file_summary = FileSummary()

    # Pre-pass: Detect repeated headers/footers across pages
    text_page_occurrences = defaultdict(set)
    for page_num in range(page_count):
        page = doc[page_num]
        blocks = page.get_text("blocks")
        for b in blocks:
            if b[6] == 0:
                norm = b[4].strip().lower()
                if 3 < len(norm) < 150:
                    text_page_occurrences[norm].add(page_num)

    repeated_texts = set()
    for norm_text, p_set in text_page_occurrences.items():
        if len(p_set) >= max(3, page_count * 0.3):
            repeated_texts.add(norm_text)

    pages_out = []
    heading_count = 0
    character_count = 0

    for page_num in range(page_count):
        page = doc[page_num]
        blocks_dict = page.get_text("dict").get("blocks", [])

        font_sizes = []
        for b in blocks_dict:
            if b.get("type") == 0:
                for l in b.get("lines", []):
                    for s in l.get("spans", []):
                        if s.get("text", "").strip():
                            font_sizes.append(s.get("size", 11.0))
        avg_font_size = (sum(font_sizes) / len(font_sizes)) if font_sizes else 11.0

        # Detect native vector tables using PyMuPDF page.find_tables()
        tables = page.find_tables()
        table_rects = []
        table_blocks_map = {}

        if tables and len(tables.tables) > 0:
            for tab in tables.tables:
                table_rects.append(tab.bbox)
                extracted_grid = tab.extract()
                if extracted_grid and len(extracted_grid) > 0:
                    raw_headers = [str(cell).strip() if cell is not None else "" for cell in extracted_grid[0]]
                    raw_rows = [
                        [str(cell).strip() if cell is not None else "" for cell in row]
                        for row in extracted_grid[1:]
                    ]
                    filtered_rows = [r for r in raw_rows if any(c for c in r)]
                    
                    if not any(raw_headers) and filtered_rows:
                        raw_headers = filtered_rows[0]
                        filtered_rows = filtered_rows[1:]

                    # Filter out top banner tables on pages > 0
                    combined_tab_text = " ".join(raw_headers) + " " + " ".join(" ".join(r) for r in filtered_rows)
                    if page_num > 0 and tab.bbox[1] < 140 and is_header_banner_row(combined_tab_text):
                        continue

                    table_blocks_map[tab.bbox[1]] = ContentBlock(
                        type="table",
                        headers=raw_headers if any(raw_headers) else None,
                        rows=filtered_rows
                    )

        # Non-table lines collection for page layout analysis
        raw_lines = []
        for b in blocks_dict:
            if b.get("type") != 0:
                continue

            bbox = b.get("bbox", (0, 0, 0, 0))
            
            # Skip lines inside detected vector tables
            inside_table = False
            for t_bbox in table_rects:
                if (t_bbox[0] - 4 <= bbox[0] and t_bbox[1] - 4 <= bbox[1] 
                        and bbox[2] <= t_bbox[2] + 4 and bbox[3] <= t_bbox[3] + 4):
                    inside_table = True
                    break
            if inside_table:
                continue

            for l in b.get("lines", []):
                l_spans = l.get("spans", [])
                line_str = " ".join(s.get("text", "") for s in l_spans).strip()
                if line_str:
                    l_bbox = l.get("bbox", bbox)
                    raw_lines.append({
                        "text": line_str,
                        "x0": l_bbox[0],
                        "y0": l_bbox[1],
                        "spans": l_spans,
                    })

        # Cluster non-table lines into horizontal row bands
        raw_lines.sort(key=lambda item: item["y0"])
        row_clusters = []
        for line_item in raw_lines:
            if not row_clusters:
                row_clusters.append([line_item])
            else:
                if abs(line_item["y0"] - row_clusters[-1][0]["y0"]) < 5:
                    row_clusters[-1].append(line_item)
                else:
                    row_clusters.append([line_item])

        page_blocks_with_y = []
        table_buffer_rows = []
        table_buffer_y0 = None

        def flush_table_buffer():
            nonlocal table_buffer_rows, table_buffer_y0
            if table_buffer_rows:
                headers = table_buffer_rows[0]
                rows = table_buffer_rows[1:]
                page_blocks_with_y.append((
                    table_buffer_y0,
                    ContentBlock(
                        type="table",
                        headers=headers,
                        rows=rows
                    )
                ))
                table_buffer_rows = []
                table_buffer_y0 = None

        for row in row_clusters:
            row.sort(key=lambda item: item["x0"])
            cell_texts = [item["text"] for item in row]
            combined_text = "  ".join(cell_texts).strip()
            y0 = row[0]["y0"]

            if not combined_text:
                continue

            # Skip top banner header rows on pages > 0
            if page_num > 0 and y0 < 140 and is_header_banner_row(combined_text):
                continue

            # Skip repeated header/footer text
            if combined_text.strip().lower() in repeated_texts:
                continue

            character_count += len(combined_text)

            # Metadata extraction for top filing pages
            if page_num < 3:
                for item in row:
                    for key, field in METADATA_KEYS.items():
                        if getattr(file_summary, field) is None:
                            if item["text"].startswith(key):
                                val = item["text"][len(key):].strip()
                                if val:
                                    setattr(file_summary, field, val)

            # Check if row is part of a multi-column text table
            if len(row) >= 2:
                if not table_buffer_rows:
                    table_buffer_y0 = y0
                table_buffer_rows.append(cell_texts)
                continue
            else:
                flush_table_buffer()

            # Analyze font metrics for single-cell blocks
            spans = row[0]["spans"]
            max_span_size = max((s.get("size", 11.0) for s in spans), default=11.0)
            is_bold = any(
                bool(s.get("flags", 0) & 16)
                or "bold" in s.get("font", "").lower()
                or "black" in s.get("font", "").lower()
                for s in spans
            )

            if is_meaningful_heading(combined_text, max_span_size, avg_font_size, is_bold, repeated_texts):
                level = 1 if max_span_size >= avg_font_size * 1.3 else 2
                numbered_match = NUMBERED_HEADING.match(combined_text)
                if numbered_match:
                    level = min(4, combined_text.count(".") + 1)

                page_blocks_with_y.append((
                    y0,
                    ContentBlock(
                        type="heading",
                        level=level,
                        text=combined_text.replace("\n", " ").strip()
                    )
                ))
                heading_count += 1

            elif re.match(r"^(\*|-|•|\d+[\.\)])\s+", combined_text):
                # List block
                items = [it.strip() for it in combined_text.split("\n") if it.strip()]
                page_blocks_with_y.append((
                    y0,
                    ContentBlock(
                        type="list",
                        items=[{"text": item_str} for item_str in items]
                    )
                ))

            elif "\n" not in combined_text and ":" in combined_text and len(combined_text.split(":")[0]) < 40 and not combined_text.startswith("http"):
                # Key-value block
                parts = combined_text.split(":", 1)
                k_clean = parts[0].strip()
                v_clean = parts[1].strip()
                page_blocks_with_y.append((
                    y0,
                    ContentBlock(
                        type="key_value",
                        items=[{"key": k_clean, "value": v_clean, "label": f"{k_clean}:"}]
                    )
                ))

            else:
                # Paragraph block
                page_blocks_with_y.append((
                    y0,
                    ContentBlock(
                        type="paragraph",
                        text=combined_text
                    )
                ))

        flush_table_buffer()

        # Add vector table blocks into page_blocks_with_y
        for table_y, t_block in table_blocks_map.items():
            page_blocks_with_y.append((table_y, t_block))

        # Sort all blocks on page top-to-bottom
        page_blocks_with_y.sort(key=lambda item: item[0])
        final_page_blocks = [item[1] for item in page_blocks_with_y]

        pages_out.append(Page(
            page_number=page_num + 1,
            blocks=final_page_blocks
        ))

    doc.close()
    end_time = time.time()

    # Build Structured Document (hierarchical sections, title, metadata)
    doc_title = filename
    first_h1 = None
    sections_list = []
    
    top_sec = DocumentSection(
        id="sec-1",
        title="Document Overview",
        level=1,
        page_number=1,
        paragraphs=[],
        key_values=[],
        tables=[],
        lists=[],
        subsections=[]
    )
    sections_list.append(top_sec)
    current_sec = top_sec
    sec_counter = 1

    for p in pages_out:
        for b in p.blocks:
            if b.type == "heading" and b.text:
                if not first_h1:
                    first_h1 = b.text
                sec_counter += 1
                sec_level = b.level or 1
                new_sec = DocumentSection(
                    id=f"sec-{sec_counter}",
                    title=b.text,
                    level=sec_level,
                    page_number=p.page_number,
                    paragraphs=[],
                    key_values=[],
                    tables=[],
                    lists=[],
                    subsections=[]
                )
                if sec_level >= 2 and top_sec:
                    top_sec.subsections.append(new_sec)
                    current_sec = new_sec
                else:
                    top_sec = new_sec
                    current_sec = new_sec
                    sections_list.append(top_sec)
            elif b.type == "paragraph" and b.text:
                if not is_header_banner_row(b.text) and b.text.strip().lower() not in repeated_texts:
                    current_sec.paragraphs.append(b.text)
            elif b.type == "key_value" and b.items:
                for item in b.items:
                    k = item.get("key") or item.get("label", "").rstrip(":").strip()
                    v = item.get("value", "").strip()
                    if k:
                        current_sec.key_values.append(KeyValueItem(key=k, value=v, label=f"{k}:"))
            elif b.type == "table":
                if is_2col_key_value_table(b.headers, b.rows):
                    kv_items = extract_key_values_from_table(b.headers, b.rows)
                    current_sec.key_values.extend(kv_items)
                else:
                    comb_text = " ".join(b.headers or []) + " " + " ".join(" ".join(r) for r in (b.rows or []))
                    if not is_header_banner_row(comb_text):
                        current_sec.tables.append(TableBlock(headers=b.headers, rows=b.rows or []))
            elif b.type == "list" and b.items:
                current_sec.lists.append([i.get("text", "") for i in b.items if i.get("text")])

    # If first section is empty and subsequent sections exist, drop initial placeholder
    if (len(sections_list) > 1 and 
        not sections_list[0].paragraphs and 
        not sections_list[0].key_values and 
        not sections_list[0].tables and 
        not sections_list[0].lists and 
        not sections_list[0].subsections):
        sections_list.pop(0)

    if first_h1:
        doc_title = first_h1

    metadata_dict = {
        "State": file_summary.state,
        "Filing Company": file_summary.filing_company,
        "TOI/Sub-TOI": file_summary.toi_sub_toi,
        "Product Name": file_summary.product_name,
        "Company Tracking Number": file_summary.company_tracking_number,
        "SERFF Tracking Number": file_summary.serff_tracking_number,
        "State Tracking Number": file_summary.state_tracking_number,
    }

    structured_doc = StructuredDocument(
        title=doc_title,
        metadata={k: v for k, v in metadata_dict.items() if v},
        sections=sections_list
    )

    metadata = ExtractionMetadata(
        processing_time_ms=int((end_time - start_time) * 1000),
        heading_count=heading_count,
        character_count=character_count,
    )

    return ExtractionResponse(
        filename=filename,
        total_pages=page_count,
        file_summary=file_summary,
        document=structured_doc,
        pages=pages_out,
        metadata=metadata
    )
