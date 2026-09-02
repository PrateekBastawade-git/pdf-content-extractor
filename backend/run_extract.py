import json
import sys
from app.services.pdf_extractor import extract_pdf_content

try:
    with open('../AMGN-135003565.pdf', 'rb') as f:
        data = f.read()
    res = extract_pdf_content(data, 'AMGN.pdf')
    with open('amgn_output.json', 'w') as f:
        json.dump(res.model_dump(), f, indent=2)
    print("Extraction successful.")
except Exception as e:
    print(f"Error: {e}")
