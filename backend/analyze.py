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
        print(f"Page Count: {data['page_count']}")
        print(f"Heading Count: {data['metadata']['heading_count']}")
        print(f"Processing Time (ms): {data['metadata']['processing_time_ms']}")
        print("HEADINGS:")
        for sec in data["sections"]:
            print(f"  [Pg {sec['page']}] L{sec['level']}: {sec['heading']}")
        print("\n")

if __name__ == "__main__":
    main()
