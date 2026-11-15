from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base, SessionLocal
from .routers import auth, residents, security, admin
from .seed import seed_initial_data

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Estate Gate Access Management System API",
    description=(
        "Centralised Cloud Backend API for the Estate Residents' Mobile App (React Native Expo), "
        "Security Personnel Gate Interface (Flutter Android), and Estate Management Web Administration Dashboard (Next.js)."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
