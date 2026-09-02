import json
import glob
from pathlib import Path
import os

def main():
    results_dir = Path(os.path.dirname(os.path.abspath(__file__))) / "test_results"
    
    for json_file in glob.glob(str(results_dir / "*.json")):
        filename = os.path.basename(json_file)
        with open(json_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        print(f"=== {filename} ===")
        
        # Check structure
        valid = True
        has_all_fields = True
        body_grouped = True
        order_match = True
        
        sections = data.get("sections", [])
        last_page = 0
        
        for i, sec in enumerate(sections):
            if "heading" not in sec or "level" not in sec or "page" not in sec or "text" not in sec:
                has_all_fields = False
            
            if sec.get("page", 0) < last_page:
                order_match = False
            last_page = sec.get("page", 0)
                
        print(f"Has all fields: {has_all_fields}")
        print(f"Order match: {order_match}")
        
        # Print first 2 sections as examples (if it has them)
        for sec in sections[1:3]: # skip the "General" or first to get a real one
            text = sec['text'][:100].replace('\n', ' ') + '...' if len(sec['text']) > 100 else sec['text']
            print(f"EXAMPLE: [Pg {sec['page']}] {sec['heading']} -> {text}")
        print("\n")

if __name__ == "__main__":
    main()
