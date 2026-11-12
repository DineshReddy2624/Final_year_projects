import asyncio
import pytest
from fastapi.testclient import TestClient

try:
    from app.main import app
    from app.services.geoapify_service import geoapify_service
    from app.services.ors_service import ors_service
    from app.schemas.itinerary import ItineraryGenerateRequest, POIScheduleInput
    from app.services.itinerary_service import itinerary_service
except ImportError:
    from backend.app.main import app
    from backend.app.services.geoapify_service import geoapify_service
    from backend.app.services.ors_service import ors_service
    from backend.app.schemas.itinerary import ItineraryGenerateRequest, POIScheduleInput
    from backend.app.services.itinerary_service import itinerary_service


client = TestClient(app)


def test_location_autocomplete_endpoint():
    """Verify GET /api/locations/autocomplete returns structured suggestions."""
    res = client.get("/api/locations/autocomplete", params={"q": "Rajampet", "limit": 4})
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    first = data["results"][0]
    assert "latitude" in first
    assert "longitude" in first
    assert "name" in first
    assert "formatted_address" in first
    # Rajampet is in Andhra Pradesh (~14.2 deg N, ~79.1 deg E)
    assert 13.5 <= first["latitude"] <= 15.5
    assert 78.5 <= first["longitude"] <= 80.0


def test_location_reverse_geocode_endpoint():
    """Verify GET /api/locations/reverse resolves lat/lon to address."""
    res = client.get("/api/locations/reverse", params={"lat": 14.239177, "lon": 79.175167})
    assert res.status_code == 200
    data = res.json()
    assert "location" in data
    loc = data["location"]
    assert loc["latitude"] == pytest.approx(14.239177, rel=1e-3)
    assert loc["longitude"] == pytest.approx(79.175167, rel=1e-3)
    assert len(loc["formatted_address"]) > 5


def test_route_preview_calculation():
    """Verify POST /api/locations/route-preview computes realistic road distance and time."""
    payload = {
        "source_latitude": 14.239177,
        "source_longitude": 79.175167,
        "dest_latitude": 17.385044,
        "dest_longitude": 78.486671,
        "profile": "driving-car",
    }
    res = client.post("/api/locations/route-preview", json=payload)
    assert res.status_code == 200
    data = res.json()
    # Road distance from Rajampet to Hyderabad is ~400-520 km
    assert 350.0 <= data["distance_km"] <= 600.0
    assert data["duration_minutes"] >= 300.0  # > 5 hours driving
    assert data["is_long_distance"] is True
    assert data["suggest_stopover"] is True
    assert len(data["geometry"]) >= 2


def test_itinerary_source_coordinates_preservation():
    """Verify that source coordinates (Rajampet) are strictly preserved and NOT overwritten by destination (Hyderabad)."""
    start_loc = POIScheduleInput(
        id="rajampet_origin",
        name="Rajampet, Y.S.R. Kadapa, Andhra Pradesh",
        latitude=14.239177,
        longitude=79.175167,
        category="Origin Hub",
        address="Rajampet, Andhra Pradesh, India",
        visit_duration_mins=0,
    )

    sample_attraction = POIScheduleInput(
        id="charminar",
        name="Charminar",
        latitude=17.361564,
        longitude=78.474665,
        category="monument",
        address="Charminar, Hyderabad, Telangana",
        visit_duration_mins=60,
        entrance_fee=25.0,
        is_fee_verified=True,
    )

    req = ItineraryGenerateRequest(
        destination="Hyderabad",
        source="Rajampet, Y.S.R. Kadapa, Andhra Pradesh",
        start_location=start_loc,
        round_trip=True,
        start_date="2026-11-20",
        end_date="2026-11-22",
        travelers_count=2,
        budget=20000.0,
        transportation="driving-car",
        pace="relaxed",
        selected_attractions=[sample_attraction],
    )

    itinerary = asyncio.run(itinerary_service.generate_itinerary(req))

    # Day 1 Stop 1 MUST be Rajampet (lat ~14.239), NOT Hyderabad (lat ~17.385)
    day1_stops = itinerary.days[0].stops
    assert len(day1_stops) >= 1
    origin_stop = day1_stops[0]
    assert origin_stop.name == "Rajampet, Y.S.R. Kadapa, Andhra Pradesh"
    assert origin_stop.latitude == pytest.approx(14.239177, abs=0.01)
    assert origin_stop.longitude == pytest.approx(79.175167, abs=0.01)

    # Destination attraction stop MUST be Charminar in Hyderabad (lat ~17.361)
    charminar_stops = [s for s in day1_stops if "Charminar" in s.name]
    if charminar_stops:
        assert charminar_stops[0].latitude == pytest.approx(17.361564, abs=0.01)
        # Verify source and destination coordinates are distinct!
        assert abs(origin_stop.latitude - charminar_stops[0].latitude) > 2.0


def test_source_geocoding_unresolved_fails_cleanly():
    """Verify that an unresolvable source string raises a clear 400 error rather than silently defaulting to destination coordinates."""
    sample_attraction = POIScheduleInput(
        id="charminar",
        name="Charminar",
        latitude=17.361564,
        longitude=78.474665,
        category="monument",
        address="Charminar, Hyderabad, Telangana",
        visit_duration_mins=60,
        entrance_fee=25.0,
        is_fee_verified=True,
    )

    req = ItineraryGenerateRequest(
        destination="Hyderabad",
        source="XyZNonExistentPlaceName123987",
        start_location=None,
        round_trip=True,
        start_date="2026-11-20",
        end_date="2026-11-21",
        travelers_count=1,
        budget=10000.0,
        transportation="driving-car",
        pace="moderate",
        selected_attractions=[sample_attraction],
    )

    # Must raise HTTPException 400 with a clear message, never silently default
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(itinerary_service.generate_itinerary(req))

    assert exc_info.value.status_code == 400
    assert "Could not locate starting location" in exc_info.value.detail
