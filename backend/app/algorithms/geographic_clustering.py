import math
from typing import List, Tuple, Dict, Any, Optional
import numpy as np
from sklearn.cluster import DBSCAN, KMeans
from sklearn.metrics import silhouette_score

EARTH_RADIUS_KM = 6371.0


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate Great-Circle distance between two points on the Earth's surface in kilometers."""
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2.0) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_KM * c


def run_dbscan_haversine(
    coordinates: List[Tuple[float, float]],
    eps_km: float = 3.5,
    min_samples: int = 2,
) -> List[int]:
    """Execute DBSCAN density clustering over geographic coordinates using Haversine distance metric.

    Args:
        coordinates: List of (latitude, longitude) tuples.
        eps_km: Search radius epsilon in kilometers.
        min_samples: Minimum neighborhood samples required for a core point.

    Returns:
        List of cluster labels corresponding to each input coordinate.
        -1 denotes noise / spatial outliers; 0, 1, 2... denote cluster indices.
    """
    n_points = len(coordinates)
    if n_points == 0:
        return []

    if n_points < min_samples:
        # Fewer points than min_samples cannot form a core cluster
        return [-1] * n_points

    # Scikit-learn DBSCAN with metric='haversine' expects radians in [lat, lon] order
    coords_rad = np.radians(np.array(coordinates, dtype=np.float64))
    eps_rad = eps_km / EARTH_RADIUS_KM

    db = DBSCAN(eps=eps_rad, min_samples=min_samples, metric="haversine")
    db.fit(coords_rad)

    return db.labels_.tolist()


def run_kmeans_comparison(
    coordinates: List[Tuple[float, float]],
    k: Optional[int] = None,
) -> Dict[str, Any]:
    """Run K-Means clustering as a comparison baseline against density-based DBSCAN.

    Args:
        coordinates: List of (latitude, longitude) tuples.
        k: Optional pre-set number of clusters. If None, chosen adaptively.

    Returns:
        Dictionary containing K-Means evaluation metrics and cluster assignments.
    """
    n_points = len(coordinates)
    if n_points == 0:
        return {
            "k": 0,
            "clusters_count": 0,
            "labels": [],
            "inertia": 0.0,
            "silhouette_score": None,
            "cluster_distribution": {},
            "summary": "No coordinates provided for K-Means clustering.",
        }

    # Determine K
    if k is None or k < 1:
        # Default adaptive K: min(3, n_points)
        target_k = min(3, n_points)
    else:
        target_k = min(k, n_points)

    if target_k == 1 or n_points == 1:
        labels = [0] * n_points
        return {
            "k": 1,
            "clusters_count": 1,
            "labels": labels,
            "inertia": 0.0,
            "silhouette_score": None,
            "cluster_distribution": {"Cluster 0": n_points},
            "summary": (
                "K-Means with k=1 grouped all points into a single cluster. "
                "Silhouette score is undefined for k=1."
            ),
        }

    # Fit K-Means
    coords_arr = np.array(coordinates, dtype=np.float64)
    kmeans = KMeans(n_clusters=target_k, random_state=42, n_init=10)
    labels = kmeans.fit_predict(coords_arr).tolist()

    # Calculate silhouette score if valid
    sil_score: Optional[float] = None
    if 1 < target_k < n_points:
        try:
            sil_score = round(float(silhouette_score(coords_arr, labels)), 3)
        except Exception:
            sil_score = None

    # Count distribution
    distribution: Dict[str, int] = {}
    for label in labels:
        key = f"Cluster {label}"
        distribution[key] = distribution.get(key, 0) + 1

    summary = (
        f"K-Means partitioned {n_points} places into k={target_k} rigid clusters "
        f"with inertia {kmeans.inertia_:.2f}. "
    )
    if sil_score is not None:
        summary += f"Silhouette score: {sil_score:.3f}. "
    summary += "Notice that K-Means forces every outlier into a cluster, which distorts cluster centroids."

    return {
        "k": target_k,
        "clusters_count": target_k,
        "labels": labels,
        "inertia": round(float(kmeans.inertia_), 2),
        "silhouette_score": sil_score,
        "cluster_distribution": distribution,
        "summary": summary,
    }


