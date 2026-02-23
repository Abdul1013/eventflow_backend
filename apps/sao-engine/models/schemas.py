from pydantic import BaseModel, Field
from typing import Optional


class SeatInput(BaseModel):
    id: str
    x_coord: float
    y_coord: float
    is_accessible: bool = False
    section: Optional[str] = None


class AttendeeInput(BaseModel):
    id: str
    needs_accessible: bool = False


class AllocationRequest(BaseModel):
    event_id: str
    seats: list[SeatInput]
    attendees: list[AttendeeInput]
    algorithm: str = Field(default="kmeans_greedy", pattern="^(kmeans_greedy|manual_baseline)$")


class SeatAssignment(BaseModel):
    seat_id: str
    attendee_id: str


class AllocationResponse(BaseModel):
    event_id: str
    algorithm_used: str
    utilization_rate: float
    assignments: list[SeatAssignment]
    seats_assigned: int
    total_seats: int
