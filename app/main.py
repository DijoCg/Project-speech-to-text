import os
from datetime import datetime
from typing import Generator

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Integer, String, Text, create_engine, func
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./transcriptions.db")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass

class Transcription(Base):
    __tablename__ = "transcriptions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(160), default="Untitled transcription")
    text: Mapped[str] = mapped_column(Text)
    language: Mapped[str] = mapped_column(String(30), default="en-IN")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

Base.metadata.create_all(bind=engine)

class TranscriptionCreate(BaseModel):
    title: str = Field(default="Untitled transcription", max_length=160)
    text: str = Field(min_length=1, max_length=100000)
    language: str = Field(default="en-IN", max_length=30)

class TranscriptionUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=160)
    text: str | None = Field(default=None, min_length=1, max_length=100000)
    language: str | None = Field(default=None, max_length=30)

class TranscriptionOut(BaseModel):
    id: int
    title: str
    text: str
    language: str
    created_at: datetime
    updated_at: datetime | None = None
    class Config:
        from_attributes = True

app = FastAPI(title="Procucev Speech-to-Text", version="1.0.0", description="Speech transcription history with CRUD operations")
app.mount("/static", StaticFiles(directory="app/static"), name="static")

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/", include_in_schema=False)
def home():
    return FileResponse("app/static/index.html")

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Procucev Speech-to-Text"}

@app.post("/api/transcriptions", response_model=TranscriptionOut, status_code=201)
def create_transcription(payload: TranscriptionCreate, db: Session = Depends(get_db)):
    item = Transcription(title=payload.title.strip() or "Untitled transcription", text=payload.text.strip(), language=payload.language)
    if not item.text:
        raise HTTPException(status_code=422, detail="Transcription text cannot be empty")
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

@app.get("/api/transcriptions", response_model=list[TranscriptionOut])
def list_transcriptions(db: Session = Depends(get_db), q: str | None = Query(default=None, max_length=200), limit: int = Query(default=100, ge=1, le=500)):
    query = db.query(Transcription)
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter((Transcription.title.ilike(term)) | (Transcription.text.ilike(term)))
    return query.order_by(Transcription.created_at.desc(), Transcription.id.desc()).limit(limit).all()

@app.get("/api/transcriptions/{transcription_id}", response_model=TranscriptionOut)
def get_transcription(transcription_id: int, db: Session = Depends(get_db)):
    item = db.get(Transcription, transcription_id)
    if not item:
        raise HTTPException(status_code=404, detail="Transcription not found")
    return item

@app.patch("/api/transcriptions/{transcription_id}", response_model=TranscriptionOut)
def update_transcription(transcription_id: int, payload: TranscriptionUpdate, db: Session = Depends(get_db)):
    item = db.get(Transcription, transcription_id)
    if not item:
        raise HTTPException(status_code=404, detail="Transcription not found")
    changes = payload.model_dump(exclude_unset=True)
    if "title" in changes:
        item.title = (changes["title"] or "").strip() or "Untitled transcription"
    if "text" in changes:
        item.text = (changes["text"] or "").strip()
        if not item.text:
            raise HTTPException(status_code=422, detail="Transcription text cannot be empty")
    if "language" in changes and changes["language"]:
        item.language = changes["language"]
    item.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return item

@app.delete("/api/transcriptions/{transcription_id}", status_code=204)
def delete_transcription(transcription_id: int, db: Session = Depends(get_db)):
    item = db.get(Transcription, transcription_id)
    if not item:
        raise HTTPException(status_code=404, detail="Transcription not found")
    db.delete(item)
    db.commit()
    return None
