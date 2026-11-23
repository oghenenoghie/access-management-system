import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

def _normalise_database_url(url: str) -> str:
    # Hosting providers (Neon, Railway, Heroku-style) hand out postgres:// or
    # postgresql:// URLs; use the psycopg 3 driver for them.
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


DATABASE_URL = _normalise_database_url(os.getenv("DATABASE_URL", "sqlite:///./estate_access.db"))
IS_SQLITE = DATABASE_URL.startswith("sqlite")

connect_args = {"check_same_thread": False} if IS_SQLITE else {}

# pre_ping replaces connections the database closed while idle (Neon suspends
# idle databases), instead of failing the next request.
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=not IS_SQLITE)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


# Columns added after the first release. `create_all` only creates missing
# tables, so add these to databases created before them.
_ADDED_COLUMNS = {
    "users": {
        "recovery_expires_at": "TIMESTAMP",
        "recovery_attempts": "INTEGER NOT NULL DEFAULT 0",
    },
}


def add_missing_columns():
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table, columns in _ADDED_COLUMNS.items():
            if not inspector.has_table(table):
                continue
            existing = {c["name"] for c in inspector.get_columns(table)}
            for name, ddl in columns.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
