import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base, SessionLocal, add_missing_columns
from .routers import auth, residents, security, admin
from .seed import seed_initial_data

# Create database tables, and add columns introduced after a database was made
Base.metadata.create_all(bind=engine)
add_missing_columns()

# Browsers only let these web pages call the API. The mobile apps aren't
# affected (CORS only applies to web pages). Comma-separated; "*" allows any.
DEFAULT_CORS_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
CORS_ALLOWED_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]

app = FastAPI(
    title="Estate Gate Access Management System API",
    description=(
        "Centralised Cloud Backend API for the Estate Residents' Mobile App (React Native Expo), "
        "Security Personnel Gate Interface (Flutter Android), and Estate Management Web Administration Dashboard (Next.js)."
    ),
    version="1.0.0",
)

# The clients send a bearer token in the Authorization header, not cookies, so
# credentialed CORS isn't needed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.on_event("startup")
def on_startup():
    db = SessionLocal()
    try:
        seed_initial_data(db)
    finally:
        db.close()


app.include_router(auth.router)
app.include_router(residents.router)
app.include_router(security.router)
app.include_router(admin.router)


@app.get("/")
def health_check():
    return {
        "system": "Estate Gate Access Management Platform",
        "status": "operational",
        "version": "1.0.0",
        "docs_url": "/docs",
    }
