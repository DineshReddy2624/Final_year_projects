from datetime import date
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field, field_validator

try:
    from app.schemas.hotel import AccommodationSummary, HotelItem, JourneyAssessmentResult
except ImportError:
    from backend.app.schemas.hotel import AccommodationSummary, HotelItem, JourneyAssessmentResult


class POIScheduleInput(BaseModel):
    """Point of interest input for itinerary generation."""

    id: Optional[Union[int, str]] = Field(default=None, description="Identifier for the place")
    name: str = Field(..., min_length=1, max_length=200, description="Name of the attraction")
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees")
    category: Optional[str] = Field(default="attraction", description="Category or interest theme")
    address: Optional[str] = Field(default=None, description="Physical address")
    visit_duration_mins: int = Field(default=90, ge=0, le=720, description="Estimated visit duration in minutes")
    opening_hours: Optional[str] = Field(
        default=None, description="Opening hours specification (e.g., '09:00-18:00', '10:00-17:00')"
    )
    is_opening_hours_verified: bool = Field(
        default=False, description="True if opening hours have been verified against reliable source"
    )
    entrance_fee: Optional[float] = Field(default=None, ge=0.0, description="Entrance fee per adult in destination currency")
    is_fee_verified: bool = Field(default=False, description="True if entrance fee has been verified")
    recommendation_score: Optional[float] = Field(
        default=None, ge=0.0, le=1.0, description="Score from recommendation engine"
    )
    is_outdoor: Optional[bool] = Field(
        default=None, description="True if venue is primarily outdoor / weather-sensitive"
    )
    image_url: Optional[str] = Field(default=None, description="Verified attraction photograph URL")
    image_attribution: Optional[str] = Field(default=None, description="Photograph copyright and attribution")


class ItineraryGenerateRequest(BaseModel):
    """Request payload for multi-day itinerary generation and budget management."""

    destination: str = Field(..., min_length=1, max_length=200, description="Destination city or region name")
    start_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="Trip start date (YYYY-MM-DD)")
    end_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="Trip end date (YYYY-MM-DD)")
    travelers_count: int = Field(default=1, ge=1, le=50, description="Number of travelers")
    budget: float = Field(..., gt=0.0, description="Total budget in currency units (e.g. INR)")
    daily_available_hours: float = Field(
        default=8.0, gt=1.0, le=24.0, description="Maximum available touring hours per day"
    )
    transportation: str = Field(
        default="driving-car",
        pattern="^(driving-car|foot-walking|cycling-regular)$",
        description="Mode of travel: driving-car, foot-walking, or cycling-regular",
    )
    pace: str = Field(
        default="moderate",
        pattern="^(relaxed|moderate|packed)$",
        description="Pace of itinerary: relaxed (fewer stops), moderate, or packed",
    )
    start_time: str = Field(
        default="09:00",
        pattern=r"^([01]?[0-9]|2[0-3]):[0-5][0-9]$",
        description="Daily starting time in 24-hour HH:MM format",
    )
    start_location: Optional[POIScheduleInput] = Field(
        default=None, description="Optional hotel or starting location with verified coordinates"
    )
    destination_location: Optional[POIScheduleInput] = Field(
        default=None, description="Optional destination hub or hotel with verified coordinates"
    )
    end_location: Optional[POIScheduleInput] = Field(
        default=None, description="Optional hotel or ending location"
    )
    attractions: Optional[List[POIScheduleInput]] = Field(
        default=None,
        description="Optional list of specific attractions to schedule. If omitted, discovered automatically.",
    )
    selected_attractions: Optional[List[POIScheduleInput]] = Field(
        default=None,
        description="Optional list of specific attractions to schedule (frontend alias).",
    )
    source: Optional[str] = Field(
        default=None,
        description="Starting location name or address (e.g. 'Hyderabad Airport', 'Banjara Hills', or hotel)",
    )
    round_trip: bool = Field(
        default=True,
        description="Whether the route starts at the source and returns back to the source",
    )
    vehicle_fuel_type: Optional[str] = Field(
        default="petrol",
        description="Fuel type for car transit: petrol, diesel, cng, electric",
    )
    fuel_price_per_litre: Optional[float] = Field(
        default=105.0,
        ge=0.0,
        description="Fuel price per litre in INR",
    )
    vehicle_mileage_kmpl: Optional[float] = Field(
        default=14.0,
        gt=0.0,
        description="Vehicle fuel efficiency in km/litre",
    )
    interests: Optional[List[str]] = Field(
        default=None, description="User interest categories for automatic POI discovery"
    )
    include_accommodation: bool = Field(
        default=True, description="Whether to include estimated accommodation costs in budget"
    )
    accommodation_type: Optional[str] = Field(
        default="standard",
        description="Category: budget, standard, premium, luxury, homestay, resort, hostel",
    )
    max_daily_driving_hours: Optional[float] = Field(
        default=5.5,
        gt=1.0,
        le=24.0,
        description="Max continuous daily driving hours threshold before recommending overnight stop (default 5.5h)",
    )
    enable_stopover_recommendation: bool = Field(
        default=True,
        description="Enable automatic distance-based hotel and stopover recommendation",
    )
    preferred_stopover_town: Optional[str] = Field(
        default=None,
        description="User-selected midway town for overnight stop",
    )
    selected_stopover_hotel_id: Optional[str] = Field(
        default=None,
        description="Specific hotel ID chosen for stopover",
    )
    selected_destination_hotel_id: Optional[str] = Field(
        default=None,
        description="Specific hotel ID chosen for destination",
    )
    rooms_needed: Optional[int] = Field(
        default=None,
        ge=1,
        le=20,
        description="Custom number of hotel rooms required",
    )
    dietary_budget_tier: Optional[str] = Field(
        default="moderate",
        pattern="^(budget|moderate|luxury)$",
        description="Dining budget level",
    )

    @field_validator("end_date")
    @classmethod
    def validate_date_order(cls, v: str, info) -> str:
        start = info.data.get("start_date")
        if start and v < start:
            raise ValueError("end_date cannot be earlier than start_date")
        return v


