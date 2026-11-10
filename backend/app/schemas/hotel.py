from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class HotelAmenity(BaseModel):
    """Specific hotel amenity item."""
    name: str
    icon: Optional[str] = None
    is_available: bool = True


class HotelItem(BaseModel):
    """Detailed hotel / accommodation property representation."""

    hotel_id: str = Field(..., description="Unique hotel identifier")
    name: str = Field(..., description="Hotel property name")
    hotel_type: str = Field(
        default="standard",
        description="Hotel classification: budget, standard, premium, luxury, homestay, resort, hostel",
    )
    category: str = Field(
        default="destination_hotel",
        description="'stopover_hotel' (during transit) or 'destination_hotel' (at destination)",
    )
    stopover_town: Optional[str] = Field(
        default=None, description="Town or city where the stopover hotel is located (e.g. Kurnool)"
    )
    address: str = Field(..., description="Full address of the hotel")
    city: str = Field(..., description="City or town name")
    state: Optional[str] = Field(default=None, description="State or province")
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    distance_from_route_km: float = Field(
        default=0.0, description="Detour distance from the highway corridor in km"
    )
    distance_to_destination_km: Optional[float] = Field(
        default=None, description="Remaining distance from this hotel to final destination in km"
    )
    rating: Optional[float] = Field(default=4.0, ge=0.0, le=5.0, description="Verified guest review rating")
    review_count: Optional[int] = Field(default=120, description="Number of guest reviews")
    estimated_nightly_price: float = Field(
        ..., gt=0.0, description="Estimated price per room per night in destination currency (INR)"
    )
    price_status: str = Field(
        default="indicative",
        description="'verified' (live rate), 'indicative' (market standard rate), or 'unavailable'",
    )
    room_type: str = Field(default="Standard Double Room", description="Room configuration description")
    rooms_needed: int = Field(default=1, ge=1, description="Number of rooms required based on traveler count")
    nights: int = Field(default=1, ge=1, description="Number of nights for this stay")
    total_stay_cost: float = Field(
        default=0.0, description="Total cost for this hotel stay (price_per_night * nights * rooms)"
    )
    amenities: List[str] = Field(
        default_factory=lambda: ["Free WiFi", "Free Parking", "Air Conditioning", "24/7 Front Desk"],
        description="Available amenities list",
    )
    has_parking: bool = Field(default=True, description="Whether secure on-site parking is available")
    is_family_friendly: bool = Field(default=True, description="Suitable for family travelers")
    has_restaurant: bool = Field(default=True, description="On-site restaurant or dining available")
    check_in_date: Optional[str] = Field(default=None, description="Check-in date (YYYY-MM-DD)")
    check_out_date: Optional[str] = Field(default=None, description="Check-out date (YYYY-MM-DD)")
    check_in_time: str = Field(default="14:00", description="Earliest check-in time")
    check_out_time: str = Field(default="11:00", description="Latest check-out time")
    website: Optional[str] = Field(default=None, description="Official hotel website")
    booking_url: Optional[str] = Field(default=None, description="Direct external booking link")
    image_url: Optional[str] = Field(default=None, description="Hotel photograph URL")
    image_attribution: Optional[str] = Field(default=None, description="Image source attribution")
    notes: List[str] = Field(default_factory=list, description="Descriptive highlights or traveler guidance")


class HighwayRestStop(BaseModel):
    """Scheduled refreshment, fuel, or stretch break along the highway."""

    stop_id: str
    name: str
    latitude: float
    longitude: float
    approximate_distance_from_source_km: float
    approximate_driving_time_mins: float
    duration_mins: int = 30
    recommended_activity: str = Field(
        default="Tea / Coffee & Restroom Break",
        description="Activity: Breakfast, Coffee / Tea Break, Fuel & Restroom, Lunch",
    )
    amenities: List[str] = Field(
        default_factory=lambda: ["Restrooms", "Food / Snacks", "Fuel Station", "Parking"]
    )


class JourneyAssessmentResult(BaseModel):
    """Intelligent distance and driving duration assessment between source and destination."""

    source_name: str
    source_coordinates: List[float]
    destination_name: str
    destination_coordinates: List[float]
    total_road_distance_km: float
    total_driving_duration_mins: float
    total_driving_duration_hours: float
    max_continuous_driving_hours: float = 5.5
    is_overnight_stop_recommended: bool
    journey_classification: str = Field(
        ...,
        description="'Result A: Comfortable Journey', 'Result B: Long Journey', or 'Result C: Very Long Journey'",
    )
    classification_badge: str = Field(
        default="comfortable", description="'comfortable', 'long_journey', 'very_long_journey'"
    )
    assessment_summary: str
    driver_fatigue_warning: Optional[str] = None
    recommended_stopover_towns: List[str] = Field(default_factory=list)
    outbound_rest_stops: List[HighwayRestStop] = Field(default_factory=list)
    return_rest_stops: List[HighwayRestStop] = Field(default_factory=list)


class AccommodationSummary(BaseModel):
    """Combined accommodation evaluation across both stopovers and destination stays."""

    total_accommodation_cost: float = 0.0
    total_nights_stayed: int = 0
    stopover_hotels_cost: float = 0.0
    destination_hotels_cost: float = 0.0
    cost_per_person: float = 0.0
    rooms_booked: int = 1
    stopover_hotel: Optional[HotelItem] = None
    destination_hotel: Optional[HotelItem] = None
    alternative_stopover_hotels: List[HotelItem] = Field(default_factory=list)
    alternative_destination_hotels: List[HotelItem] = Field(default_factory=list)
    accommodation_tier: str = "standard"
    notes: List[str] = Field(default_factory=list)

