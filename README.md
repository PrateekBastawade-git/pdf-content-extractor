# PDF Extraction Pipeline

This repository contains a full-stack application to extract structured headings and associated text from PDF filings, and display them in a robust, easy-to-use React UI.

## Project Structure

- `backend/`: FastAPI application that uses PyMuPDF (fitz) to extract text and structure from PDFs.
- `frontend/`: React + Vite application with Tailwind CSS for a modern, responsive UI.

## Local Setup

### Backend

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the server:
   ```bash
   uvicorn app.main:app --reload
   ```
   The backend will run on `http://127.0.0.1:8000`.

### Frontend

1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
   The frontend will run on `http://localhost:5173`.

> **Note**: For local development, the frontend is configured to proxy API requests to `http://localhost:8000` or you can set `VITE_API_BASE_URL` in your `.env` file.

## Login Credentials
- **Email:** demo@example.com
- **Password:** demo123

## Deployment (Hosting)

To host this application and share the URL, you can use popular platforms like Render (for backend) and Vercel (for frontend).

### 1. Backend (Render / Heroku)
- Push this repository to GitHub.
- On Render, create a new **Web Service** and connect your GitHub repo.
- **Root Directory:** `backend`
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Once deployed, copy your backend URL (e.g., `https://my-backend.onrender.com`).

### 2. Frontend (Vercel)
- Go to Vercel and import your GitHub repository.
- **Root Directory:** `frontend`
- **Build Command:** `npm run build`
- **Environment Variables:** Add `VITE_API_BASE_URL` with the URL of your deployed backend (e.g., `https://my-backend.onrender.com`).
- Deploy! You will get a live URL to share.
