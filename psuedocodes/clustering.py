import numpy as np
from sklearn.cluster import KMeans, AgglomerativeClustering
from sklearn.preprocessing import StandardScaler
from models.schemas import AttendeePreferenceSchema

def build_feature_matrix(attendees: list[AttendeePreferenceSchema]) -> np.ndarray:
    """
    Convert attendee preferences into a numeric feature matrix.
    Features per attendee: [group_size, needs_accessible (0/1), group_id_encoded]
    group_id_encoded: hash the group_id string to an integer, then normalize.
    Attendees with no group_id get group_id_encoded = 0.
    Shape: (n_attendees, 3)
    """

def cluster_attendees(
    attendees: list[AttendeePreferenceSchema],
    n_clusters: Optional[int] = None
) -> dict[int, list[AttendeePreferenceSchema]]:
    """
    Cluster attendees by preference similarity.
    - If n_clusters is None, auto-determine: min(max(2, len(attendees) // 10), 20)
      This keeps cluster count sensible for both small and large events.
    - If len(attendees) < 10, skip clustering entirely — return all in one group
      (clustering has no value at tiny scale).
    - Use KMeans for n_attendees >= 50 (faster, good enough for large groups).
    - Use AgglomerativeClustering for n_attendees < 50 (better quality at small scale).
    - Scale features with StandardScaler before fitting.
    - Return dict mapping cluster_id (int) → list of AttendeePreferenceSchema.
    - Attendees sharing the same group_id are ALWAYS kept in the same cluster —
      after initial clustering, merge any clusters that would split a group_id.
    """

def sort_clusters_by_priority(
    clusters: dict[int, list[AttendeePreferenceSchema]]
) -> list[list[AttendeePreferenceSchema]]:
    """
    Return clusters as a list sorted by descending total group size.
    Largest groups first — this is the input order for the greedy algorithm.
    Within each cluster, sort attendees: needs_accessible=True first, then by group_size desc.
    """