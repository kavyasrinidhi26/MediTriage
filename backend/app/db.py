import os
import logging
from sqlalchemy import create_engine, text, event
from sqlalchemy.orm import declarative_base, sessionmaker

logger = logging.getLogger("meditriage-db")

# Ensure canonical persistent SQLite path regardless of current working directory
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_default_db_path = os.path.join(_backend_dir, "meditriage.db")
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{_default_db_path}")

# For SQLite, check_same_thread=False allows FastAPI multithreaded requests
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)

if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency that provides a thread-safe database session with automatic lifecycle cleanup."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initializes database tables and ensures new columns exist in SQLite."""
    import app.models  # noqa: F401 - ensure models are registered on Base.metadata
    Base.metadata.create_all(bind=engine)

    # SQLite migration helper: ensure any newly added columns exist in patients table
    if DATABASE_URL.startswith("sqlite"):
        try:
            with engine.connect() as conn:
                existing_cols = [
                    row[1] for row in conn.execute(text("PRAGMA table_info(patients)")).fetchall()
                ]
                new_columns = [
                    ("triage_level", "INTEGER"),
                    ("triage_level_name", "VARCHAR(64)"),
                    ("recommended_department", "VARCHAR(64)"),
                    ("urgency_score", "INTEGER DEFAULT 3"),
                    ("warning_signs", "TEXT DEFAULT '[]'"),
                    ("assessment_status", "VARCHAR(64) DEFAULT 'PENDING_ASSESSMENT'"),
                    ("review_status", "VARCHAR(64) DEFAULT 'UNREVIEWED'"),
                    ("reviewed_by", "VARCHAR(120)"),
                    ("reviewed_at", "TIMESTAMP"),
                    ("review_notes", "TEXT"),
                    ("deterioration_flag", "BOOLEAN DEFAULT 0"),
                    ("deterioration_reason", "TEXT"),
                    ("last_reassessed_at", "TIMESTAMP"),
                    ("clinician_triage_level", "INTEGER"),
                    ("clinician_triage_name", "VARCHAR(64)"),
                    ("clinician_triage_notes", "TEXT"),
                    ("clinician_reviewed_by", "VARCHAR(120)"),
                    ("clinician_reviewed_at", "TIMESTAMP"),
                    ("is_synthetic", "BOOLEAN DEFAULT 0"),
                ]
                for col_name, col_type in new_columns:
                    if col_name not in existing_cols:
                        conn.execute(text(f"ALTER TABLE patients ADD COLUMN {col_name} {col_type}"))
                conn.commit()
        except Exception as e:
            # Table might not exist yet or other transient initialization condition
            logger.debug(f"SQLite migration check notice: {e}")