class MealBreak(BaseModel):
    """Scheduled dining or rest break."""

    meal_type: str = Field(..., description="lunch, dinner, or coffee_break")
    name: str = Field(..., description="Description or suggested venue")
    scheduled_start: str = Field(..., description="Start time HH:MM")
    scheduled_end: str = Field(..., description="End time HH:MM")
    duration_mins: int = Field(default=60, description="Duration in minutes")
    estimated_cost_per_person: float = Field(default=0.0, description="Estimated dining cost per traveler")


class ItineraryStop(BaseModel):
    """An individual attraction visit scheduled within an itinerary day."""

    stop_order: int
    place_id: Optional[Union[int, str]] = None
    name: str
    latitude: float
    longitude: float
    category: Optional[str] = None
    arrival_time: str
    departure_time: str
    visit_duration_mins: int
    travel_duration_mins: float
    travel_distance_km: float
    opening_hours: Optional[str] = None
    opening_hours_status: str = Field(
        default="unknown", description="'verified', 'unknown', or 'conflict'"
    )
    opening_hours_warning: Optional[str] = None
    entrance_fee_per_person: float
    total_entrance_fee: float
    fee_status: str = Field(
        default="unknown_estimated", description="'verified', 'user_provided', 'free', or 'unknown_estimated'"
    )
    weather_suitability_score: float = Field(default=1.0, ge=0.0, le=1.0)
    weather_warning: Optional[str] = None
    indoor_alternative_suggested: Optional[str] = None
    is_outdoor: bool = False
    is_start_location: bool = False
    is_end_location: bool = False
    is_rest_stop: bool = False
    is_hotel_stay: bool = False
    is_stopover: bool = False
    hotel_category: Optional[str] = Field(
        default=None, description="'stopover_hotel' or 'destination_hotel'"
    )
    hotel_details: Optional[HotelItem] = None
    image_url: Optional[str] = None
    image_attribution: Optional[str] = None


class DailyWeatherSummary(BaseModel):
    """Weather context for a specific day in the itinerary."""

    date: str
    temperature_celsius: Optional[float] = None
    condition: str = "Clear"
    weather_code: Optional[int] = 0
    precipitation_mm: float = 0.0
    wind_speed_kmh: Optional[float] = None
    is_outdoor_favorable: bool = True
    suitability_summary: str = "Favorable for outdoor tourism."


class ItineraryDayPlan(BaseModel):
    """Complete scheduled itinerary for a single calendar day."""

    day_number: int
    date: str
    theme: Optional[str] = None
    weather: DailyWeatherSummary
    stops: List[ItineraryStop]
    meal_breaks: List[MealBreak]
    daily_distance_km: float
    daily_travel_time_mins: float
    daily_visit_time_mins: float
    daily_total_duration_mins: float
    daily_estimated_cost: float
    stops_count: int
    warnings: List[str] = Field(default_factory=list)
    geometry: List[List[float]] = Field(default_factory=list)


class PriceCategoryBreakdown(BaseModel):
    """Expense breakdown grouped by verification provenance."""

    verified: float = Field(default=0.0, description="Explicitly confirmed prices")
    user_provided: float = Field(default=0.0, description="Prices provided in request")
    estimated: float = Field(default=0.0, description="Calculated road, food, and accommodation estimates")
    unknown: float = Field(default=0.0, description="Missing prices filled with conservative estimates")


class ExpenseCategoryBreakdown(BaseModel):
    """Expense breakdown grouped by operational travel category."""

    transportation: float
    entrance_fees: float
    food: float
    accommodation: float
    stopover_accommodation: float = Field(default=0.0, description="Cost of en-route stopover hotels")
    destination_accommodation: float = Field(default=0.0, description="Cost of destination hotels")
    contingency_buffer: float


