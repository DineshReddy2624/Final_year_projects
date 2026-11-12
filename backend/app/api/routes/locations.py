import urllib.parse
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status

try:
    from app.core.logger import logger
    from app.schemas.external import Coordinate
    from app.schemas.location import (
        LocationAutocompleteResponse,
        LocationItem,
        ReverseGeocodeResponse,
        RouteAssistanceRequest,
        RouteAssistanceResponse,
        RouteLegAssistance,
        RoutePreviewRequest,
        RoutePreviewResponse,
        RouteWaypoint,
    )
    from app.services.geoapify_service import geoapify_service
    from app.services.ors_service import ors_service
except ImportError:
    from backend.app.core.logger import logger
    from backend.app.schemas.external import Coordinate
    from backend.app.schemas.location import (
        LocationAutocompleteResponse,
        LocationItem,
        ReverseGeocodeResponse,
        RouteAssistanceRequest,
        RouteAssistanceResponse,
        RouteLegAssistance,
        RoutePreviewRequest,
        RoutePreviewResponse,
        RouteWaypoint,
    )
    from backend.app.services.geoapify_service import geoapify_service
    from backend.app.services.ors_service import ors_service

router = APIRouter(prefix="/locations", tags=["Locations & Geocoding"])


@router.get(
    "/autocomplete",
    response_model=LocationAutocompleteResponse,
    status_code=status.HTTP_200_OK,
    summary="Search location suggestions via live debounced autocomplete",
    description="Provides Google Maps-style location suggestions with category tags (cities, airports, railway stations, landmarks, hotels).",
)
async def autocomplete_locations(
    q: str = Query(..., min_length=1, description="Location search text query"),
    limit: int = Query(default=6, ge=1, le=15, description="Maximum suggestions to return"),
) -> LocationAutocompleteResponse:
    clean_query = q.strip()
    if not clean_query:
        return LocationAutocompleteResponse(query=q, total=0, results=[], source="empty")

    try:
        results, source = await geoapify_service.autocomplete(clean_query, limit=limit)
        return LocationAutocompleteResponse(
            query=clean_query,
            total=len(results),
            results=results,
            source=source,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in location autocomplete for '{clean_query}': {e}", exc_info=True)
        # Attempt fallback to destination search
        try:
            dest_items, src = await geoapify_service.search_destinations(clean_query, limit=limit)
            fallback_items = [
                LocationItem(
                    place_id=d.place_id or f"{d.latitude:.5f},{d.longitude:.5f}",
                    name=d.name,
                    formatted_address=d.formatted,
                    city=d.city,
                    state=d.state,
                    country=d.country,
                    country_code=d.country_code,
                    latitude=d.latitude,
                    longitude=d.longitude,
                    category="city" if d.city else "general",
                    result_type="city",
                )
                for d in dest_items
            ]
            return LocationAutocompleteResponse(
                query=clean_query,
                total=len(fallback_items),
                results=fallback_items,
                source=f"fallback_{src}",
            )
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to retrieve location suggestions for '{clean_query}'.",
            )


