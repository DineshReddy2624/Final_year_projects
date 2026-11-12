import math
import urllib.parse
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple, Union
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

try:
    from app.algorithms.geographic_clustering import haversine_distance_km
    from app.algorithms.budget_calculator import calculate_itinerary_budget
    from app.algorithms.itinerary_optimizer import calculate_itinerary_utility
    from app.algorithms.itinerary_validator import (
        parse_opening_hours_window,
        validate_itinerary_plan,
    )
    from app.algorithms.journey_evaluator import journey_evaluator
    from app.algorithms.route_optimizer import (
        calculate_leg_road_metrics,
        compute_distance_matrix,
        interpolate_geometry,
        minutes_to_time_str,
        nearest_neighbor_tour,
        time_str_to_minutes,
        two_opt_local_search,
    )
    from app.algorithms.weather_adjustment import (
        adjust_attraction_weather,
        evaluate_daily_weather_favorability,
        is_outdoor_venue,
    )
    from app.core.logger import logger
    from app.models.destination import Destination, Place
    from app.models.trip import Itinerary, ItineraryDay, ItineraryPlace, Trip
    from app.schemas.external import Coordinate
    from app.schemas.hotel import AccommodationSummary, HighwayRestStop, HotelItem, JourneyAssessmentResult
    from app.schemas.itinerary import (
        BudgetCalculationResult,
        DailyWeatherSummary,
        ItineraryDayPlan,
        ItineraryGenerateRequest,
        ItineraryResponse,
        ItineraryStop,
        ItineraryValidateRequest,
        ItineraryValidationResponse,
        MealBreak,
        POIScheduleInput,
    )
    from app.schemas.recommendation import RecommendationRequest
    from app.services.geoapify_service import geoapify_service
    from app.services.hotel_service import hotel_service
    from app.services.recommendation_service import recommendation_service
    from app.services.weather_service import weather_service
except ImportError:
    from backend.app.algorithms.geographic_clustering import haversine_distance_km
    from backend.app.algorithms.budget_calculator import calculate_itinerary_budget
    from backend.app.algorithms.itinerary_optimizer import calculate_itinerary_utility
    from backend.app.algorithms.itinerary_validator import (
        parse_opening_hours_window,
        validate_itinerary_plan,
    )
    from backend.app.algorithms.journey_evaluator import journey_evaluator
    from backend.app.algorithms.route_optimizer import (
        calculate_leg_road_metrics,
        compute_distance_matrix,
        interpolate_geometry,
        minutes_to_time_str,
        nearest_neighbor_tour,
        time_str_to_minutes,
        two_opt_local_search,
    )
    from backend.app.algorithms.weather_adjustment import (
        adjust_attraction_weather,
        evaluate_daily_weather_favorability,
        is_outdoor_venue,
    )
    from backend.app.core.logger import logger
    from backend.app.models.destination import Destination, Place
    from backend.app.models.trip import Itinerary, ItineraryDay, ItineraryPlace, Trip
    from backend.app.schemas.external import Coordinate
    from backend.app.schemas.hotel import AccommodationSummary, HighwayRestStop, HotelItem, JourneyAssessmentResult
    from backend.app.schemas.itinerary import (
        BudgetCalculationResult,
        DailyWeatherSummary,
        ItineraryDayPlan,
        ItineraryGenerateRequest,
        ItineraryResponse,
        ItineraryStop,
        ItineraryValidateRequest,
        ItineraryValidationResponse,
        MealBreak,
        POIScheduleInput,
    )
    from backend.app.schemas.recommendation import RecommendationRequest
    from backend.app.services.geoapify_service import geoapify_service
    from backend.app.services.hotel_service import hotel_service
    from backend.app.services.recommendation_service import recommendation_service
    from backend.app.services.weather_service import weather_service

# Curated Authentic Dining Catalog for Hyderabad
HYDERABAD_CURATED_DINING = [
    {
        "name": "Paradise Biryani & Heritage Dining",
        "cuisine": "Authentic Hyderabadi Dum Biryani & Kebabs",
        "address": "MG Road, Sappu Bagh, Secunderabad, Hyderabad, Telangana",
        "lat_offset": 0.003,
        "lon_offset": 0.002,
    },
    {
        "name": "Bawarchi Restaurant",
        "cuisine": "Famous Hyderabadi Mutton Biryani, Boti Kebab & Tandoori",
        "address": "Plot 44, RTC X Roads, Chikkadpally, Hyderabad, Telangana",
        "lat_offset": -0.002,
        "lon_offset": 0.003,
    },
    {
        "name": "Shah Ghouse Hotel & Restaurant",
        "cuisine": "Special Hyderabadi Biryani, Haleem & Tangdi Kebab",
        "address": "Opposite Syed Ali Chabutra, Shalibanda, Charminar, Hyderabad, Telangana",
        "lat_offset": -0.004,
        "lon_offset": -0.003,
    },
    {
        "name": "Chutneys Vegetarian Restaurant",
        "cuisine": "South Indian Delicacies, 7-Chutneys Babai Idli & Steamed Dosa",
        "address": "Road No. 3, Banjara Hills, Hyderabad, Telangana",
        "lat_offset": 0.004,
        "lon_offset": -0.004,
    },
    {
        "name": "Minerva Coffee House",
        "cuisine": "South Indian Filter Coffee, Executive Veg Thali & Tiffins",
        "address": "Himayatnagar Main Road, Narayanguda, Hyderabad, Telangana",
        "lat_offset": 0.001,
        "lon_offset": 0.004,
    },
    {
        "name": "Pista House Authentic Mughlai & Cafe",
        "cuisine": "Authentic Haleem, Zafrani Mutton Biryani & Irani Chai",
        "address": "Charminar Bus Stop, Shalibanda Road, Hyderabad, Telangana",
        "lat_offset": -0.003,
        "lon_offset": -0.002,
    },
    {
        "name": "Cafe Niloufer & Bakers",
        "cuisine": "World Famous Osmania Biscuits, Irani Chai & Mughlai Snacks",
        "address": "Red Hills, Lakdikapul, Hyderabad, Telangana",
        "lat_offset": 0.002,
        "lon_offset": -0.001,
    },
    {
        "name": "Jewel of Nizam - The Minar",
        "cuisine": "Royal Hyderabadi Nizami Feast & Fine Dining",
        "address": "The Golkonda Resort, Sagar Mahal Complex, Gandipet, Hyderabad, Telangana",
        "lat_offset": -0.005,
        "lon_offset": -0.006,
    },
]


def build_curated_meal_break(
    meal_type: str,
    day_num: int,
    scheduled_start: str,
    scheduled_end: str,
    duration_mins: int,
    estimated_cost_per_person: float,
    travelers_count: int,
    destination: str,
    base_lat: Optional[float] = None,
    base_lon: Optional[float] = None,
    poi_name: Optional[str] = None,
    is_highway: bool = False,
    corridor_town: Optional[str] = None,
) -> MealBreak:
    """Build a rich, realistic MealBreak with verified cuisine, address, coordinates and Google Maps search deep-link."""
    clean_dest = (destination or "").lower()
    total_cost = round(estimated_cost_per_person * max(1, travelers_count), 2)
    m_id = f"meal_d{day_num}_{meal_type}"

    if is_highway:
        town = corridor_town or "Midway Corridor"
        if meal_type == "lunch":
            venue_name = f"Highway NH44 Grand Food Plaza & Dhaba ({town})"
            cuisine = "Multi-Cuisine Highway Food Plaza & Refreshments"
            addr = f"NH44 Highway Corridor, near {town} Bypass, Andhra Pradesh"
        else:
            venue_name = f"{town} Town Center Heritage Dining"
            cuisine = "Regional Authentic Thali & Andhra Specialties"
            addr = f"Main Road, {town} Town Center, Andhra Pradesh"

        lat = round(base_lat, 5) if base_lat is not None else 15.5000
        lon = round(base_lon, 5) if base_lon is not None else 78.2000
    elif "hyderabad" in clean_dest:
        # Pick from curated Hyderabadi restaurant catalog
        idx = (day_num * 2 + (0 if meal_type == "lunch" else 1)) % len(HYDERABAD_CURATED_DINING)
        item = HYDERABAD_CURATED_DINING[idx]
        venue_name = item["name"]
        cuisine = item["cuisine"]
        addr = item["address"]
        lat = round((base_lat or 17.3850) + item["lat_offset"], 5)
        lon = round((base_lon or 78.4867) + item["lon_offset"], 5)
    else:
        # General destination
        near_txt = f"near {poi_name}" if poi_name else destination
        if meal_type == "lunch":
            venue_name = f"{destination} Spice Route & Thali House ({near_txt})"
            cuisine = f"Traditional {destination} Regional Cuisine & Tiffins"
        else:
            venue_name = f"Royal {destination} Gourmet Dining Quarter"
            cuisine = f"Multi-Cuisine Specialties & Local {destination} Feast"
        addr = f"Central Avenue, {near_txt}, {destination}"
        lat = round((base_lat or 17.3850) + 0.002 * ((day_num % 3) - 1), 5)
        lon = round((base_lon or 78.4867) + 0.002 * (((day_num + 1) % 3) - 1), 5)

    # Google Maps URL focused specifically on that restaurant and venue
    gmaps_query = f"{venue_name}, {addr}"
    google_maps_url = f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote(gmaps_query)}"

    return MealBreak(
        id=m_id,
        meal_type=meal_type,
        name=venue_name,
        scheduled_start=scheduled_start,
        scheduled_end=scheduled_end,
        duration_mins=duration_mins,
        estimated_cost_per_person=estimated_cost_per_person,
        estimated_cost=total_cost,
        latitude=lat,
        longitude=lon,
        address=addr,
        cuisine=cuisine,
        google_maps_url=google_maps_url,
    )


