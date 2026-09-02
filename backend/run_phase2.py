import json
import glob
from pathlib import Path
import sys
import os

# Add backend directory to sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)

from app.services.pdf_extractor import extract_pdf_content

def main():
    root_dir = Path(backend_dir).parent
    test_results_dir = Path(backend_dir) / "test_results"
    
    pdf_files = glob.glob(str(root_dir / "*.pdf"))
    
    print(f"Found {len(pdf_files)} PDFs.")
    
    for pdf_path in pdf_files:
        filename = os.path.basename(pdf_path)
        print(f"Processing {filename}...")
        
        with open(pdf_path, "rb") as f:
            file_bytes = f.read()
            
        try:
            response = extract_pdf_content(file_bytes, filename)
            
            # Serialize
            json_path = test_results_dir / f"{filename}.json"
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(response.model_dump(), f, indent=2, ensure_ascii=False)
                
            print(f"Saved {json_path}")
        except Exception as e:
            print(f"Error processing {filename}: {e}")

if __name__ == "__main__":
    main()
