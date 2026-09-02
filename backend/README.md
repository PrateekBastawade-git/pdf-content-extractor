# PDF Content Extraction Backend

This is the FastAPI backend for the PDF Content Extraction Web Application. It uses PyMuPDF to intelligently parse PDFs, identify headings, and group text into structured sections.

## Tech Stack
- Python 3.11+
- FastAPI
- PyMuPDF (fitz)
- Pydantic
- pytest

## Setup & Installation

1. Navigate to the `backend` directory.
2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Running the Server

Start the FastAPI server using Uvicorn:
```bash
uvicorn app.main:app --reload
```
The API will be available at `http://127.0.0.1:8000`.
You can view the interactive API documentation at `http://127.0.0.1:8000/docs`.

## Running Tests

Run the pytest suite to verify the extraction logic and API routes:
```bash
pytest tests/
```

## API Endpoints

### 1. Health Check
`GET /health`
Returns a simple JSON indicating the API is running.
```json
{
  "status": "ok"
}
```

### 2. Extract PDF Content
`POST /api/v1/extract`
Accepts a PDF file via `multipart/form-data` and returns the structured content.

**Example Request (using curl):**
```bash
curl -X POST "http://127.0.0.1:8000/api/v1/extract" \
  -H "accept: application/json" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@example.pdf"
```

**Example Response:**
```json
{
  "filename": "example.pdf",
  "page_count": 1,
  "sections": [
    {
      "heading": "Introduction",
      "level": 1,
      "page": 1,
      "text": "This is the first paragraph under the introduction."
    }
  ],
  "metadata": {
    "processing_time_ms": 15,
    "heading_count": 1,
    "character_count": 49
  }
}
```