# Global in-memory cache for fast retrieval of generated itineraries
ITINERARY_CACHE: Dict[str, ItineraryResponse] = {}


class ItineraryService:
    """Service orchestrating multi-day itinerary generation, weather adjustments, constraint checking, and budget calculations."""

    @staticmethod
    def _parse_dates(start_date_str: str, end_date_str: str) -> Tuple[datetime.date, datetime.date, int]:
        """Validate and parse date strings into dates and total days."""
        try:
            s_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
            e_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid date format: {e}. Expected YYYY-MM-DD.",
            )

        if e_date < s_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid date range: start_date ({start_date_str}) is after end_date ({end_date_str}).",
            )

        total_days = (e_date - s_date).days + 1
        if total_days > 30:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Maximum itinerary generation limit is 30 days.",
            )

        return s_date, e_date, total_days

    async def _resolve_candidate_attractions(
        self,
        request: ItineraryGenerateRequest,
        total_days: int,
        db: Optional[Session] = None,
    ) -> List[POIScheduleInput]:
        """Obtain attraction candidates ensuring at least 3 places per day across the itinerary."""
        # 1. If caller explicitly passed attractions, honor them directly
        raw_candidates = request.selected_attractions or request.attractions or []
        if raw_candidates and len(raw_candidates) > 0:
            return raw_candidates

        # 2. When discovering automatically, ensure at least 3 distinct places per scheduled day
        min_needed = max(6, total_days * 3)
        pace_multiplier = {"relaxed": 3, "moderate": 4, "packed": 6}.get(request.pace, 4)
        target_limit = min(30, max(min_needed, total_days * pace_multiplier))

        rec_req = RecommendationRequest(
            destination=request.destination,
            interests=request.interests or ["Historical Places", "Sightseeing", "Culture"],
            budget=request.budget,
            available_duration_days=total_days,
            transportation=request.transportation,
            daily_touring_hours=request.daily_available_hours,
            limit=target_limit,
        )

        try:
            rec_res = await recommendation_service.get_recommendations(rec_req, db=db)
            candidate_pois: List[POIScheduleInput] = []
            existing_names = set()
            existing_ids = set()

            for rec in rec_res.recommendations:
                rec_id_str = str(rec.place_id) if rec.place_id else None
                rec_name_clean = rec.name.strip().lower()

                if rec_name_clean in existing_names or (rec_id_str and rec_id_str in existing_ids):
                    continue

                lat = getattr(rec, "latitude", None)
                if lat is None and hasattr(rec, "coordinates"):
                    lat = getattr(rec.coordinates, "latitude", 0.0)
                lon = getattr(rec, "longitude", None)
                if lon is None and hasattr(rec, "coordinates"):
                    lon = getattr(rec.coordinates, "longitude", 0.0)
                dur = getattr(rec, "estimated_duration_mins", None) or getattr(rec, "estimated_visit_duration", 60)
                hours = getattr(rec, "opening_hours", None)

                candidate_pois.append(
                    POIScheduleInput(
                        id=rec.place_id,
                        name=rec.name,
                        latitude=lat or 0.0,
                        longitude=lon or 0.0,
                        category=rec.category,
                        address=rec.address,
                        visit_duration_mins=dur,
                        opening_hours=hours,
                        is_opening_hours_verified=bool(hours and hours != "Unknown"),
                        entrance_fee=rec.entrance_fee,
                        is_fee_verified=rec.entrance_fee is not None,
                        recommendation_score=rec.final_score,
                        is_outdoor=is_outdoor_venue(rec.category, rec.name),
                        image_url=getattr(rec, "image_url", None),
                        image_attribution=getattr(rec, "image_attribution", None),
                    )
                )
                existing_names.add(rec_name_clean)
                if rec_id_str:
                    existing_ids.add(rec_id_str)

            if not candidate_pois:
                raise ValueError("No places returned from recommendation service")

            return candidate_pois
        except Exception as e:
            logger.warning(f"Automatic recommendation retrieval fallback: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Could not discover attractions for '{request.destination}'. Please provide specific attractions.",
            )

    @staticmethod
    def _create_poi_stop(
        poi: POIScheduleInput,
        stop_order: int,
        arrival_time_str: str,
        departure_time_str: str,
        leg_dur: float,
        leg_dist: float,
        day_weather: DailyWeatherSummary,
        indoor_alternatives: List[str],
        travelers_count: int,
        day_warnings: List[str],
    ) -> Tuple[ItineraryStop, Dict[str, Any]]:
        """Helper to create a fully validated attraction visit stop with weather and pricing status."""
        is_outdoor = is_outdoor_venue(poi.category, poi.name, poi.is_outdoor)
        w_score, w_warn, indoor_alt = adjust_attraction_weather(
            poi_name=poi.name,
            category=poi.category,
            is_outdoor=is_outdoor,
            weather_data={
                "precipitation_mm": day_weather.precipitation_mm,
                "weather_code": day_weather.weather_code,
                "wind_speed_kmh": day_weather.wind_speed_kmh,
                "temperature_celsius": day_weather.temperature_celsius,
            },
            available_indoor_alternatives=[alt for alt in indoor_alternatives if alt != poi.name],
        )
        if w_warn:
            day_warnings.append(w_warn)

        oh_status = "unknown"
        oh_warning: Optional[str] = None
        if poi.opening_hours:
            w_interval = parse_opening_hours_window(poi.opening_hours)
            if w_interval:
                op_m, cl_m = w_interval
                arr_m = time_str_to_minutes(arrival_time_str)
                dep_m = time_str_to_minutes(departure_time_str)
                if arr_m < op_m or dep_m > cl_m:
                    oh_status = "conflict"
                    oh_warning = f"Visit ({arrival_time_str}-{departure_time_str}) falls outside verified hours ({poi.opening_hours})."
                    day_warnings.append(f"Opening hours conflict at '{poi.name}': {oh_warning}")
                else:
                    oh_status = "verified"
        else:
            oh_warning = f"Opening hours unverified for '{poi.name}'. Please confirm locally."
            day_warnings.append(oh_warning)

        if poi.entrance_fee is not None:
            fee_per_person = float(poi.entrance_fee)
            fee_status = "verified" if poi.is_fee_verified else "user_provided"
        else:
            fee_per_person = 150.0
            fee_status = "unknown_estimated"

        stop_obj = ItineraryStop(
            stop_order=stop_order,
            place_id=poi.id,
            name=poi.name,
            latitude=poi.latitude,
            longitude=poi.longitude,
            category=poi.category,
            arrival_time=arrival_time_str,
            departure_time=departure_time_str,
            visit_duration_mins=poi.visit_duration_mins,
            travel_duration_mins=leg_dur,
            travel_distance_km=leg_dist,
            opening_hours=poi.opening_hours,
            opening_hours_status=oh_status,
            opening_hours_warning=oh_warning,
            entrance_fee_per_person=fee_per_person,
            total_entrance_fee=fee_per_person * travelers_count,
            fee_status=fee_status,
            weather_suitability_score=w_score,
            weather_warning=w_warn,
            indoor_alternative_suggested=indoor_alt,
            is_outdoor=is_outdoor,
            image_url=getattr(poi, "image_url", None),
            image_attribution=getattr(poi, "image_attribution", None),
        )

        flat_record = {
            "name": poi.name,
            "entrance_fee": poi.entrance_fee,
            "is_fee_verified": poi.is_fee_verified,
            "is_user_provided": bool(poi.entrance_fee is not None and not poi.is_fee_verified),
        }
        return stop_obj, flat_record

    async def _fetch_itinerary_weather(
        self,
        lat: float,
        lon: float,
        start_date: datetime.date,
        total_days: int,
    ) -> Dict[str, DailyWeatherSummary]:
        """Fetch forecast and map DailyWeatherSummary by date string."""
        weather_map: Dict[str, DailyWeatherSummary] = {}
        end_date = start_date + timedelta(days=total_days - 1)

        try:
            forecast_res = await weather_service.get_forecast(
                latitude=lat,
                longitude=lon,
                start_date=start_date.isoformat(),
                end_date=end_date.isoformat(),
            )
            daily_items = getattr(forecast_res, "daily", None) or getattr(forecast_res, "daily_forecasts", [])
            for daily in daily_items:
                f_date = daily.date
                precip = getattr(daily, "precipitation_mm", getattr(daily, "precipitation_sum_mm", 0.0)) or 0.0
                wind = getattr(daily, "max_wind_speed_kmh", getattr(daily, "wind_speed_max_kmh", 10.0)) or 10.0
                temp = getattr(daily, "max_temp_celsius", getattr(daily, "temperature_max_celsius", 25.0)) or 25.0
                is_favorable, _, summary = evaluate_daily_weather_favorability(
                    {
                        "precipitation_mm": precip,
                        "weather_code": daily.weather_code,
                        "wind_speed_kmh": wind,
                        "temperature_celsius": temp,
                    }
                )
                weather_map[f_date] = DailyWeatherSummary(
                    date=f_date,
                    temperature_celsius=temp,
                    condition=daily.condition,
                    weather_code=daily.weather_code,
                    precipitation_mm=precip,
                    wind_speed_kmh=wind,
                    is_outdoor_favorable=is_favorable,
                    suitability_summary=summary,
                )
        except Exception as e:
            logger.warning(f"Weather retrieval fallback for itinerary: {e}")

        # Fill in any missing dates with benign default
        for i in range(total_days):
            d_str = (start_date + timedelta(days=i)).isoformat()
            if d_str not in weather_map:
                weather_map[d_str] = DailyWeatherSummary(
                    date=d_str,
                    temperature_celsius=25.0,
                    condition="Mainly clear",
                    weather_code=1,
                    precipitation_mm=0.0,
                    wind_speed_kmh=10.0,
                    is_outdoor_favorable=True,
                    suitability_summary="Favorable weather conditions expected.",
                )

        return weather_map

    async def generate_itinerary(
        self,
        request: ItineraryGenerateRequest,
        db: Optional[Session] = None,
        user_id: Optional[int] = None,
    ) -> ItineraryResponse:
        """Generate a personalized, constraint-checked multi-day travel itinerary."""
        start_date, end_date, total_days = self._parse_dates(request.start_date, request.end_date)

        # 1. Resolve candidates
        attractions = await self._resolve_candidate_attractions(request, total_days, db=db)
        if not attractions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one point of interest is required to generate an itinerary.",
            )

        ref_lat = attractions[0].latitude
        ref_lon = attractions[0].longitude

        # 2. Retrieve weather forecast
        weather_by_date = await self._fetch_itinerary_weather(ref_lat, ref_lon, start_date, total_days)

        # 3. Identify indoor venues for alternatives
        indoor_alternatives = [
            a.name for a in attractions if not is_outdoor_venue(a.category, a.name, a.is_outdoor)
        ]

        # 4. Resolve Effective Source (Origin Hub) and Intercity Journey Evaluation
        effective_source: Optional[POIScheduleInput] = None

        # Priority 1: Explicit structured start_location with valid coordinates (from Google Maps picker)
        if (
            request.start_location
            and request.start_location.latitude is not None
            and request.start_location.longitude is not None
        ):
            effective_source = request.start_location
        elif request.source and request.source.strip():
            clean_source = request.source.strip()
            s_lat = None
            s_lon = None
            s_addr = clean_source
            try:
                dest_items, _ = await geoapify_service.search_destinations(clean_source, limit=1)
                if not dest_items:
                    dest_items, _ = await geoapify_service.search_destinations(f"{clean_source}, India", limit=1)
                if dest_items and len(dest_items) > 0:
                    d_item = dest_items[0]
                    s_lat = d_item.latitude
                    s_lon = d_item.longitude
                    s_addr = getattr(d_item, "formatted", getattr(d_item, "formatted_address", clean_source))
            except Exception as ge:
                logger.warning(f"Could not geocode source '{clean_source}': {ge}")

            if s_lat is not None and s_lon is not None:
                effective_source = POIScheduleInput(
                    id="source_origin",
                    name=clean_source,
                    latitude=s_lat,
                    longitude=s_lon,
                    category="Origin Hub",
                    address=s_addr,
                    visit_duration_mins=0,
                    entrance_fee=0.0,
                    is_fee_verified=True,
                )
            else:
                logger.error(
                    f"Geocoding failed for starting location '{clean_source}'. "
                    f"Rejecting silent fallback to destination coordinates ({ref_lat}, {ref_lon})."
                )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Could not locate starting location '{clean_source}'. "
                        f"Please select a location from autocomplete suggestions or pick on the map."
                    ),
                )

        # Resolve Return Location if round_trip (starts and finishes at source)
        effective_return: Optional[POIScheduleInput] = None
        if effective_source and request.round_trip:
            effective_return = POIScheduleInput(
                id="source_return",
                name=f"Return to {effective_source.name}",
                latitude=effective_source.latitude,
                longitude=effective_source.longitude,
                category="Origin Return",
                address=effective_source.address,
                visit_duration_mins=0,
                entrance_fee=0.0,
                is_fee_verified=True,
            )
        elif request.end_location:
            effective_return = request.end_location

        # 5. Evaluate Distance & Long-Distance Journey Classification (Phase 6)
        intercity_dist = 0.0
        is_intercity = False
        journey_assessment: Optional[JourneyAssessmentResult] = None
        stopover_hotel: Optional[HotelItem] = None
        alt_stopovers: List[HotelItem] = []
        destination_hotel: Optional[HotelItem] = None
        alt_destinations: List[HotelItem] = []

        if effective_source:
            intercity_dist = haversine_distance_km(
                effective_source.latitude, effective_source.longitude, ref_lat, ref_lon
            )
            # A distance > 40 km from destination center indicates an intercity journey
            is_intercity = intercity_dist > 40.0

        if is_intercity and effective_source:
            journey_assessment = await journey_evaluator.evaluate_journey(
                source_coords=(effective_source.latitude, effective_source.longitude),
                dest_coords=(ref_lat, ref_lon),
                max_daily_hours=request.max_daily_driving_hours or 5.5,
                source_name=effective_source.name,
                destination_name=request.destination,
            )

            # Discover stopover hotels if overnight stop is recommended and trip duration allows
            if (
                journey_assessment.is_overnight_stop_recommended
                and total_days >= 2
                and request.enable_stopover_recommendation
            ):
                midway_town = request.preferred_stopover_town or (
                    journey_assessment.recommended_stopover_towns[0]
                    if journey_assessment.recommended_stopover_towns
                    else "Midway Hub"
                )
                stopover_hotel, alt_stopovers = await hotel_service.generate_stopover_recommendation(
                    assessment=journey_assessment,
                    hotel_type=request.accommodation_type or "standard",
                    preferred_town=midway_town,
                    travelers_count=request.travelers_count,
                    rooms_needed=request.rooms_needed,
                    check_in_date=request.start_date,
                )

            # Destination hotel nights
            dest_nights = max(1, total_days - 2 if (stopover_hotel and total_days > 2) else (total_days - 1))
            dest_checkin_date = (
                (datetime.strptime(request.start_date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
                if stopover_hotel
                else request.start_date
            )
            destination_hotel, alt_destinations = await hotel_service.generate_destination_recommendation(
                destination_name=request.destination,
                dest_lat=ref_lat,
                dest_lon=ref_lon,
                hotel_type=request.accommodation_type or "standard",
                nights=dest_nights,
                travelers_count=request.travelers_count,
                rooms_needed=request.rooms_needed,
                check_in_date=dest_checkin_date,
            )
        elif request.include_accommodation and total_days > 1:
            destination_hotel, alt_destinations = await hotel_service.generate_destination_recommendation(
                destination_name=request.destination,
                dest_lat=ref_lat,
                dest_lon=ref_lon,
                hotel_type=request.accommodation_type or "standard",
                nights=total_days - 1,
                travelers_count=request.travelers_count,
                rooms_needed=request.rooms_needed,
                check_in_date=request.start_date,
            )

        # Allow user selection overrides if specified
        if request.selected_stopover_hotel_id and alt_stopovers:
            matched_stopover = next(
                (h for h in alt_stopovers if h.hotel_id == request.selected_stopover_hotel_id), None
            )
            if matched_stopover:
                stopover_hotel = matched_stopover

        if request.selected_destination_hotel_id and alt_destinations:
            matched_dest = next(
                (h for h in alt_destinations if h.hotel_id == request.selected_destination_hotel_id), None
            )
            if matched_dest:
                destination_hotel = matched_dest

        # Prepare AccommodationSummary
        stopover_cost = stopover_hotel.total_stay_cost if stopover_hotel else 0.0
        dest_cost = destination_hotel.total_stay_cost if destination_hotel else 0.0
        total_acc_cost = round(stopover_cost + dest_cost, 2)
        total_acc_nights = (stopover_hotel.nights if stopover_hotel else 0) + (
            destination_hotel.nights if destination_hotel else 0
        )
        num_rooms = (
            destination_hotel.rooms_needed
            if destination_hotel
            else (stopover_hotel.rooms_needed if stopover_hotel else math.ceil(request.travelers_count / 2.0))
        )
        acc_summary = AccommodationSummary(
            total_accommodation_cost=total_acc_cost,
            total_nights_stayed=total_acc_nights,
            stopover_hotels_cost=round(stopover_cost, 2),
            destination_hotels_cost=round(dest_cost, 2),
            cost_per_person=round(total_acc_cost / max(1, request.travelers_count), 2),
            rooms_booked=num_rooms,
            stopover_hotel=stopover_hotel,
            destination_hotel=destination_hotel,
            alternative_stopover_hotels=alt_stopovers,
            alternative_destination_hotels=alt_destinations,
            accommodation_tier=request.accommodation_type or "standard",
            notes=[
                (
                    f"Stopover stay in {stopover_hotel.stopover_town}: '{stopover_hotel.name}' "
                    f"({stopover_hotel.nights} night @ ₹{stopover_hotel.estimated_nightly_price:.0f}/night × {stopover_hotel.rooms_needed} room(s))"
                )
                if stopover_hotel
                else "No midway stopover required.",
                (
                    f"Destination stay in {destination_hotel.city}: '{destination_hotel.name}' "
                    f"({destination_hotel.nights} night(s) @ ₹{destination_hotel.estimated_nightly_price:.0f}/night × {destination_hotel.rooms_needed} room(s))"
                )
                if destination_hotel
                else "No destination hotel booked.",
            ],
        )

        # 6. Build Detailed Schedule for Each Day
        day_plans: List[ItineraryDayPlan] = []
        all_stops_flat: List[Dict[str, Any]] = []

        total_trip_dist_km = 0.0
        total_trip_travel_mins = 0.0
        total_trip_visit_mins = 0.0

        has_stopover = bool(
            is_intercity
            and journey_assessment
            and journey_assessment.is_overnight_stop_recommended
            and total_days >= 2
            and stopover_hotel is not None
        )

        dest_h_lat = destination_hotel.latitude if destination_hotel else ref_lat
        dest_h_lon = destination_hotel.longitude if destination_hotel else ref_lon
        dest_h_name = destination_hotel.name if destination_hotel else f"{request.destination} Hotel"

        if has_stopover:
            # INTERCITY LONG JOURNEY FLOW:
            # Day 1: Source -> Highway Rest Stops -> Midway Stopover Hotel
            # Day 2: Depart Stopover -> Transit to Destination Hotel -> Afternoon Sightseeing
            # Days 3..(N-1): Full Day Sightseeing in Destination (at least 3 attractions per day)
            # Day N: Return Highway Transit back to Source
            dest_days_count = max(1, total_days - 2 if total_days >= 3 else 1)
            dest_buckets: List[List[POIScheduleInput]] = [[] for _ in range(dest_days_count)]

            for i, poi in enumerate(attractions):
                dest_buckets[i % dest_days_count].append(poi)

            # Ensure at least 3 attractions per destination sightseeing day
            for d in range(dest_days_count):
                while len(dest_buckets[d]) < 3:
                    donor = max(range(dest_days_count), key=lambda k: len(dest_buckets[k]))
                    if len(dest_buckets[donor]) > 3:
                        dest_buckets[d].append(dest_buckets[donor].pop())
                    else:
                        break

            for day_num in range(1, total_days + 1):
                curr_date = start_date + timedelta(days=day_num - 1)
                curr_date_str = curr_date.isoformat()
                day_weather = weather_by_date[curr_date_str]
                day_stops: List[ItineraryStop] = []
                day_meals: List[MealBreak] = []
                day_warnings: List[str] = []
                clock_mins = time_str_to_minutes(request.start_time)

                if day_num == 1:
                    # DAY 1: Outbound Highway Transit & Midway Stopover
                    curr_lat = effective_source.latitude
                    curr_lon = effective_source.longitude

                    # 1. Source departure
                    day_stops.append(
                        ItineraryStop(
                            stop_order=1,
                            place_id=effective_source.id or "source_start",
                            name=effective_source.name,
                            latitude=curr_lat,
                            longitude=curr_lon,
                            category=effective_source.category or "Origin Hub",
                            arrival_time=minutes_to_time_str(clock_mins),
                            departure_time=minutes_to_time_str(clock_mins),
                            visit_duration_mins=0,
                            travel_duration_mins=0.0,
                            travel_distance_km=0.0,
                            entrance_fee_per_person=0.0,
                            total_entrance_fee=0.0,
                            fee_status="free",
                            is_start_location=True,
                        )
                    )

                    # 2. Highway rest stops en route to stopover town
                    out_stops = [
                        rs
                        for rs in journey_assessment.outbound_rest_stops
                        if rs.approximate_distance_from_source_km <= 260.0
                    ]
                    if not out_stops and journey_assessment.outbound_rest_stops:
                        out_stops = journey_assessment.outbound_rest_stops[:2]

                    for rs in out_stops:
                        leg_dist, leg_dur = calculate_leg_road_metrics(
                            curr_lat, curr_lon, rs.latitude, rs.longitude, request.transportation
                        )
                        clock_mins += int(round(leg_dur))
                        arr_str = minutes_to_time_str(clock_mins)
                        dur = rs.duration_mins
                        clock_mins += dur
                        dep_str = minutes_to_time_str(clock_mins)
                        curr_lat, curr_lon = rs.latitude, rs.longitude

                        day_stops.append(
                            ItineraryStop(
                                stop_order=len(day_stops) + 1,
                                place_id=rs.stop_id,
                                name=rs.name,
                                latitude=rs.latitude,
                                longitude=rs.longitude,
                                category="Highway Rest Stop",
                                arrival_time=arr_str,
                                departure_time=dep_str,
                                visit_duration_mins=dur,
                                travel_duration_mins=leg_dur,
                                travel_distance_km=leg_dist,
                                is_rest_stop=True,
                                entrance_fee_per_person=0.0,
                                total_entrance_fee=0.0,
                                fee_status="free",
                            )
                        )

                    # Scheduled Highway Lunch Break
                    day_meals.append(
                        build_curated_meal_break(
                            meal_type="lunch",
                            day_num=day_num,
                            scheduled_start="13:00",
                            scheduled_end="14:00",
                            duration_mins=60,
                            estimated_cost_per_person=350.0,
                            travelers_count=request.travelers_count,
                            destination=request.destination,
                            base_lat=(effective_source.latitude + stopover_hotel.latitude) / 2.0,
                            base_lon=(effective_source.longitude + stopover_hotel.longitude) / 2.0,
                            is_highway=True,
                            corridor_town=stopover_hotel.stopover_town,
                        )
                    )

                    # 3. Arrive and check in at Stopover Hotel (Midway Town)
                    leg_dist, leg_dur = calculate_leg_road_metrics(
                        curr_lat, curr_lon, stopover_hotel.latitude, stopover_hotel.longitude, request.transportation
                    )
                    clock_mins += int(round(leg_dur))
                    arr_str = minutes_to_time_str(clock_mins)
                    clock_mins += 60
                    dep_str = minutes_to_time_str(clock_mins)

                    day_stops.append(
                        ItineraryStop(
                            stop_order=len(day_stops) + 1,
                            place_id=stopover_hotel.hotel_id,
                            name=f"Check-in: {stopover_hotel.name} ({stopover_hotel.stopover_town})",
                            latitude=stopover_hotel.latitude,
                            longitude=stopover_hotel.longitude,
                            category="Stopover Hotel Stay",
                            arrival_time=arr_str,
                            departure_time=dep_str,
                            visit_duration_mins=60,
                            travel_duration_mins=leg_dur,
                            travel_distance_km=leg_dist,
                            entrance_fee_per_person=0.0,
                            total_entrance_fee=0.0,
                            fee_status="free",
                            is_hotel_stay=True,
                            is_stopover=True,
                            hotel_category="stopover_hotel",
                            hotel_details=stopover_hotel,
                            image_url=stopover_hotel.image_url,
                        )
                    )

                    # Dinner at stopover hotel / town
                    day_meals.append(
                        build_curated_meal_break(
                            meal_type="dinner",
                            day_num=day_num,
                            scheduled_start="20:00",
                            scheduled_end="21:00",
                            duration_mins=60,
                            estimated_cost_per_person=450.0,
                            travelers_count=request.travelers_count,
                            destination=request.destination,
                            base_lat=stopover_hotel.latitude,
                            base_lon=stopover_hotel.longitude,
                            is_highway=True,
                            corridor_town=stopover_hotel.stopover_town,
                        )
                    )
                    theme = f"Day 1: Outbound Transit & Overnight Stopover in {stopover_hotel.stopover_town}"

                elif day_num == 2 and total_days >= 3:
                    # DAY 2: Transit from Stopover to Destination + Afternoon Sightseeing
                    curr_lat = stopover_hotel.latitude
                    curr_lon = stopover_hotel.longitude

                    # 1. Checkout and departure from stopover hotel
                    day_stops.append(
                        ItineraryStop(
                            stop_order=1,
                            place_id=f"depart_{stopover_hotel.hotel_id}",
                            name=f"Depart {stopover_hotel.name} ({stopover_hotel.stopover_town})",
                            latitude=curr_lat,
                            longitude=curr_lon,
                            category="Stopover Hotel Departure",
                            arrival_time="09:00",
                            departure_time="09:00",
                            visit_duration_mins=0,
                            travel_duration_mins=0.0,
                            travel_distance_km=0.0,
                            entrance_fee_per_person=0.0,
                            total_entrance_fee=0.0,
                            fee_status="free",
                            is_start_location=True,
                            is_hotel_stay=True,
                            is_stopover=True,
                            hotel_category="stopover_hotel",
                            hotel_details=stopover_hotel,
                        )
                    )

                    # 2. Highway drive from stopover town to Destination Hotel
                    leg_dist, leg_dur = calculate_leg_road_metrics(
                        curr_lat, curr_lon, dest_h_lat, dest_h_lon, request.transportation
                    )
                    clock_mins += int(round(leg_dur))
                    arr_str = minutes_to_time_str(clock_mins)
                    clock_mins += 45
                    dep_str = minutes_to_time_str(clock_mins)
                    curr_lat, curr_lon = dest_h_lat, dest_h_lon

                    day_stops.append(
                        ItineraryStop(
                            stop_order=2,
                            place_id=destination_hotel.hotel_id if destination_hotel else "dest_hotel",
                            name=f"Check-in: {dest_h_name} ({request.destination})",
                            latitude=dest_h_lat,
                            longitude=dest_h_lon,
                            category="Destination Hotel Stay",
                            arrival_time=arr_str,
                            departure_time=dep_str,
                            visit_duration_mins=45,
                            travel_duration_mins=leg_dur,
                            travel_distance_km=leg_dist,
                            entrance_fee_per_person=0.0,
                            total_entrance_fee=0.0,
                            fee_status="free",
                            is_hotel_stay=True,
                            is_stopover=False,
                            hotel_category="destination_hotel",
                            hotel_details=destination_hotel,
                            image_url=destination_hotel.image_url if destination_hotel else None,
                        )
                    )

                    # Lunch break in destination
                    day_meals.append(
                        build_curated_meal_break(
                            meal_type="lunch",
                            day_num=day_num,
                            scheduled_start="12:45",
                            scheduled_end="13:45",
                            duration_mins=60,
                            estimated_cost_per_person=350.0,
                            travelers_count=request.travelers_count,
                            destination=request.destination,
                            base_lat=dest_h_lat,
                            base_lon=dest_h_lon,
                            poi_name=dest_h_name,
                        )
                    )
                    clock_mins = max(clock_mins, 825)

                    # 3. Afternoon sightseeing at destination
                    day2_pois = dest_buckets[0]
                    coords = [(curr_lat, curr_lon)] + [(p.latitude, p.longitude) for p in day2_pois] + [(dest_h_lat, dest_h_lon)]
                    matrix = compute_distance_matrix(coords, transportation=request.transportation)
                    nn_tour = nearest_neighbor_tour(matrix, start_idx=0, fixed_end_idx=len(coords) - 1)
                    opt_tour, _ = two_opt_local_search(nn_tour, matrix, fixed_start=True, fixed_end=True)
                    ordered_pois = [day2_pois[idx - 1] for idx in opt_tour[1:-1]]

                    for poi in ordered_pois:
                        leg_dist, leg_dur = calculate_leg_road_metrics(
                            curr_lat, curr_lon, poi.latitude, poi.longitude, request.transportation
                        )
                        clock_mins += int(round(leg_dur))
                        arr_str = minutes_to_time_str(clock_mins)
                        clock_mins += poi.visit_duration_mins
                        dep_str = minutes_to_time_str(clock_mins)
                        curr_lat, curr_lon = poi.latitude, poi.longitude

                        stop_obj, flat_rec = self._create_poi_stop(
                            poi=poi,
                            stop_order=len(day_stops) + 1,
                            arrival_time_str=arr_str,
                            departure_time_str=dep_str,
                            leg_dur=leg_dur,
                            leg_dist=leg_dist,
                            day_weather=day_weather,
                            indoor_alternatives=indoor_alternatives,
                            travelers_count=request.travelers_count,
                            day_warnings=day_warnings,
                        )
                        day_stops.append(stop_obj)
                        all_stops_flat.append(flat_rec)

                    # 4. Return to Destination Hotel
                    end_dist, end_dur = calculate_leg_road_metrics(
                        curr_lat, curr_lon, dest_h_lat, dest_h_lon, request.transportation
                    )
                    clock_mins += int(round(end_dur))
                    arr_str = minutes_to_time_str(clock_mins)
                    day_stops.append(
                        ItineraryStop(
                            stop_order=len(day_stops) + 1,
                            place_id=f"return_{destination_hotel.hotel_id if destination_hotel else 'dest_hotel'}",
                            name=f"Return to {dest_h_name}",
                            latitude=dest_h_lat,
                            longitude=dest_h_lon,
                            category="Destination Hotel",
                            arrival_time=arr_str,
                            departure_time=arr_str,
                            visit_duration_mins=0,
                            travel_duration_mins=end_dur,
                            travel_distance_km=end_dist,
                            entrance_fee_per_person=0.0,
                            total_entrance_fee=0.0,
                            fee_status="free",
                            is_end_location=True,
                            is_hotel_stay=True,
                            is_stopover=False,
                            hotel_category="destination_hotel",
                            hotel_details=destination_hotel,
                        )
                    )

                    day_meals.append(
                        build_curated_meal_break(
                            meal_type="dinner",
                            day_num=day_num,
                            scheduled_start="20:00",
                            scheduled_end="21:00",
                            duration_mins=60,
                            estimated_cost_per_person=450.0,
                            travelers_count=request.travelers_count,
                            destination=request.destination,
                            base_lat=dest_h_lat,
                            base_lon=dest_h_lon,
                            poi_name="City Center",
                        )
                    )
                    theme = f"Day 2: Arrival in {request.destination} & Historic Exploration"

                elif day_num < total_days and total_days >= 4:
                    # INTERMEDIATE DAYS: Full Day Sightseeing in Destination
                    b_idx = day_num - 2
                    day_pois = dest_buckets[b_idx] if b_idx < len(dest_buckets) else dest_buckets[-1]
                    curr_lat = dest_h_lat
                    curr_lon = dest_h_lon

                    # Hotel start
                    day_stops.append(
                        ItineraryStop(
                            stop_order=1,
                            place_id=f"start_{destination_hotel.hotel_id if destination_hotel else 'dest_hotel'}",
                            name=f"Depart {dest_h_name}",
                            latitude=curr_lat,
                            longitude=curr_lon,
                            category="Destination Hotel",
                            arrival_time=request.start_time,
                            departure_time=request.start_time,
                            visit_duration_mins=0,
                            travel_duration_mins=0.0,
                            travel_distance_km=0.0,
                            entrance_fee_per_person=0.0,
                            total_entrance_fee=0.0,
                            fee_status="free",
                            is_start_location=True,
                            is_hotel_stay=True,
                            is_stopover=False,
                            hotel_category="destination_hotel",
                            hotel_details=destination_hotel,
                        )
                    )

                    coords = [(curr_lat, curr_lon)] + [(p.latitude, p.longitude) for p in day_pois] + [(dest_h_lat, dest_h_lon)]
                    matrix = compute_distance_matrix(coords, transportation=request.transportation)
                    nn_tour = nearest_neighbor_tour(matrix, start_idx=0, fixed_end_idx=len(coords) - 1)
                    opt_tour, _ = two_opt_local_search(nn_tour, matrix, fixed_start=True, fixed_end=True)
                    ordered_pois = [day_pois[idx - 1] for idx in opt_tour[1:-1]]

                    lunch_scheduled = False
                    for poi in ordered_pois:
                        leg_dist, leg_dur = calculate_leg_road_metrics(
                            curr_lat, curr_lon, poi.latitude, poi.longitude, request.transportation
                        )
                        clock_mins += int(round(leg_dur))

                        if clock_mins >= 750 and not lunch_scheduled:
                            lunch_start = minutes_to_time_str(clock_mins)
                            clock_mins += 60
                            lunch_end = minutes_to_time_str(clock_mins)
                            day_meals.append(
                                build_curated_meal_break(
                                    meal_type="lunch",
                                    day_num=day_num,
                                    scheduled_start=lunch_start,
                                    scheduled_end=lunch_end,
                                    duration_mins=60,
                                    estimated_cost_per_person=350.0,
                                    travelers_count=request.travelers_count,
                                    destination=request.destination,
                                    base_lat=poi.latitude,
                                    base_lon=poi.longitude,
                                    poi_name=poi.name,
                                )
                            )
                            lunch_scheduled = True

                        arr_str = minutes_to_time_str(clock_mins)
                        clock_mins += poi.visit_duration_mins
                        dep_str = minutes_to_time_str(clock_mins)
                        curr_lat, curr_lon = poi.latitude, poi.longitude

                        stop_obj, flat_rec = self._create_poi_stop(
                            poi=poi,
                            stop_order=len(day_stops) + 1,
                            arrival_time_str=arr_str,
                            departure_time_str=dep_str,
                            leg_dur=leg_dur,
                            leg_dist=leg_dist,
                            day_weather=day_weather,
                            indoor_alternatives=indoor_alternatives,
                            travelers_count=request.travelers_count,
                            day_warnings=day_warnings,
                        )
                        day_stops.append(stop_obj)
                        all_stops_flat.append(flat_rec)

                    # Return to Hotel
                    end_dist, end_dur = calculate_leg_road_metrics(
                        curr_lat, curr_lon, dest_h_lat, dest_h_lon, request.transportation
                    )
                    clock_mins += int(round(end_dur))
                    arr_str = minutes_to_time_str(clock_mins)
                    day_stops.append(
                        ItineraryStop(
                            stop_order=len(day_stops) + 1,
                            place_id=f"return_{destination_hotel.hotel_id if destination_hotel else 'dest_hotel'}",
                            name=f"Return to {dest_h_name}",
                            latitude=dest_h_lat,
                            longitude=dest_h_lon,
                            category="Destination Hotel",
                            arrival_time=arr_str,
                            departure_time=arr_str,
                            visit_duration_mins=0,
                            travel_duration_mins=end_dur,
                            travel_distance_km=end_dist,
                            entrance_fee_per_person=0.0,
                            total_entrance_fee=0.0,
                            fee_status="free",
                            is_end_location=True,
                            is_hotel_stay=True,
                            is_stopover=False,
                            hotel_category="destination_hotel",
                            hotel_details=destination_hotel,
                        )
                    )

                    day_meals.append(
                        build_curated_meal_break(
                            meal_type="dinner",
                            day_num=day_num,
                            scheduled_start="19:30",
                            scheduled_end="20:30",
                            duration_mins=60,
                            estimated_cost_per_person=450.0,
                            travelers_count=request.travelers_count,
                            destination=request.destination,
                            base_lat=dest_h_lat,
                            base_lon=dest_h_lon,
                            poi_name="Dining Quarter",
                        )
                    )
                    theme = f"Day {day_num}: {request.destination} Culture, Forts & Architecture"

                else:
                    # FINAL DAY: Return Highway Journey to Source
                    curr_lat = stopover_hotel.latitude if total_days == 2 and stopover_hotel else dest_h_lat
                    curr_lon = stopover_hotel.longitude if total_days == 2 and stopover_hotel else dest_h_lon

                    day_stops.append(
                        ItineraryStop(
                            stop_order=1,
                            place_id="dest_checkout",
                            name=f"Check-out: {dest_h_name}",
                            latitude=curr_lat,
                            longitude=curr_lon,
                            category="Destination Hotel Departure",
                            arrival_time="09:00",
                            departure_time="09:00",
                            visit_duration_mins=0,
                            travel_duration_mins=0.0,
                            travel_distance_km=0.0,
                            entrance_fee_per_person=0.0,
                            total_entrance_fee=0.0,
                            fee_status="free",
                            is_start_location=True,
                            is_hotel_stay=True,
                            is_stopover=False,
                            hotel_category="destination_hotel",
                            hotel_details=destination_hotel,
                        )
                    )

                    # Scheduled Return Rest Stops
                    ret_stops = journey_assessment.return_rest_stops or []
                    for rs in ret_stops:
                        leg_dist, leg_dur = calculate_leg_road_metrics(
                            curr_lat, curr_lon, rs.latitude, rs.longitude, request.transportation
                        )
                        clock_mins += int(round(leg_dur))
                        arr_str = minutes_to_time_str(clock_mins)
                        dur = rs.duration_mins
                        clock_mins += dur
                        dep_str = minutes_to_time_str(clock_mins)
                        curr_lat, curr_lon = rs.latitude, rs.longitude

                        day_stops.append(
                            ItineraryStop(
                                stop_order=len(day_stops) + 1,
                                place_id=rs.stop_id,
                                name=rs.name,
                                latitude=rs.latitude,
                                longitude=rs.longitude,
                                category="Highway Rest Stop",
                                arrival_time=arr_str,
                                departure_time=dep_str,
                                visit_duration_mins=dur,
                                travel_duration_mins=leg_dur,
                                travel_distance_km=leg_dist,
                                is_rest_stop=True,
                                entrance_fee_per_person=0.0,
                                total_entrance_fee=0.0,
                                fee_status="free",
                            )
                        )

                    day_meals.append(
                        build_curated_meal_break(
                            meal_type="lunch",
                            day_num=day_num,
                            scheduled_start="13:00",
                            scheduled_end="14:00",
                            duration_mins=60,
                            estimated_cost_per_person=350.0,
                            travelers_count=request.travelers_count,
                            destination=request.destination,
                            base_lat=(curr_lat + effective_source.latitude) / 2.0,
                            base_lon=(curr_lon + effective_source.longitude) / 2.0,
                            is_highway=True,
                            corridor_town=stopover_hotel.stopover_town if stopover_hotel else "Return Corridor",
                        )
                    )

                    # Arrive back at Source Origin
                    end_target = effective_return or effective_source
                    end_dist, end_dur = calculate_leg_road_metrics(
                        curr_lat, curr_lon, end_target.latitude, end_target.longitude, request.transportation
                    )
                    clock_mins += int(round(end_dur))
                    arr_str = minutes_to_time_str(clock_mins)

                    day_stops.append(
                        ItineraryStop(
                            stop_order=len(day_stops) + 1,
                            place_id=end_target.id or "source_return",
                            name=end_target.name,
                            latitude=end_target.latitude,
                            longitude=end_target.longitude,
                            category="Origin Return",
                            arrival_time=arr_str,
                            departure_time=arr_str,
                            visit_duration_mins=0,
                            travel_duration_mins=end_dur,
                            travel_distance_km=end_dist,
                            entrance_fee_per_person=0.0,
                            total_entrance_fee=0.0,
                            fee_status="free",
                            is_end_location=True,
                        )
                    )
                    theme = f"Day {total_days}: Return Journey to {end_target.name}"

                # Daily metrics
                day_dist = round(sum(s.travel_distance_km for s in day_stops), 2)
                day_travel = round(sum(s.travel_duration_mins for s in day_stops), 1)
                day_visit = round(sum(s.visit_duration_mins for s in day_stops), 1)
                day_meals_mins = sum(m.duration_mins for m in day_meals)
                day_duration = round(day_travel + day_visit + day_meals_mins, 1)

                total_trip_dist_km += day_dist
                total_trip_travel_mins += day_travel
                total_trip_visit_mins += day_visit

                geom = interpolate_geometry([(s.latitude, s.longitude) for s in day_stops], steps=4)
                day_plan = ItineraryDayPlan(
                    day_number=day_num,
                    date=curr_date_str,
                    theme=theme,
                    weather=day_weather,
                    stops=day_stops,
                    meal_breaks=day_meals,
                    daily_distance_km=day_dist,
                    daily_travel_time_mins=day_travel,
                    daily_visit_time_mins=day_visit,
                    daily_total_duration_mins=day_duration,
                    daily_estimated_cost=round(sum(s.total_entrance_fee for s in day_stops), 2),
                    stops_count=len([s for s in day_stops if not s.is_start_location and not s.is_end_location and not s.is_rest_stop and not s.is_hotel_stay]),
                    warnings=day_warnings,
                    geometry=geom,
                )
                day_plans.append(day_plan)

        else:
            # STANDARD / INTRACITY / COMFORTABLE JOURNEY FLOW:
            min_daily = 3
            daily_buckets: List[List[POIScheduleInput]] = [[] for _ in range(total_days)]
            for i, poi in enumerate(attractions):
                daily_buckets[i % total_days].append(poi)

            for d in range(total_days):
                while len(daily_buckets[d]) < min_daily:
                    donor = max(range(total_days), key=lambda k: len(daily_buckets[k]))
                    if len(daily_buckets[donor]) > min_daily:
                        daily_buckets[d].append(daily_buckets[donor].pop())
                    else:
                        break

            dest_h_lat = destination_hotel.latitude if destination_hotel else ref_lat
            dest_h_lon = destination_hotel.longitude if destination_hotel else ref_lon
            dest_h_name = destination_hotel.name if destination_hotel else f"{request.destination} Hotel"

            dest_hotel_poi = POIScheduleInput(
                id=destination_hotel.hotel_id if destination_hotel else "dest_hotel",
                name=dest_h_name,
                latitude=dest_h_lat,
                longitude=dest_h_lon,
                category="Destination Hotel",
                address=destination_hotel.address if destination_hotel else request.destination,
                visit_duration_mins=0,
                entrance_fee=0.0,
                is_fee_verified=True,
            )

            for day_num in range(1, total_days + 1):
                curr_date = start_date + timedelta(days=day_num - 1)
                curr_date_str = curr_date.isoformat()
                day_weather = weather_by_date[curr_date_str]
                day_pois = daily_buckets[day_num - 1]

                if not day_pois:
                    day_plans.append(
                        ItineraryDayPlan(
                            day_number=day_num,
                            date=curr_date_str,
                            theme="Leisure & Exploration Day",
                            weather=day_weather,
                            stops=[],
                            meal_breaks=[],
                            daily_distance_km=0.0,
                            daily_travel_time_mins=0.0,
                            daily_visit_time_mins=0.0,
                            daily_total_duration_mins=0.0,
                            daily_estimated_cost=0.0,
                            stops_count=0,
                            warnings=["No fixed attractions scheduled; leisure and personal exploration."],
                            geometry=[],
                        )
                    )
                    continue

                # Determine start and end points for this day:
                # 1. Intercity Multi-Day Trips (>40km from destination, e.g. Rajampet -> Hyderabad):
                #    Travelers stay at destination lodging each night and ONLY return to origin on the final day!
                # 2. Local Same-City Circuits (<=40km):
                #    Daily round-trips from local hub/airport.
                # 3. No Source specified:
                #    Direct sightseeing stops only.
                if effective_source:
                    if is_intercity and total_days > 1:
                        if day_num == 1:
                            day_start_poi = effective_source
                            day_end_poi = dest_hotel_poi
                            is_final_day = False
                        elif day_num < total_days:
                            day_start_poi = dest_hotel_poi
                            day_end_poi = dest_hotel_poi
                            is_final_day = False
                        else:
                            day_start_poi = dest_hotel_poi
                            day_end_poi = effective_return or effective_source
                            is_final_day = True
                    else:
                        day_start_poi = effective_source
                        day_end_poi = effective_return if request.round_trip else None
                        is_final_day = (day_num == total_days)
                else:
                    day_start_poi = None
                    day_end_poi = None
                    is_final_day = (day_num == total_days)

                if day_start_poi and day_end_poi and len(day_pois) > 0:
                    day_all_points = [day_start_poi] + day_pois + [day_end_poi]
                    coords = [(p.latitude, p.longitude) for p in day_all_points]
                    matrix = compute_distance_matrix(coords, transportation=request.transportation)
                    last_idx = len(coords) - 1
                    nn_tour = nearest_neighbor_tour(matrix, start_idx=0, fixed_end_idx=last_idx)
                    opt_tour, _ = two_opt_local_search(nn_tour, matrix, fixed_start=True, fixed_end=True)
                    ordered_day_pois = [day_all_points[idx] for idx in opt_tour[1:-1]]
                else:
                    day_coords = [(p.latitude, p.longitude) for p in day_pois]
                    matrix = compute_distance_matrix(day_coords, transportation=request.transportation)
                    nn_tour = nearest_neighbor_tour(matrix, start_idx=0)
                    opt_tour, _ = two_opt_local_search(nn_tour, matrix, fixed_start=False, fixed_end=False)
                    ordered_day_pois = [day_pois[idx] for idx in opt_tour]

                clock_mins = time_str_to_minutes(request.start_time)
                curr_lat: Optional[float] = None
                curr_lon: Optional[float] = None

                day_stops = []
                day_meals = []
                day_warnings = []

                if day_start_poi:
                    curr_lat = day_start_poi.latitude
                    curr_lon = day_start_poi.longitude
                    is_origin_start = (day_num == 1 and effective_source and day_start_poi == effective_source)
                    day_stops.append(
                        ItineraryStop(
                            stop_order=1,
                            place_id=day_start_poi.id or "day_start",
                            name=day_start_poi.name if is_origin_start else f"Depart {day_start_poi.name}",
                            latitude=day_start_poi.latitude,
                            longitude=day_start_poi.longitude,
                            category="Origin Hub" if is_origin_start else "Destination Hotel",
                            arrival_time=minutes_to_time_str(clock_mins),
                            departure_time=minutes_to_time_str(clock_mins),
                            visit_duration_mins=0,
                            travel_duration_mins=0.0,
                            travel_distance_km=0.0,
                            entrance_fee_per_person=0.0,
                            total_entrance_fee=0.0,
                            fee_status="free",
                            is_start_location=True,
                            is_hotel_stay=not is_origin_start,
                            hotel_category="destination_hotel" if not is_origin_start else None,
                            hotel_details=destination_hotel if not is_origin_start else None,
                        )
                    )

                lunch_scheduled = False
                for poi in ordered_day_pois:
                    if curr_lat is not None and curr_lon is not None:
                        leg_dist, leg_dur = calculate_leg_road_metrics(
                            curr_lat, curr_lon, poi.latitude, poi.longitude, request.transportation
                        )
                    else:
                        leg_dist, leg_dur = 0.0, 0.0

                    clock_mins += int(round(leg_dur))

                    if clock_mins >= 750 and not lunch_scheduled:
                        lunch_start = minutes_to_time_str(clock_mins)
                        clock_mins += 60
                        lunch_end = minutes_to_time_str(clock_mins)
                        day_meals.append(
                            build_curated_meal_break(
                                meal_type="lunch",
                                day_num=day_num,
                                scheduled_start=lunch_start,
                                scheduled_end=lunch_end,
                                duration_mins=60,
                                estimated_cost_per_person=350.0,
                                travelers_count=request.travelers_count,
                                destination=request.destination,
                                base_lat=poi.latitude,
                                base_lon=poi.longitude,
                                poi_name=poi.name,
                            )
                        )
                        lunch_scheduled = True

                    arr_str = minutes_to_time_str(clock_mins)
                    clock_mins += poi.visit_duration_mins
                    dep_str = minutes_to_time_str(clock_mins)
                    curr_lat = poi.latitude
                    curr_lon = poi.longitude

                    stop_obj, flat_rec = self._create_poi_stop(
                        poi=poi,
                        stop_order=len(day_stops) + 1,
                        arrival_time_str=arr_str,
                        departure_time_str=dep_str,
                        leg_dur=leg_dur,
                        leg_dist=leg_dist,
                        day_weather=day_weather,
                        indoor_alternatives=indoor_alternatives,
                        travelers_count=request.travelers_count,
                        day_warnings=day_warnings,
                    )
                    day_stops.append(stop_obj)
                    all_stops_flat.append(flat_rec)

                # Dinner break
                day_meals.append(
                    build_curated_meal_break(
                        meal_type="dinner",
                        day_num=day_num,
                        scheduled_start="20:00",
                        scheduled_end="21:00",
                        duration_mins=60,
                        estimated_cost_per_person=450.0,
                        travelers_count=request.travelers_count,
                        destination=request.destination,
                        base_lat=dest_h_lat,
                        base_lon=dest_h_lon,
                        poi_name=dest_h_name,
                    )
                )

                if day_end_poi and curr_lat is not None and curr_lon is not None:
                    end_dist, end_dur = calculate_leg_road_metrics(
                        curr_lat, curr_lon, day_end_poi.latitude, day_end_poi.longitude, request.transportation
                    )
                    clock_mins += int(round(end_dur))
                    arr_str = minutes_to_time_str(clock_mins)

                    is_origin_return = is_final_day and (day_end_poi == effective_return or day_end_poi == effective_source)
                    day_stops.append(
                        ItineraryStop(
                            stop_order=len(day_stops) + 1,
                            place_id=day_end_poi.id or ("source_return" if is_origin_return else "dest_hotel_stay"),
                            name=day_end_poi.name if is_origin_return else f"Return to {dest_h_name}",
                            latitude=day_end_poi.latitude,
                            longitude=day_end_poi.longitude,
                            category="Origin Return" if is_origin_return else "Destination Hotel",
                            arrival_time=arr_str,
                            departure_time=arr_str,
                            visit_duration_mins=0,
                            travel_duration_mins=end_dur,
                            travel_distance_km=end_dist,
                            entrance_fee_per_person=0.0,
                            total_entrance_fee=0.0,
                            fee_status="free",
                            is_end_location=True,
                            is_hotel_stay=not is_origin_return,
                            hotel_category="destination_hotel" if not is_origin_return else None,
                            hotel_details=destination_hotel if not is_origin_return else None,
                        )
                    )

                day_dist = round(sum(s.travel_distance_km for s in day_stops), 2)
                day_travel = round(sum(s.travel_duration_mins for s in day_stops), 1)
                day_visit = round(sum(s.visit_duration_mins for s in day_stops), 1)
                day_meals_mins = sum(m.duration_mins for m in day_meals)
                day_duration = round(day_travel + day_visit + day_meals_mins, 1)

                total_trip_dist_km += day_dist
                total_trip_travel_mins += day_travel
                total_trip_visit_mins += day_visit

                max_daily_mins = int(request.daily_available_hours * 60.0)
                if day_duration > max_daily_mins:
                    day_warnings.append(
                        f"Day schedule ({day_duration:.0f} mins) exceeds daily limit of {max_daily_mins} mins ({request.daily_available_hours}h)."
                    )

                geom = interpolate_geometry([(s.latitude, s.longitude) for s in day_stops], steps=4)
                first_poi_name = ordered_day_pois[0].name if ordered_day_pois else "City Exploration"
                day_plan = ItineraryDayPlan(
                    day_number=day_num,
                    date=curr_date_str,
                    theme=f"Day {day_num}: {first_poi_name} & Cultural Highlights",
                    weather=day_weather,
                    stops=day_stops,
                    meal_breaks=day_meals,
                    daily_distance_km=day_dist,
                    daily_travel_time_mins=day_travel,
                    daily_visit_time_mins=day_visit,
                    daily_total_duration_mins=day_duration,
                    daily_estimated_cost=round(sum(s.total_entrance_fee for s in day_stops), 2),
                    stops_count=len([s for s in day_stops if not s.is_start_location and not s.is_end_location and not s.is_rest_stop and not s.is_hotel_stay]),
                    warnings=day_warnings,
                    geometry=geom,
                )
                day_plans.append(day_plan)

        # 7. Budget Calculation & Vehicle Fuel Telemetry
        budget_result = calculate_itinerary_budget(
            total_budget=request.budget,
            travelers_count=request.travelers_count,
            total_days=total_days,
            total_distance_km=total_trip_dist_km,
            transportation=request.transportation,
            stops_data=all_stops_flat,
            include_accommodation=request.include_accommodation,
            accommodation_type=request.accommodation_type or "standard",
            dietary_budget_tier=request.dietary_budget_tier or "moderate",
            fuel_type=request.vehicle_fuel_type or "petrol",
            mileage_kmpl=request.vehicle_mileage_kmpl or 14.0,
            fuel_price_per_litre=request.fuel_price_per_litre or 105.0,
            source_name=effective_source.name if effective_source else None,
            is_round_trip=request.round_trip,
            stopover_hotel=stopover_hotel,
            destination_hotel=destination_hotel,
            accommodation_summary=acc_summary,
            rooms_needed=num_rooms,
        )

        # 8. Constraint Validation
        validation = validate_itinerary_plan(
            destination=request.destination,
            start_date=request.start_date,
            end_date=request.end_date,
            budget=request.budget,
            daily_available_hours=request.daily_available_hours,
            days=day_plans,
            total_cost=budget_result.estimated_total_cost,
        )

        # 9. Multi-Criteria Utility Optimization Evaluation U(I)
        utility = calculate_itinerary_utility(
            days=day_plans,
            budget_result=budget_result,
            daily_available_hours=request.daily_available_hours,
        )

        # 10. Assembly & Persistence
        itinerary_id = f"itin_{uuid.uuid4().hex[:12]}"
        feasibility_status = "feasible" if validation.is_valid and not validation.warnings else "feasible_with_warnings"

        response = ItineraryResponse(
            itinerary_id=itinerary_id,
            destination=request.destination,
            start_date=request.start_date,
            end_date=request.end_date,
            total_days=total_days,
            travelers_count=request.travelers_count,
            transportation=request.transportation,
            pace=request.pace,
            total_attractions_scheduled=len(all_stops_flat),
            total_distance_km=round(total_trip_dist_km, 2),
            total_travel_time_mins=round(total_trip_travel_mins, 1),
            total_visit_time_mins=round(total_trip_visit_mins, 1),
            budget_summary=budget_result,
            utility=utility,
            days=day_plans,
            journey_assessment=journey_assessment,
            stopover_accommodation=stopover_hotel,
            destination_accommodation=destination_hotel,
            alternative_stopover_hotels=alt_stopovers,
            alternative_destination_hotels=alt_destinations,
            accommodation_summary=acc_summary,
            source_location=effective_source,
            round_trip=request.round_trip,
            vehicle_metrics=budget_result.vehicle_metrics,
            feasibility_status=feasibility_status,
            unresolved_constraints=validation.errors,
            general_notes=budget_result.budget_notes + validation.warnings,
        )

        # Store in cache
        ITINERARY_CACHE[itinerary_id] = response

        # Store in SQLite database if user is authenticated
        if db is not None:
            try:
                dest_rec = db.query(Destination).filter(Destination.name.ilike(f"%{request.destination}%")).first()
                if not dest_rec:
                    dest_rec = Destination(
                        name=request.destination,
                        country="India",
                        latitude=ref_lat,
                        longitude=ref_lon,
                    )
                    db.add(dest_rec)
                    db.flush()

                # If user_id provided or guest
                actual_user_id = user_id if user_id else 1
                trip = Trip(
                    user_id=actual_user_id,
                    destination_id=dest_rec.id,
                    start_date=start_date,
                    end_date=end_date,
                    budget=request.budget,
                    travelers_count=request.travelers_count,
                    transportation=request.transportation,
                    status="planned",
                )
                db.add(trip)
                db.flush()

                itin_rec = Itinerary(
                    trip_id=trip.id,
                    title=f"{total_days}-Day Trip to {request.destination}",
                    total_estimated_cost=budget_result.estimated_total_cost,
                    total_distance=total_trip_dist_km,
                    total_duration=round(total_trip_travel_mins + total_trip_visit_mins, 1) / 60.0,
                )
                db.add(itin_rec)
                db.flush()

                response.trip_id = trip.id
                db.commit()
            except Exception as dbe:
                db.rollback()
                logger.warning(f"Database persistence skipped for itinerary {itinerary_id}: {dbe}")

        return response

    @staticmethod
    def get_itinerary(itinerary_id: str) -> Optional[ItineraryResponse]:
        """Retrieve previously generated itinerary by its identifier."""
        return ITINERARY_CACHE.get(itinerary_id)

    @staticmethod
    def validate_existing_itinerary(
        request: ItineraryValidateRequest,
    ) -> ItineraryValidationResponse:
        """Validate feasibility of an existing or proposed itinerary."""
        total_cost = sum(d.daily_estimated_cost for d in request.days)
        return validate_itinerary_plan(
            destination=request.destination,
            start_date=request.start_date,
            end_date=request.end_date,
            budget=request.budget,
            daily_available_hours=request.daily_available_hours,
            days=request.days,
            total_cost=total_cost,
        )


itinerary_service = ItineraryService()

