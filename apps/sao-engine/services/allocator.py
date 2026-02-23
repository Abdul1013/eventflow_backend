"""
Seat Allocation Optimiser (SAO)
Implements two strategies to validate H1:
  - kmeans_greedy : K-means spatial clustering + constrained greedy assignment
  - manual_baseline : sequential/random assignment (control group)
"""

import numpy as np
from sklearn.cluster import KMeans

from models.schemas import AllocationRequest, AllocationResponse, SeatAssignment


def _kmeans_greedy(req: AllocationRequest) -> list[SeatAssignment]:
    """
    1. Cluster seats spatially with K-means (k = number of attendee groups).
    2. Greedily assign each attendee to the nearest unoccupied seat in their cluster.
    3. Handle accessible-seat requirements first.
    """
    seats = req.seats
    attendees = req.attendees

    if not seats or not attendees:
        return []

    # Separate accessible seats
    accessible = [s for s in seats if s.is_accessible]
    standard = [s for s in seats if not s.is_accessible]
    needs_accessible = [a for a in attendees if a.needs_accessible]
    regular = [a for a in attendees if not a.needs_accessible]

    assignments: list[SeatAssignment] = []
    used_seat_ids: set[str] = set()

    # 1. Assign accessible attendees first
    for attendee in needs_accessible:
        pool = accessible if accessible else standard
        for seat in pool:
            if seat.id not in used_seat_ids:
                assignments.append(SeatAssignment(seat_id=seat.id, attendee_id=attendee.id))
                used_seat_ids.add(seat.id)
                break

    # 2. K-means on remaining seats
    remaining_seats = [s for s in (standard + accessible) if s.id not in used_seat_ids]
    if not remaining_seats or not regular:
        return assignments

    coords = np.array([[s.x_coord, s.y_coord] for s in remaining_seats])
    k = min(max(1, len(regular) // 10 + 1), len(remaining_seats))
    kmeans = KMeans(n_clusters=k, random_state=42, n_init="auto")
    labels = kmeans.fit_predict(coords)

    # Group seats by cluster
    clusters: dict[int, list] = {i: [] for i in range(k)}
    for seat, label in zip(remaining_seats, labels):
        clusters[int(label)].append(seat)

    # Greedily assign regular attendees to nearest cluster seat
    for attendee in regular:
        for cluster_seats in clusters.values():
            for seat in cluster_seats:
                if seat.id not in used_seat_ids:
                    assignments.append(SeatAssignment(seat_id=seat.id, attendee_id=attendee.id))
                    used_seat_ids.add(seat.id)
                    break
            else:
                continue
            break

    return assignments


def _manual_baseline(req: AllocationRequest) -> list[SeatAssignment]:
    """Sequential assignment — control group for H1 comparison."""
    assignments: list[SeatAssignment] = []
    for seat, attendee in zip(req.seats, req.attendees):
        assignments.append(SeatAssignment(seat_id=seat.id, attendee_id=attendee.id))
    return assignments


def run_allocation(req: AllocationRequest) -> AllocationResponse:
    if req.algorithm == "kmeans_greedy":
        assignments = _kmeans_greedy(req)
    else:
        assignments = _manual_baseline(req)

    utilization = len(assignments) / len(req.seats) if req.seats else 0.0

    return AllocationResponse(
        event_id=req.event_id,
        algorithm_used=req.algorithm,
        utilization_rate=round(utilization, 4),
        assignments=assignments,
        seats_assigned=len(assignments),
        total_seats=len(req.seats),
    )
