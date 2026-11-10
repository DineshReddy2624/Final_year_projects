import math
from typing import Any, Dict, List, Optional, Tuple

try:
    from app.algorithms.geographic_clustering import haversine_distance_km
    from app.core.logger import logger
    from app.schemas.external import Coordinate
    from app.schemas.hotel import HighwayRestStop, JourneyAssessmentResult
    from app.services.ors_service import ors_service
except ImportError:
    from backend.app.algorithms.geographic_clustering import haversine_distance_km
    from backend.app.core.logger import logger
    from backend.app.schemas.external import Coordinate
    from backend.app.schemas.hotel import HighwayRestStop, JourneyAssessmentResult
    from backend.app.services.ors_service import ors_service


# Well-known major Indian highway transit hub towns with coordinates and corridor info
KNOWN_HIGHWAY_HUBS = [
    # Andhra Pradesh & Telangana Corridors
    {"name": "Kurnool", "state": "Andhra Pradesh", "latitude": 15.8309, "longitude": 78.0425, "corridors": ["NH44", "NH40"]},
    {"name": "Nandyal", "state": "Andhra Pradesh", "latitude": 15.4882, "longitude": 78.4846, "corridors": ["NH40", "NH544D"]},
    {"name": "Kadapa", "state": "Andhra Pradesh", "latitude": 14.4673, "longitude": 78.8242, "corridors": ["NH40", "NH716"]},
    {"name": "Anantapur", "state": "Andhra Pradesh", "latitude": 14.6819, "longitude": 77.6006, "corridors": ["NH44"]},
    {"name": "Mahbubnagar", "state": "Telangana", "latitude": 16.7488, "longitude": 77.9856, "corridors": ["NH44"]},
    {"name": "Jadcherla", "state": "Telangana", "latitude": 16.7667, "longitude": 78.1333, "corridors": ["NH44", "NH167"]},
    {"name": "Suryapet", "state": "Telangana", "latitude": 17.1439, "longitude": 79.6239, "corridors": ["NH65"]},
    {"name": "Vijayawada", "state": "Andhra Pradesh", "latitude": 16.5062, "longitude": 80.6480, "corridors": ["NH16", "NH65"]},
    {"name": "Nellore", "state": "Andhra Pradesh", "latitude": 14.4426, "longitude": 79.9865, "corridors": ["NH16"]},
    {"name": "Tirupati", "state": "Andhra Pradesh", "latitude": 13.6288, "longitude": 79.4192, "corridors": ["NH71", "NH140"]},
    # Karnataka / Tamil Nadu / Maharashtra Corridors
    {"name": "Chitradurga", "state": "Karnataka", "latitude": 14.2284, "longitude": 76.4024, "corridors": ["NH48"]},
    {"name": "Tumkur", "state": "Karnataka", "latitude": 13.3409, "longitude": 77.1010, "corridors": ["NH48"]},
    {"name": "Hosur", "state": "Tamil Nadu", "latitude": 12.7409, "longitude": 77.8253, "corridors": ["NH44"]},
    {"name": "Salem", "state": "Tamil Nadu", "latitude": 11.6643, "longitude": 78.1460, "corridors": ["NH44", "NH544"]},
    {"name": "Kolhapur", "state": "Maharashtra", "latitude": 16.7050, "longitude": 74.2433, "corridors": ["NH48"]},
    {"name": "Solapur", "state": "Maharashtra", "latitude": 17.6599, "longitude": 75.9064, "corridors": ["NH65", "NH52"]},
    {"name": "Pune", "state": "Maharashtra", "latitude": 18.5204, "longitude": 73.8567, "corridors": ["NH48", "NH65"]},
    # North & Central Indian Corridors
    {"name": "Agra", "state": "Uttar Pradesh", "latitude": 27.1767, "longitude": 78.0081, "corridors": ["Yamuna Expressway", "NH19"]},
    {"name": "Gwalior", "state": "Madhya Pradesh", "latitude": 26.2183, "longitude": 78.1828, "corridors": ["NH44"]},
    {"name": "Jhansi", "state": "Uttar Pradesh", "latitude": 25.4484, "longitude": 78.5685, "corridors": ["NH44", "NH27"]},
    {"name": "Nagpur", "state": "Maharashtra", "latitude": 21.1458, "longitude": 79.0882, "corridors": ["NH44", "NH53"]},
    {"name": "Jaipur", "state": "Rajasthan", "latitude": 26.9124, "longitude": 75.7873, "corridors": ["NH48"]},
    {"name": "Ajmer", "state": "Rajasthan", "latitude": 26.4499, "longitude": 74.6399, "corridors": ["NH48"]},
]


