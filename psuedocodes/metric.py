from models.schemas import (
    SeatSchema, AllocationResultSchema, BaselineComparisonSchema,
    SeatAssignmentSchema, AttendeePreferenceSchema
)

def calculate_utilization_rate(
    assignments: list[SeatAssignmentSchema],
    total_seats: int
) -> float:
    """
    Spatial Density Metric: (seats_assigned / total_seats) * 100.
    Returns float 0.0–100.0. Raises ValueError if total_seats <= 0.
    """

def count_accessible_used(
    assignments: list[SeatAssignmentSchema],
    seats: list[SeatSchema]
) -> int:
    """
    Count how many assigned seats are accessible seats.
    Cross-reference assignment seat_ids with the seats list.
    """

def calculate_adjacency_score(
    assignments: list[SeatAssignmentSchema],
    attendees: list[AttendeePreferenceSchema],
    seats: list[SeatSchema]
) -> float:
    """
    Secondary academic metric: percentage of grouped attendees
    (those sharing a group_id) who ended up in the same row.
    Formula: (groups_fully_same_row / total_groups_with_size_gt_1) * 100.
    Returns 100.0 if there are no groups with size > 1.
    Logged in AllocationResult for academic report — not used in H1 calculation.
    """

def build_comparison(
    event_id: str,
    sao_result: AllocationResultSchema,
    baseline_result: AllocationResultSchema
) -> BaselineComparisonSchema:
    """
    Build the H1 validation comparison object.
    improvement_percentage = (sao_rate - baseline_rate) / baseline_rate * 100
    hypothesis_h1_passed = improvement_percentage >= 15.0
    """
    
    
# //allocation.py 
from fastapi import APIRouter, Header, HTTPException, Depends
from models.schemas import AllocationRequestSchema, AllocationResultSchema, BaselineComparisonSchema
from services.clustering import cluster_attendees, sort_clusters_by_priority
from services.greedy import run_greedy_assignment, run_manual_baseline
from services.metrics import calculate_utilization_rate, count_accessible_used, build_comparison
import time, logging

router = APIRouter(prefix="/allocation", tags=["allocation"])

def verify_api_secret(x_api_secret: str = Header(...)):
    """
    Dependency: verify X-Api-Secret header matches API_SECRET env var.
    Raises HTTP 401 if missing or wrong.
    This prevents public access to the SAO engine — only the Node API can call it.
    """

@router.post("/run", response_model=AllocationResultSchema)
async def run_allocation(
    request: AllocationRequestSchema,
    _: None = Depends(verify_api_secret)
):
    """
    Main allocation endpoint.
    1. Validate: seats list not empty, attendees list not empty,
       len(attendees) <= len(seats) (can't assign more people than seats — warn but don't fail).
    2. Record start time.
    3. Branch on request.algorithm:
       - "kmeans_greedy": cluster_attendees → sort_clusters_by_priority → run_greedy_assignment
       - "greedy_only": skip clustering, treat all attendees as one cluster → run_greedy_assignment
       - "manual_baseline": run_manual_baseline directly
    4. Calculate metrics.
    5. Record duration_ms.
    6. Log: event_id, algorithm, utilization_rate, duration_ms at INFO level.
    7. Return AllocationResultSchema.
    """

@router.post("/compare", response_model=BaselineComparisonSchema)
async def compare_with_baseline(
    request: AllocationRequestSchema,
    _: None = Depends(verify_api_secret)
):
    """
    Run BOTH kmeans_greedy AND manual_baseline on the same input.
    Return BaselineComparisonSchema with H1 validation result.
    Used by the admin portal "Allocation Comparison" panel (built Week 4).
    Both runs use the same seats and attendees list — fair comparison.
    """

@router.get("/health")
async def health():
    return {"status": "ok", "service": "sao-engine"}