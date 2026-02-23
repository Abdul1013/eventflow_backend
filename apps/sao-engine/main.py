from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import allocation

app = FastAPI(
    title="EventFlow SAO Engine",
    description="Seat Allocation Optimiser — K-means + greedy algorithm microservice",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Internal service — restrict in prod via Railway internal networking
    allow_methods=["POST"],
    allow_headers=["*"],
)

app.include_router(allocation.router, prefix="/allocate", tags=["Allocation"])


@app.get("/health")
def health():
    return {"status": "ok"}