class JourneyEvaluator:
    """Intelligent distance, driving duration, and overnight stopover assessment engine."""

    DEFAULT_MAX_CONTINUOUS_DRIVE_HOURS = 5.5
    REST_STOP_INTERVAL_KM = 130.0  # Rest break approximately every ~130 km (~2 to 2.5 hours)

    @classmethod
    async def evaluate_journey(
        cls,
        source_name: str = "Origin Source",
        source_lat: Optional[float] = None,
        source_lon: Optional[float] = None,
        destination_name: str = "Destination",
        destination_lat: Optional[float] = None,
        destination_lon: Optional[float] = None,
        transportation: str = "driving-car",
        max_daily_driving_hours: float = 5.5,
        source_coords: Optional[Any] = None,
        dest_coords: Optional[Any] = None,
        max_daily_hours: Optional[float] = None,
        dest_name: Optional[str] = None,
    ) -> JourneyAssessmentResult:
        """Evaluate the intercity journey between source and destination.

        Calculates actual road distance, driving duration, classifies the journey
        into Result A, B, or C, and determines recommended midway stopover towns.
        """
        if dest_name and (destination_name == "Destination" or not destination_name):
            destination_name = dest_name

        if source_coords:
            if isinstance(source_coords, dict):
                source_lat = source_coords.get("lat", source_coords.get("latitude"))
                source_lon = source_coords.get("lon", source_coords.get("longitude"))
            elif isinstance(source_coords, (list, tuple)):
                source_lat, source_lon = source_coords[0], source_coords[1]

        if dest_coords:
            if isinstance(dest_coords, dict):
                destination_lat = dest_coords.get("lat", dest_coords.get("latitude"))
                destination_lon = dest_coords.get("lon", dest_coords.get("longitude"))
            elif isinstance(dest_coords, (list, tuple)):
                destination_lat, destination_lon = dest_coords[0], dest_coords[1]

        eff_max_hours = max_daily_hours if max_daily_hours is not None else max_daily_driving_hours

        # 1. Road distance calculation via routing service
        c_src = Coordinate(latitude=source_lat, longitude=source_lon)
        c_dst = Coordinate(latitude=destination_lat, longitude=destination_lon)

        route_res = await ors_service.calculate_route([c_src, c_dst], profile=transportation)
        road_distance_km = round(route_res.distance_km, 2)
        road_duration_mins = round(route_res.duration_minutes, 1)
        road_duration_hours = round(road_duration_mins / 60.0, 2)

        # Configurable threshold (default 5.5 hours, user-customizable between 4.0 and 9.0)
        max_hours = max(3.5, min(float(eff_max_hours or cls.DEFAULT_MAX_CONTINUOUS_DRIVE_HOURS), 10.0))

        # 2. Journey Classification (Result A, B, or C)
        # Result A: Comfortable Journey (<= max_hours or short distance)
        # Result B: Long Journey (> max_hours and <= 2 * max_hours -> 1 overnight stopover)
        # Result C: Very Long Journey (> 2 * max_hours -> multiple overnight stopovers)
        if road_duration_hours <= max_hours:
            classification = "Result A: Comfortable Journey"
            badge = "comfortable"
            is_overnight = False
            summary = (
                f"The driving journey between {source_name} and {destination_name} is approximately "
                f"{road_distance_km:.1f} km ({road_duration_hours:.1f} hours). This is comfortably achievable "
                f"in a single driving day with scheduled highway refreshment breaks."
            )
            fatigue_warning = None
            stopover_towns: List[str] = []

        elif road_duration_hours <= (max_hours * 2.0):
            classification = "Result B: Long Journey"
            badge = "long_journey"
            is_overnight = True
            stopover_towns = cls.identify_candidate_stopover_towns(
                source_lat, source_lon, destination_lat, destination_lon, num_stops=1
            )
            primary_town = stopover_towns[0] if stopover_towns else "Midway Corridor Hub"
            summary = (
                f"The driving distance between {source_name} and {destination_name} is {road_distance_km:.1f} km "
                f"({road_duration_hours:.1f} hours of continuous driving). To avoid driver fatigue and ensure "
                f"safety, an overnight stopover at {primary_town} is strongly recommended to split the trip into "
                f"two comfortable segments."
            )
            fatigue_warning = (
                f"Driving {road_duration_hours:.1f} hours exceeds the safe single-day limit of {max_hours:.1f}h. "
                f"An overnight rest stop is advised."
            )

        else:
            classification = "Result C: Very Long Journey"
            badge = "very_long_journey"
            is_overnight = True
            stopover_towns = cls.identify_candidate_stopover_towns(
                source_lat, source_lon, destination_lat, destination_lon, num_stops=2
            )
            stops_str = " and ".join(stopover_towns) if stopover_towns else "multiple transit cities"
            summary = (
                f"The distance between {source_name} and {destination_name} is {road_distance_km:.1f} km "
                f"({road_duration_hours:.1f} hours). This multi-stage journey requires dividing the route into "
                f"manageable driving days with overnight stays in {stops_str}."
            )
            fatigue_warning = (
                f"Extremely long highway route ({road_duration_hours:.1f} hours). Divided into daily driving segments "
                f"not exceeding {max_hours:.1f} hours each."
            )

        # 3. Generate intermediate highway rest stops (every ~130 km / ~2.2 hours)
        outbound_rest_stops = cls.generate_rest_stops(
            source_name, source_lat, source_lon, destination_name, destination_lat, destination_lon, road_distance_km
        )
        return_rest_stops = cls.generate_rest_stops(
            destination_name, destination_lat, destination_lon, source_name, source_lat, source_lon, road_distance_km
        )

        return JourneyAssessmentResult(
            source_name=source_name,
            source_coordinates=[source_lat, source_lon],
            destination_name=destination_name,
            destination_coordinates=[destination_lat, destination_lon],
            total_road_distance_km=road_distance_km,
            total_driving_duration_mins=road_duration_mins,
            total_driving_duration_hours=road_duration_hours,
            max_continuous_driving_hours=max_hours,
            is_overnight_stop_recommended=is_overnight,
            journey_classification=classification,
            classification_badge=badge,
            assessment_summary=summary,
            driver_fatigue_warning=fatigue_warning,
            recommended_stopover_towns=stopover_towns,
            outbound_rest_stops=outbound_rest_stops,
            return_rest_stops=return_rest_stops,
        )

    @classmethod
    def identify_candidate_stopover_towns(
        cls,
        src_lat: float,
        src_lon: float,
        dst_lat: float,
        dst_lon: float,
        num_stops: int = 1,
    ) -> List[str]:
        """Find the most geographically suitable towns along the highway corridor between source and destination."""
        candidates = []
        fractions = [0.5] if num_stops == 1 else [0.35, 0.68]

        for frac in fractions:
            ideal_lat = src_lat + frac * (dst_lat - src_lat)
            ideal_lon = src_lon + frac * (dst_lon - src_lon)

            # Find closest highway hubs from database of corridor cities
            scored_hubs = []
            for hub in KNOWN_HIGHWAY_HUBS:
                dist_to_ideal = haversine_distance_km(ideal_lat, ideal_lon, hub["latitude"], hub["longitude"])
                # Also check distance from line segment
                dist_from_src = haversine_distance_km(src_lat, src_lon, hub["latitude"], hub["longitude"])
                dist_to_dst = haversine_distance_km(hub["latitude"], hub["longitude"], dst_lat, dst_lon)
                direct_dist = haversine_distance_km(src_lat, src_lon, dst_lat, dst_lon)
                detour = (dist_from_src + dist_to_dst) - direct_dist

                # Only consider hubs reasonably on the corridor (detour < 70 km)
                if detour < 80.0:
                    scored_hubs.append((hub, dist_to_ideal, detour))

            if scored_hubs:
                # Rank by combination of distance to target fraction and minimal detour
                scored_hubs.sort(key=lambda x: x[1] + (x[2] * 0.8))
                best_hub = scored_hubs[0][0]["name"]
                if best_hub not in candidates:
                    candidates.append(best_hub)

        # Fallback if no specific known hub is close: reverse geocode coordinate or default
        if not candidates:
            mid_lat = (src_lat + dst_lat) / 2.0
            mid_lon = (src_lon + dst_lon) / 2.0
            # Identify regional quadrant
            if 14.5 <= mid_lat <= 16.5 and 77.5 <= mid_lon <= 79.0:
                candidates.append("Kurnool")
            else:
                candidates.append("Midway Transit Hub")

        return candidates

    @classmethod
    def generate_rest_stops(
        cls,
        origin_name: str,
        origin_lat: float,
        origin_lon: float,
        dest_name: str,
        dest_lat: float,
        dest_lon: float,
        total_dist_km: float,
    ) -> List[HighwayRestStop]:
        """Generate highway rest stops every ~120 to 140 km."""
        rest_stops: List[HighwayRestStop] = []
        if total_dist_km < 110.0:
            return rest_stops

        num_breaks = int(total_dist_km // cls.REST_STOP_INTERVAL_KM)
        if num_breaks == 0 and total_dist_km >= 120.0:
            num_breaks = 1

        for i in range(1, num_breaks + 1):
            fraction = (i * cls.REST_STOP_INTERVAL_KM) / total_dist_km
            if fraction >= 0.88:
                break  # Don't place a rest stop right at the destination entrance

            stop_lat = round(origin_lat + fraction * (dest_lat - origin_lat), 5)
            stop_lon = round(origin_lon + fraction * (dest_lon - origin_lon), 5)
            km_from_src = round(fraction * total_dist_km, 1)
            driving_time_mins = round((km_from_src / 60.0) * 60.0, 0)  # ~60 km/h average

            act = "Tea / Coffee & Restroom Break" if i % 2 == 1 else "Highway Meal & Stretch Break"
            dur = 25 if i % 2 == 1 else 40

            rest_stops.append(
                HighwayRestStop(
                    stop_id=f"rest_stop_{i}",
                    name=f"Highway Rest Stop #{i} (En route to {dest_name})",
                    latitude=stop_lat,
                    longitude=stop_lon,
                    approximate_distance_from_source_km=km_from_src,
                    approximate_driving_time_mins=driving_time_mins,
                    duration_mins=dur,
                    recommended_activity=act,
                    amenities=["Restrooms", "Snack Bar / Cafe", "Fuel Station", "Safe Parking"],
                )
            )

        return rest_stops


journey_evaluator = JourneyEvaluator()

