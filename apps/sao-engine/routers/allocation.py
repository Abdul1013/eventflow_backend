from fastapi import APIRouter
from models.schemas import AllocationRequest, AllocationResponse
from services.allocator import run_allocation

router = APIRouter()


@router.post("/", response_model=AllocationResponse)
def allocate(req: AllocationRequest) -> AllocationResponse:
    """
    Run seat allocation for an event.
    Called by the Node.js API when admin triggers 'Run Allocation'.
    """
    return run_allocation(req)
