from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

try:
    from app.schemas.live_trip import (
        LiveNearbyPlacesResponse,
        LiveTripRecalculateRequest,
        LiveTripRecalculateResponse,
    )
    from app.services.live_trip_service import live_trip_service
except ImportError:
    from backend.app.schemas.live_trip import (
        LiveNearbyPlacesResponse,
        LiveTripRecalculateRequest,
        LiveTripRecalculateResponse,
    )
    from backend.app.services.live_trip_service import live_trip_service

router = APIRouter(prefix="/live-trip", tags=["Live On-Trip Execution & Dynamic Replanning"])


@router.post(
    "/recalculate",
    response_model=LiveTripRecalculateResponse,
    status_code=status.HTTP_200_OK,
    summary="Dynamically recalculate remaining schedule based on live GPS and clock time",
    description=(
        "Used during active on-trip navigation mode. Re-sequences all remaining stops, "
        "computes real-time ETAs from traveler's current GPS location, detects delays, "
        "and checks for venue opening hours conflicts."
    ),
)
async def recalculate_live_schedule(
    payload: LiveTripRecalculateRequest,
) -> LiveTripRecalculateResponse:
    """Dynamically adjust remaining stops on the fly."""
    try:
        return await live_trip_service.recalculate_schedule(payload)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Live recalculation failed: {str(e)}",
        )


@router.get(
    "/nearby",
    response_model=LiveNearbyPlacesResponse,
    status_code=status.HTTP_200_OK,
    summary="Discover real-time points of interest near traveler's current GPS position",
    description="Finds nearby fuel stations, restaurants, cafes, rest stops, or emergency medical facilities.",
)
async def get_live_nearby_places(
    latitude: float = Query(..., ge=-90.0, le=90.0, description="Current traveler latitude"),
    longitude: float = Query(..., ge=-180.0, le=180.0, description="Current traveler longitude"),
    category: str = Query("fuel", description="Category: fuel, restaurant, cafe, rest_stop, medical, attraction"),
    radius_meters: int = Query(5000, ge=500, le=50000, description="Search radius in meters"),
    limit: int = Query(8, ge=1, le=20, description="Maximum results"),
) -> LiveNearbyPlacesResponse:
    """Find nearby services around live coordinates."""
    return await live_trip_service.find_nearby_places(
        latitude=latitude,
        longitude=longitude,
        category=category,
        radius_meters=radius_meters,
        limit=limit,
    )