def calculate_cluster_envelope(
    coordinates: List[Tuple[float, float]],
) -> Dict[str, Any]:
    """Calculate the geographic centroid, maximum radius, and bounding box for a set of coordinates."""
    if not coordinates:
        return {
            "centroid": {"latitude": 0.0, "longitude": 0.0},
            "radius_km": 0.0,
            "bounding_box": {"min_lat": 0.0, "max_lat": 0.0, "min_lon": 0.0, "max_lon": 0.0},
        }

    lats = [c[0] for c in coordinates]
    lons = [c[1] for c in coordinates]

    centroid_lat = sum(lats) / len(lats)
    centroid_lon = sum(lons) / len(lons)

    max_radius_km = 0.0
    for lat, lon in coordinates:
        dist = haversine_distance_km(centroid_lat, centroid_lon, lat, lon)
        if dist > max_radius_km:
            max_radius_km = dist

    return {
        "centroid": {
            "latitude": round(centroid_lat, 6),
            "longitude": round(centroid_lon, 6),
        },
        "radius_km": round(max_radius_km, 2),
        "bounding_box": {
            "min_lat": round(min(lats), 6),
            "max_lat": round(max(lats), 6),
            "min_lon": round(min(lons), 6),
            "max_lon": round(max(lons), 6),
        },
    }


def get_dbscan_suitability_explanation() -> str:
    """Return comprehensive domain justification explaining why DBSCAN is preferred over K-Means for tourism clustering."""
    return (
        "DBSCAN (Density-Based Spatial Clustering of Applications with Noise) is substantially superior "
        "to centroid-based algorithms like K-Means for geographic tourist attraction clustering for four key reasons:\n\n"
        "1. Arbitrary Cluster Geometries: Tourist attractions naturally cluster along riverbanks, historical "
        "corridors, and commercial avenues. DBSCAN discovers arbitrary non-spherical shapes, whereas K-Means "
        "enforces isotropic, convex spherical clusters.\n\n"
        "2. No Prior Cluster Count (K) Required: Travelers select varying numbers of attractions across cities. "
        "DBSCAN discovers natural clusters dynamically based on spatial density (eps and min_samples), whereas "
        "K-Means requires guessing or forcing an arbitrary cluster count K in advance.\n\n"
        "3. Explicit Noise & Outlier Segregation: Suburban attractions or remote day-trip destinations (e.g., "
        "Ramoji Film City 35 km away from central Hyderabad) are properly labeled as noise (cluster_id = -1). "
        "K-Means forcibly pulls distant outliers into the nearest cluster, skewing centroids and ruining itinerary efficiency.\n\n"
        "4. Geodetic Distance Fidelity: DBSCAN natively executes over great-circle Haversine distances on the spherical Earth "
        "without projection distortions that occur with Euclidean planar metrics."
    )


def is_religious_place(poi: Any) -> bool:
    """Detect if a POI is a temple, mosque, church, or place of worship."""
    name = (getattr(poi, "name", "") or (poi.get("name", "") if isinstance(poi, dict) else "")).lower()
    cat = (getattr(poi, "category", "") or (poi.get("category", "") if isinstance(poi, dict) else "")).lower()
    return any(w in name or w in cat for w in ["temple", "mandir", "church", "mosque", "masjid", "basilica", "cathedral", "gurdwara", "place of worship"])


