from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

try:
    from app.schemas.itinerary import ItineraryStop
except ImportError:
    from backend.app.schemas.itinerary import ItineraryStop


class LiveTripRecalculateRequest(BaseModel):
    """Request payload to dynamically recalculate remaining itinerary stops during a live trip."""

    itinerary_id: Optional[str] = Field(default=None, description="Active itinerary ID")
    day_number: int = Field(default=1, ge=1, description="Current active itinerary day")
    current_time: str = Field(..., description="Current clock time in HH:MM format (24-hour)")
    current_latitude: float = Field(..., ge=-90.0, le=90.0, description="Current traveler GPS latitude")
    current_longitude: float = Field(..., ge=-180.0, le=180.0, description="Current traveler GPS longitude")
    active_stop_index: int = Field(default=0, ge=0, description="Index of currently targeted stop")
    completed_stop_ids: List[str] = Field(default_factory=list, description="IDs of stops already completed")
    skipped_stop_ids: List[str] = Field(default_factory=list, description="IDs of stops skipped by traveler")
    remaining_stops: List[ItineraryStop] = Field(..., description="Full list of day stops to re-sequence")
    delay_minutes: int = Field(default=0, description="Additional delay incurred (in minutes)")
    transportation: str = Field(default="driving-car", description="Current travel mode")


class LiveNearbyPlace(BaseModel):
    """Quick nearby point-of-interest for live detours and emergency rest stops."""

    place_id: str
    name: str
    category: str
    latitude: float
    longitude: float
    distance_km: float
    address: Optional[str] = None
    rating: Optional[float] = None
    estimated_detour_mins: int = 5


class LiveTripRecalculateResponse(BaseModel):
    """Real-time recalculation report with dynamically adjusted schedule and alerts."""

    status: str = "success"
    updated_stops: List[ItineraryStop]
    next_stop: Optional[ItineraryStop] = None
    estimated_next_arrival: Optional[str] = None
    eta_minutes_to_next: Optional[int] = None
    delay_detected_minutes: int = 0
    day_completion_eta: str
    alerts: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    suggested_action: Optional[str] = None


class LiveNearbyPlacesResponse(BaseModel):
    """List of nearby places found around user's live position."""

    status: str = "success"
    user_location: Dict[str, float]
    category_queried: str
    places: List[LiveNearbyPlace]
