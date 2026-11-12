from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class LocationItem(BaseModel):
    """Normalized geographic location item with coordinates and descriptive metadata."""
    place_id: Optional[str] = Field(default=None, description="Unique place identifier from geocoding provider")
    name: str = Field(..., description="Short display name of the place, city, or landmark")
    formatted_address: str = Field(..., description="Full formatted address string")
    city: Optional[str] = Field(default=None, description="City or municipality")
    state: Optional[str] = Field(default=None, description="State, province, or region")
    country: Optional[str] = Field(default=None, description="Country name")
    country_code: Optional[str] = Field(default=None, description="ISO two-letter country code")
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees")
    category: Optional[str] = Field(default="general", description="Category tag e.g. city, airport, station, hotel, landmark")
    result_type: Optional[str] = Field(default=None, description="Result granularity e.g. city, amenity, street, postcode")


class LocationAutocompleteResponse(BaseModel):
    """Response containing autocomplete suggestions for query string."""
    query: str
    total: int
    results: List[LocationItem]
    source: str = Field(default="live", description="'live' or 'cached'")


class ReverseGeocodeResponse(BaseModel):
    """Response for reverse geocoding coordinates into a structured location."""
    latitude: float
    longitude: float
    location: LocationItem
    source: str = Field(default="live", description="'live' or 'cached'")


class RoutePreviewRequest(BaseModel):
    """Request payload to preview route metrics between source and destination."""
    source_latitude: float = Field(..., ge=-90.0, le=90.0)
    source_longitude: float = Field(..., ge=-180.0, le=180.0)
    dest_latitude: float = Field(..., ge=-90.0, le=90.0)
    dest_longitude: float = Field(..., ge=-180.0, le=180.0)
    profile: Optional[str] = Field(default="driving-car", description="Travel mode: driving-car, foot-walking, cycling-regular")


class RoutePreviewResponse(BaseModel):
    """Road distance, travel duration, and polyline geometry for route preview."""
    distance_km: float
    duration_minutes: float
    duration_hours: float
    profile: str
    geometry: List[List[float]] = Field(description="Array of [latitude, longitude] pairs for Leaflet polyline")
    is_long_distance: bool = Field(description="True if route exceeds comfortable single-stretch driving threshold (>300km or >5hrs)")
    suggest_stopover: bool = Field(description="True if an intelligent hotel stopover is recommended")
    source: str = Field(default="live", description="'live', 'cached', or 'mocked'")


class RouteWaypoint(BaseModel):
    """Geographical waypoint or stop along the multi-destination route."""
    name: str = Field(..., description="Display name of the waypoint or stop")
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    address: Optional[str] = None
    category: Optional[str] = None
    stop_order: Optional[int] = None
    day_number: Optional[int] = None


class RouteAssistanceRequest(BaseModel):
    """Request payload to generate comprehensive route guidance from source across all destinations."""
    source: RouteWaypoint
    destinations: List[RouteWaypoint] = Field(default_factory=list, description="Ordered list of destination stops")
    profile: Optional[str] = Field(default="driving-car", description="Vehicle mode: driving-car, cycling-regular, foot-walking")


class RouteLegAssistance(BaseModel):
    """Navigation guidance for a single sequential leg between two waypoints."""
    leg_index: int
    from_name: str
    from_latitude: float
    from_longitude: float
    to_name: str
    to_latitude: float
    to_longitude: float
    distance_km: float
    duration_minutes: float
    duration_display: str
    road_corridor: str
    guidance_notes: str
    maneuver_type: str = "straight"
    google_maps_leg_url: str


class RouteAssistanceResponse(BaseModel):
    """Comprehensive route assistance data across all destinations based on selected vehicle."""
    vehicle_mode: str
    vehicle_label: str
    vehicle_icon: str
    total_distance_km: float
    total_duration_hours: float
    total_duration_display: str
    total_stops_count: int
    speed_kmh: float
    legs: List[RouteLegAssistance]
    full_circuit_google_maps_url: str
    safety_advisories: List[str]
    vehicle_tips: List[str]