@router.get(
    "/reverse",
    response_model=ReverseGeocodeResponse,
    status_code=status.HTTP_200_OK,
    summary="Reverse geocode map coordinates to human-readable address",
    description="Translates clicked or dragged map coordinates (lat/lon) into structured address and place name.",
)
async def reverse_geocode_location(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees"),
) -> ReverseGeocodeResponse:
    try:
        location_item, source = await geoapify_service.reverse_geocode(lat, lon)
        return ReverseGeocodeResponse(
            latitude=lat,
            longitude=lon,
            location=location_item,
            source=source,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in reverse geocode ({lat}, {lon}): {e}", exc_info=True)
        # Fallback coordinate item
        fallback = LocationItem(
            place_id=f"{lat:.5f},{lon:.5f}",
            name=f"Selected Location ({lat:.4f}, {lon:.4f})",
            formatted_address=f"Coordinates {lat:.5f}, {lon:.5f}",
            latitude=lat,
            longitude=lon,
            category="general",
            result_type="coordinate",
        )
        return ReverseGeocodeResponse(
            latitude=lat,
            longitude=lon,
            location=fallback,
            source="fallback",
        )


@router.post(
    "/route-preview",
    response_model=RoutePreviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Calculate driving road route preview between source and destination",
    description="Computes distance in km, driving duration in hours/minutes, and Leaflet polyline geometry.",
)
async def preview_route(
    payload: RoutePreviewRequest,
) -> RoutePreviewResponse:
    # Validate coordinate distance
    dist_straight = ors_service.haversine_distance_km(
        payload.source_latitude, payload.source_longitude, payload.dest_latitude, payload.dest_longitude
    )

    profile = payload.profile or "driving-car"
    coords = [
        Coordinate(latitude=payload.source_latitude, longitude=payload.source_longitude),
        Coordinate(latitude=payload.dest_latitude, longitude=payload.dest_longitude),
    ]

    try:
        route_res = await ors_service.calculate_route(coords, profile=profile)
        road_distance_km = route_res.distance_km
        duration_mins = route_res.duration_minutes
        geometry = route_res.geometry
        source = route_res.source
    except Exception as e:
        logger.warning(f"ORS route preview failed: {e}. Calculating simulated route.")
        sim = ors_service._calculate_simulated_route(coords, profile=profile, reason=str(e))
        road_distance_km = sim.distance_km
        duration_mins = sim.duration_minutes
        geometry = sim.geometry
        source = "simulated"

    duration_hours = round(duration_mins / 60.0, 2)
    # Long distance criteria: > 300 km or > 5 hours driving
    is_long_dist = road_distance_km >= 300.0 or duration_mins >= 300.0
    suggest_stopover = is_long_dist

    return RoutePreviewResponse(
        distance_km=road_distance_km,
        duration_minutes=duration_mins,
        duration_hours=duration_hours,
        profile=profile,
        geometry=geometry,
        is_long_distance=is_long_dist,
        suggest_stopover=suggest_stopover,
        source=source,
    )


@router.post(
    "/route-assistance",
    response_model=RouteAssistanceResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate vehicle-specific route assistance from Source to all Destinations",
    description="Calculates turn-by-turn sequential leg guidance, Google Maps deep-links, road advice, and multi-stop circuit navigation based on selected vehicle.",
)
async def get_route_assistance(
    payload: RouteAssistanceRequest,
) -> RouteAssistanceResponse:
    profile = payload.profile or "driving-car"

    profile_meta = {
        "driving-car": {
            "label": "Car (Four-Wheeler)",
            "icon": "🚗",
            "speed_kmh": 58.0,
            "circuity": 1.30,
            "gmaps_mode": "driving",
            "tips": [
                "Keep Fastag RFID active for seamless highway toll plaza transit along NH44/NH40.",
                "Plan a 20-minute rest stop every 200 km or 2.5 hours to mitigate driver fatigue.",
                "Verify tire pressure and engine fluid levels prior to expressway cruising.",
                "Fuel and rest amenities are available at major highway bypass hubs.",
            ],
            "advisories": [
                "Highway speed limit: 80–100 km/h on express corridors, 40–50 km/h inside city limits.",
                "Exercise caution during early morning mist or heavy rainfall near rural stretches.",
            ],
        },
        "cycling-regular": {
            "label": "Two-Wheeler / Motorcycle",
            "icon": "🏍️",
            "speed_kmh": 46.0,
            "circuity": 1.25,
            "gmaps_mode": "two_wheeler",
            "tips": [
                "Wear full-face ISI/DOT certified helmet, riding gloves, and protective gear.",
                "Schedule hydration breaks every 60–80 km to prevent dehydration and stiffness.",
                "Keep a compact puncture kit and high-visibility rain/wind jacket handy.",
                "Plan refueling intervals every 150 km according to two-wheeler fuel tank range.",
            ],
            "advisories": [
                "Maintain steady position in the designated two-wheeler / left highway lane.",
                "Exercise caution near heavy multi-axle freight trucks on interstate highways.",
                "Access-controlled expressways may restrict two-wheelers; follow designated service routes.",
            ],
        },
        "foot-walking": {
            "label": "Walking (Pedestrian)",
            "icon": "🚶",
            "speed_kmh": 4.8,
            "circuity": 1.15,
            "gmaps_mode": "walking",
            "tips": [
                "Wear supportive, cushioned walking shoes suitable for urban and heritage streets.",
                "Carry at least 1.5 litres of water with oral rehydration salts.",
                "Utilize shaded pedestrian paths, historic arcade passages, and park trails.",
                "Morning hours (07:00–10:00) and late afternoon are optimal for pedestrian walking.",
            ],
            "advisories": [
                "Use pedestrian zebra crossings, footbridges, and designated sidewalks.",
                "Take a 10-minute rest break every 45–60 minutes to maintain walking stamina.",
            ],
        },
    }

    meta = profile_meta.get(profile, profile_meta["driving-car"])
    speed = meta["speed_kmh"]
    circuity = meta["circuity"]
    gmaps_mode = meta["gmaps_mode"]

    all_waypoints = [payload.source] + payload.destinations
    legs: List[RouteLegAssistance] = []
    total_dist_km = 0.0
    total_dur_mins = 0.0

    for i in range(len(all_waypoints) - 1):
        p_from = all_waypoints[i]
        p_to = all_waypoints[i + 1]

        straight_dist = ors_service.haversine_distance_km(
            p_from.latitude, p_from.longitude, p_to.latitude, p_to.longitude
        )
        leg_dist = round(max(0.5, straight_dist * circuity), 2)
        leg_dur_mins = round((leg_dist / speed) * 60.0, 1)

        total_dist_km += leg_dist
        total_dur_mins += leg_dur_mins

        if leg_dur_mins >= 60:
            hrs = int(leg_dur_mins // 60)
            mins = int(round(leg_dur_mins % 60))
            dur_disp = f"{hrs}h {mins}m" if mins > 0 else f"{hrs}h"
        else:
            dur_disp = f"{int(round(leg_dur_mins))} mins"

        if leg_dist > 50:
            corridor = "National Highway NH44 / NH40 Interstate Corridor"
            if profile == "driving-car":
                guidance = f"Depart {p_from.name} onto NH44/NH40 North. Cruise steadily at 70–80 km/h towards {p_to.name}. Fastag enabled at all toll plazas."
            elif profile == "cycling-regular":
                guidance = f"Ride northbound along NH44 shoulder towards {p_to.name}. Keep headlights illuminated and stop at highway rest hub."
            else:
                guidance = f"Long-distance walking stretch towards {p_to.name}. Consider local transit or scheduled trail segments."
        elif leg_dist > 15:
            corridor = "Inter-District Highway & Regional Arterial Corridor"
            if profile == "driving-car":
                guidance = f"Follow arterial bypass route towards {p_to.name}. Moderate traffic expected near district intersections."
            elif profile == "cycling-regular":
                guidance = f"Steady ride towards {p_to.name}. Watch for merging traffic and road junctions."
            else:
                guidance = f"Arterial walking trail towards {p_to.name}. Stick to marked pedestrian shoulders."
        else:
            corridor = "City Thoroughfare & Cultural Heritage Circuit"
            if profile == "driving-car":
                guidance = f"Navigate city streets towards {p_to.name}. Follow directional signboards and adhere to 40 km/h local speed limit."
            elif profile == "cycling-regular":
                guidance = f"Navigate city lanes towards {p_to.name}. Utilize designated two-wheeler lane and signal before turns."
            else:
                guidance = f"Pedestrian walking route to {p_to.name}. Explore local bazaars and shaded walkways."

        gmaps_leg_url = (
            f"https://www.google.com/maps/dir/?api=1"
            f"&origin={p_from.latitude:.6f},{p_from.longitude:.6f}"
            f"&destination={p_to.latitude:.6f},{p_to.longitude:.6f}"
            f"&travelmode={gmaps_mode}"
        )

        legs.append(
            RouteLegAssistance(
                leg_index=i + 1,
                from_name=p_from.name,
                from_latitude=p_from.latitude,
                from_longitude=p_from.longitude,
                to_name=p_to.name,
                to_latitude=p_to.latitude,
                to_longitude=p_to.longitude,
                distance_km=leg_dist,
                duration_minutes=leg_dur_mins,
                duration_display=dur_disp,
                road_corridor=corridor,
                guidance_notes=guidance,
                google_maps_leg_url=gmaps_leg_url,
            )
        )

    total_hrs = round(total_dur_mins / 60.0, 2)
    if total_dur_mins >= 60:
        tot_h = int(total_dur_mins // 60)
        tot_m = int(round(total_dur_mins % 60))
        tot_dur_disp = f"{tot_h}h {tot_m}m" if tot_m > 0 else f"{tot_h}h"
    else:
        tot_dur_disp = f"{int(round(total_dur_mins))} mins"

    s_pt = payload.source
    end_pt = payload.destinations[-1] if payload.destinations else payload.source
    inter_pts = payload.destinations[:-1] if len(payload.destinations) > 1 else []
    if len(inter_pts) > 9:
        step = max(1, len(inter_pts) // 8)
        inter_pts = inter_pts[::step][:8]

    wp_str = "|".join(f"{wp.latitude:.6f},{wp.longitude:.6f}" for wp in inter_pts)
    full_gmaps_url = (
        f"https://www.google.com/maps/dir/?api=1"
        f"&origin={s_pt.latitude:.6f},{s_pt.longitude:.6f}"
        f"&destination={end_pt.latitude:.6f},{end_pt.longitude:.6f}"
    )
    if wp_str:
        full_gmaps_url += f"&waypoints={urllib.parse.quote(wp_str)}"
    full_gmaps_url += f"&travelmode={gmaps_mode}"

    return RouteAssistanceResponse(
        vehicle_mode=profile,
        vehicle_label=meta["label"],
        vehicle_icon=meta["icon"],
        total_distance_km=round(total_dist_km, 2),
        total_duration_hours=total_hrs,
        total_duration_display=tot_dur_disp,
        total_stops_count=len(payload.destinations),
        speed_kmh=speed,
        legs=legs,
        full_circuit_google_maps_url=full_gmaps_url,
        safety_advisories=meta["advisories"],
        vehicle_tips=meta["tips"],
    )


