# VoxNote — Real-Time Speech-to-Text

VoxNote is a full-stack web application that converts speech into text and lets users save, search, edit, and delete transcriptions.

### Features
- Real-time speech recognition with interim results.
- Language selection: English, Hindi, Malayalam, Tamil, Telugu, Bengali, Marathi, and Kannada.
- Save transcripts with titles, languages, and timestamps.
- Search and manage transcription history.
- REST API with interactive Swagger documentation.
- SQLite for local development and PostgreSQL support through Docker Compose.

### Tech Stack
Python, FastAPI, SQLAlchemy, HTML, CSS, JavaScript, SQLite, PostgreSQL, Docker, and the Web Speech API.

### Run Locally
```bash
python -m venv .venv
.venv\Scripts\Activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000

API documentation: http://127.0.0.1:8000/docs

### PostgreSQL
```bash
docker compose up --build
```

### API Endpoints
- `GET /api/health` — Health check
- `POST /api/transcriptions` — Create
- `GET /api/transcriptions` — List and search
- `GET /api/transcriptions/{id}` — Retrieve
- `PATCH /api/transcriptions/{id}` — Update
- `DELETE /api/transcriptions/{id}` — Delete