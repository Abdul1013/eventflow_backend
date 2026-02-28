import numpy as np
from models.schemas import SeatSchema, AttendeePreferenceSchema, SeatAssignmentSchema

def build_seat_grid(seats: list[SeatSchema]) -> dict:
    """
    Build spatial index of available seats.
    Returns: {
      'available': set of seat IDs,
      'accessible': set of accessible seat IDs,
      'by_row': dict[row_label, list[SeatSchema]] sorted by seat_number,
      'coords': dict[seat_id, (x, y)]
    }
    """

def find_adjacent_seats(
    seat_grid: dict,
    count: int,
    prefer_accessible: bool = False
) -> list[SeatSchema]:
    """
    Find `count` adjacent (consecutive) seats in the same row.
    Strategy:
    1. If prefer_accessible, search accessible rows first.
    2. Iterate rows in order. Within each row, use a sliding window of size `count`
       to find the first run of `count` consecutive available seats.
       'Consecutive' means seat numbers are sequential integers OR seats have
       adjacent x_coord values (within 50 units).
    3. If no row has `count` consecutive seats, fall back: find the row with
       the most available seats and take the first `count` from it (may not be adjacent).
    4. If still not enough seats, take whatever is available up to `count` seats
       across any rows — partial assignment is better than no assignment.
    Returns list of SeatSchema of length <= count (may be less if venue is nearly full).
    """

def assign_cluster(
    cluster: list[AttendeePreferenceSchema],
    seat_grid: dict,
) -> tuple[list[SeatAssignmentSchema], list[str]]:
    """
    Assign seats to all attendees in a cluster.
    - Group attendees by group_id. Process each group atomically:
      call find_adjacent_seats(count=group_size, prefer_accessible=any member needs_accessible).
    - For attendees with no group_id, treat each as a group of 1.
    - Remove assigned seats from seat_grid['available'] after each assignment.
    - Returns (assignments, unassigned_ticket_ids).
    """

def run_greedy_assignment(
    clusters: list[list[AttendeePreferenceSchema]],
    seats: list[SeatSchema]
) -> tuple[list[SeatAssignmentSchema], list[str]]:
    """
    Main entry point for greedy assignment.
    1. Build seat grid.
    2. For each cluster (in priority order, largest first):
       call assign_cluster and accumulate assignments.
    3. Return (all_assignments, all_unassigned_ticket_ids).
    """

def run_manual_baseline(
    attendees: list[AttendeePreferenceSchema],
    seats: list[SeatSchema]
) -> tuple[list[SeatAssignmentSchema], list[str]]:
    """
    Baseline: assign seats sequentially in the order attendees were registered,
    seats in the order they appear in the list. No grouping, no clustering,
    no adjacency preference — pure naive sequential assignment.
    Used to calculate the H1 baseline utilization rate for comparison.
    """