class VehicleTravelMetrics(BaseModel):
    """Detailed vehicle telemetry, fuel consumption, and transit cost calculation."""

    transportation: str = Field(default="driving-car", description="Mode of vehicle transit")
    fuel_type: str = Field(default="petrol", description="Fuel type: petrol, diesel, cng, electric")
    total_distance_km: float = Field(default=0.0, description="Total road distance covered across the circuit in km")
    mileage_kmpl: float = Field(default=14.0, description="Vehicle fuel efficiency in km/litre")
    fuel_price_per_litre: float = Field(default=105.0, description="Fuel price per litre in INR")
    estimated_fuel_litres: float = Field(default=0.0, description="Total fuel volume required in litres")
    estimated_fuel_cost: float = Field(default=0.0, description="Total estimated fuel expense in INR")
    parking_and_tolls_estimate: float = Field(default=0.0, description="Estimated parking fees & toll passes in INR")
    total_transit_cost: float = Field(default=0.0, description="Combined road transit expenditure (fuel + tolls + parking)")
    is_round_trip: bool = Field(default=True, description="Whether the circuit starts and finishes at origin source")
    source_name: Optional[str] = Field(default=None, description="Starting and terminating source location")
    notes: List[str] = Field(default_factory=list, description="Telemetry calculation breakdown notes")


class BudgetCalculationResult(BaseModel):
    """Complete budget evaluation and accounting report."""

    total_budget: float
    estimated_total_cost: float
    cost_per_traveler: float
    remaining_budget: float
    budget_overrun: float
    is_budget_exceeded: bool
    unknown_prices_count: int
    has_unknown_expenses: bool
    by_provenance: PriceCategoryBreakdown
    by_category: ExpenseCategoryBreakdown
    stopover_accommodation_cost: float = Field(default=0.0, description="Cost of transit stopover hotels")
    destination_accommodation_cost: float = Field(default=0.0, description="Cost of destination hotels")
    total_accommodation_cost: float = Field(default=0.0, description="Total combined accommodation cost")
    accommodation_summary: Optional[AccommodationSummary] = Field(
        default=None, description="Detailed accommodation breakdown and alternatives"
    )
    vehicle_metrics: Optional[VehicleTravelMetrics] = Field(
        default=None, description="Detailed vehicle fuel and travel telemetry when traveling by car"
    )
    budget_notes: List[str] = Field(default_factory=list)


class ItineraryUtility(BaseModel):
    """Multi-criteria utility score evaluation: U(I) = aR + bW + cT + dDv - lTr - mC."""

    overall_utility_score: float = Field(..., ge=0.0, le=1.0)
    recommendation_component: float
    weather_component: float
    time_efficiency_component: float
    diversity_component: float
    transit_penalty: float
    cost_penalty: float
    formula_summary: str
    weights: Dict[str, float]


class ItineraryResponse(BaseModel):
    """Response payload for multi-day generated itinerary."""

    itinerary_id: str
    trip_id: Optional[int] = None
    destination: str
    start_date: str
    end_date: str
    total_days: int
    travelers_count: int
    transportation: str
    pace: str
    total_attractions_scheduled: int
    total_distance_km: float
    total_travel_time_mins: float
    total_visit_time_mins: float
    budget_summary: BudgetCalculationResult
    utility: ItineraryUtility
    days: List[ItineraryDayPlan]
    journey_assessment: Optional[JourneyAssessmentResult] = Field(
        default=None, description="Intelligent distance assessment & driving fatigue analysis"
    )
    stopover_accommodation: Optional[HotelItem] = Field(
        default=None, description="Recommended midway stopover hotel if journey is long"
    )
    destination_accommodation: Optional[HotelItem] = Field(
        default=None, description="Recommended hotel at trip destination"
    )
    alternative_stopover_hotels: List[HotelItem] = Field(
        default_factory=list, description="Alternative hotel options in midway town"
    )
    alternative_destination_hotels: List[HotelItem] = Field(
        default_factory=list, description="Alternative hotel options at destination"
    )
    accommodation_summary: Optional[AccommodationSummary] = Field(
        default=None, description="Complete accommodation cost and room allocation summary"
    )
    source_location: Optional[POIScheduleInput] = Field(
        default=None, description="Starting and returning source location for round-trip circuit"
    )
    round_trip: bool = Field(default=True, description="True if trip starts and ends at the source")
    vehicle_metrics: Optional[VehicleTravelMetrics] = Field(
        default=None, description="Detailed vehicle fuel and travel telemetry for car trips"
    )
    feasibility_status: str = Field(default="feasible", description="'feasible' or 'feasible_with_warnings'")
    unresolved_constraints: List[str] = Field(default_factory=list)
    general_notes: List[str] = Field(default_factory=list)


class ItineraryValidateRequest(BaseModel):
    """Request payload to validate feasibility of a proposed itinerary."""

    destination: str
    start_date: str
    end_date: str
    budget: float
    travelers_count: int = 1
    daily_available_hours: float = 8.0
    days: List[ItineraryDayPlan]


class ConstraintViolation(BaseModel):
    """Specific constraint violation detected during validation."""

    rule: str
    day_number: Optional[int] = None
    stop_name: Optional[str] = None
    severity: str = Field(default="error", description="'error' or 'warning'")
    description: str


class ItineraryValidationResponse(BaseModel):
    """Feasibility and constraint validation report."""

    is_valid: bool
    can_generate: bool
    violations_count: int
    warnings_count: int
    errors: List[str]
    warnings: List[str]
    violations: List[ConstraintViolation]
    feasibility_summary: str