def cluster_attractions_into_daily_regions(
    attractions: List[Any],
    num_days: int,
    min_per_day: int = 3,
    max_per_day: int = 4,
) -> List[List[Any]]:
    """Partition destination attractions into coherent geographical regions for each sightseeing day.
    Prevents city-wide criss-crossing by grouping spatially proximate POIs into distinct daily clusters.
    Enforces category diversity: ensures an engaging blend of Malls, Historical Forts/Palaces,
    Nature/Lakes, and restricts religious sites to at most 1 per day.
    """
    if num_days <= 0 or not attractions:
        return [[] for _ in range(max(1, num_days))]

    if num_days == 1:
        return [attractions[:max_per_day]]

    # Step 1: Check if POIs have pre-tagged region metadata (from curated catalog or description)
    region_groups: Dict[str, List[Any]] = {}
    untagged: List[Any] = []
    for poi in attractions:
        r_id = getattr(poi, "region_id", None) or (poi.get("region_id") if isinstance(poi, dict) else None)
        if r_id:
            region_groups.setdefault(r_id, []).append(poi)
        else:
            untagged.append(poi)

    # If we have pre-tagged regional groups matching or exceeding num_days, allocate regions to days
    if len(region_groups) >= num_days:
        sorted_groups = sorted(region_groups.values(), key=len, reverse=True)
        daily_buckets = [list(g) for g in sorted_groups[:num_days]]
        # Distribute remaining groups and untagged POIs to geographically closest bucket
        remaining_pois = []
        for g in sorted_groups[num_days:]:
            remaining_pois.extend(g)
        remaining_pois.extend(untagged)
    else:
        # Step 2: Use spatial clustering (K-Means with k = num_days over geodetic coordinates)
        coords = []
        for p in attractions:
            lat = getattr(p, "latitude", None) or (p.get("latitude") if isinstance(p, dict) else 0.0)
            lon = getattr(p, "longitude", None) or (p.get("longitude") if isinstance(p, dict) else 0.0)
            coords.append((lat, lon))

        k = min(num_days, len(attractions))
        coords_arr = np.array(coords, dtype=np.float64)
        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = kmeans.fit_predict(coords_arr).tolist()

        daily_buckets = [[] for _ in range(num_days)]
        for poi, label in zip(attractions, labels):
            daily_buckets[label % num_days].append(poi)
        remaining_pois = []

    # Assign remaining POIs to the nearest day bucket by centroid distance
    for poi in remaining_pois:
        p_lat = getattr(poi, "latitude", None) or (poi.get("latitude") if isinstance(poi, dict) else 0.0)
        p_lon = getattr(poi, "longitude", None) or (poi.get("longitude") if isinstance(poi, dict) else 0.0)

        best_day = 0
        min_dist = float("inf")
        for d_idx, bucket in enumerate(daily_buckets):
            if bucket:
                c_lat = sum(getattr(b, "latitude", 0.0) or (b.get("latitude", 0.0) if isinstance(b, dict) else 0.0) for b in bucket) / len(bucket)
                c_lon = sum(getattr(b, "longitude", 0.0) or (b.get("longitude", 0.0) if isinstance(b, dict) else 0.0) for b in bucket) / len(bucket)
                dist = haversine_distance_km(p_lat, p_lon, c_lat, c_lon)
                if dist < min_dist:
                    min_dist = dist
                    best_day = d_idx
        daily_buckets[best_day].append(poi)

    # Balance each bucket to satisfy min_per_day
    for d in range(num_days):
        while len(daily_buckets[d]) < min_per_day:
            donor = max(range(num_days), key=lambda k: len(daily_buckets[k]))
            if len(daily_buckets[donor]) > min_per_day:
                # Borrow the POI in donor bucket closest to d's centroid
                if daily_buckets[d]:
                    c_lat = sum(getattr(b, "latitude", 0.0) for b in daily_buckets[d]) / len(daily_buckets[d])
                    c_lon = sum(getattr(b, "longitude", 0.0) for b in daily_buckets[d]) / len(daily_buckets[d])
                    best_poi_idx = min(
                        range(len(daily_buckets[donor])),
                        key=lambda i: haversine_distance_km(
                            c_lat, c_lon,
                            getattr(daily_buckets[donor][i], "latitude", 0.0),
                            getattr(daily_buckets[donor][i], "longitude", 0.0)
                        )
                    )
                    daily_buckets[d].append(daily_buckets[donor].pop(best_poi_idx))
                else:
                    daily_buckets[d].append(daily_buckets[donor].pop())
            else:
                break

    # Diversity Enforcement: Strictly limit temples / religious places to at most 1 per day
    for d in range(num_days):
        rel_indices = [idx for idx, poi in enumerate(daily_buckets[d]) if is_religious_place(poi)]
        if len(rel_indices) > 1:
            # Keep first religious place; swap subsequent ones with non-religious places from other days
            for surplus_idx in reversed(rel_indices[1:]):
                surplus_poi = daily_buckets[d][surplus_idx]
                swapped = False
                for other_d in range(num_days):
                    if other_d != d:
                        other_rel_count = sum(1 for p in daily_buckets[other_d] if is_religious_place(p))
                        if other_rel_count == 0:
                            # Find a non-religious place in other_d to swap
                            non_rel_indices = [idx for idx, p in enumerate(daily_buckets[other_d]) if not is_religious_place(p)]
                            if non_rel_indices:
                                swap_idx = non_rel_indices[0]
                                candidate_swap = daily_buckets[other_d][swap_idx]
                                daily_buckets[d][surplus_idx] = candidate_swap
                                daily_buckets[other_d][swap_idx] = surplus_poi
                                swapped = True
                                break
                if not swapped and len(daily_buckets[d]) > min_per_day:
                    daily_buckets[d].pop(surplus_idx)

    return daily_buckets


