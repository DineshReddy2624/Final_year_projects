import math
from typing import Any, Dict, List, Optional, Tuple

try:
    from app.schemas.hotel import AccommodationSummary, HotelItem
    from app.schemas.itinerary import (
        BudgetCalculationResult,
        ExpenseCategoryBreakdown,
        PriceCategoryBreakdown,
        VehicleTravelMetrics,
    )
except ImportError:
    from backend.app.schemas.hotel import AccommodationSummary, HotelItem
    from backend.app.schemas.itinerary import (
        BudgetCalculationResult,
        ExpenseCategoryBreakdown,
        PriceCategoryBreakdown,
        VehicleTravelMetrics,
    )

# Mode transport cost parameters (per km in INR)
TRANSPORT_RATES = {
    "driving-car": 18.0,      # Fuel, cab, or private car service per km
    "cycling-regular": 2.0,   # Bicycle rental amortized per km
    "foot-walking": 0.0,      # Free pedestrian transit
}

# Daily meal cost per person by tier (in INR)
MEAL_TIER_RATES = {
    "budget": 500.0,
    "moderate": 1000.0,
    "luxury": 2500.0,
}

# Nightly accommodation room rates (in INR)
ACCOMMODATION_RATES = {
    "budget": 1800.0,
    "standard": 3500.0,
    "luxury": 7500.0,
}

# Conservative placeholder entrance fee per person when price is unknown
DEFAULT_ESTIMATED_ENTRANCE_FEE = 150.0
CONTINGENCY_PERCENTAGE = 0.08  # 8% emergency / miscellaneous buffer


def calculate_itinerary_budget(
    total_budget: float,
    travelers_count: int,
    total_days: int,
    total_distance_km: float,
    transportation: str,
    stops_data: List[Dict[str, Any]],
    include_accommodation: bool = False,
    accommodation_type: str = "standard",
    dietary_budget_tier: str = "moderate",
    fuel_type: str = "petrol",
    mileage_kmpl: float = 14.0,
    fuel_price_per_litre: float = 105.0,
    source_name: Optional[str] = None,
    is_round_trip: bool = True,
    stopover_hotel: Optional[HotelItem] = None,
    destination_hotel: Optional[HotelItem] = None,
    accommodation_summary: Optional[AccommodationSummary] = None,
    rooms_needed: Optional[int] = None,
) -> BudgetCalculationResult:
    """Calculate comprehensive multi-category itinerary budget with explicit provenance separation.

    Separates prices into:
    - Verified: Confirmed by official place data.
    - User-provided: Explicitly set by the traveler.
    - Estimated: Standard rates (transport per km or car petrol telemetry, meals, accommodation).
    - Unknown: Missing entrance fees estimated conservatively (never assumed to be zero).
    """
    travelers_count = max(1, travelers_count)
    total_days = max(1, total_days)

    verified_cost = 0.0
    user_provided_cost = 0.0
    estimated_cost = 0.0
    unknown_cost = 0.0
    unknown_prices_count = 0

    total_entrance_fees = 0.0
    notes: List[str] = []

    # 1. Attraction Entrance Fees Calculation
    for stop in stops_data:
        # Ignore starting/ending hotel checkpoints
        if stop.get("is_start_location") or stop.get("is_end_location"):
            continue

        fee_val = stop.get("entrance_fee")
        is_verified = bool(stop.get("is_fee_verified", False))
        is_user_provided = bool(stop.get("is_user_provided", False))

        if fee_val is not None:
            fee_per_person = float(fee_val)
            fee_total_stop = fee_per_person * travelers_count
            total_entrance_fees += fee_total_stop

            if is_verified:
                verified_cost += fee_total_stop
            elif is_user_provided:
                user_provided_cost += fee_total_stop
            else:
                estimated_cost += fee_total_stop
        else:
            # Crucial: Do not assume missing prices are zero!
            fee_per_person = DEFAULT_ESTIMATED_ENTRANCE_FEE
            fee_total_stop = fee_per_person * travelers_count
            total_entrance_fees += fee_total_stop
            unknown_cost += fee_total_stop
            unknown_prices_count += 1

            stop_name = stop.get("name", "Unknown Attraction")
            notes.append(
                f"Entrance fee for '{stop_name}' is unverified; applied conservative placeholder of ₹{fee_per_person:.0f}/person."
            )

    # 2. Transportation & Vehicle Telemetry Expenses Calculation
    vehicle_metrics: Optional[VehicleTravelMetrics] = None

    if transportation == "driving-car":
        kmpl = max(5.0, float(mileage_kmpl or 14.0))
        fuel_rate = max(10.0, float(fuel_price_per_litre or 105.0))
        req_litres = round(max(0.2, total_distance_km / kmpl), 2)
        fuel_cost = round(req_litres * fuel_rate, 2)

        attraction_stops_count = sum(
            1 for s in stops_data if not s.get("is_start_location") and not s.get("is_end_location")
        )
        parking_and_tolls = round((total_days * 150.0) + (attraction_stops_count * 50.0), 2)
        transport_total = round(fuel_cost + parking_and_tolls, 2)
        estimated_cost += transport_total

        vehicle_metrics = VehicleTravelMetrics(
            transportation=transportation,
            fuel_type=fuel_type,
            total_distance_km=round(total_distance_km, 2),
            mileage_kmpl=kmpl,
            fuel_price_per_litre=fuel_rate,
            estimated_fuel_litres=req_litres,
            estimated_fuel_cost=fuel_cost,
            parking_and_tolls_estimate=parking_and_tolls,
            total_transit_cost=transport_total,
            is_round_trip=is_round_trip,
            source_name=source_name,
            notes=[
                f"Total route distance: {total_distance_km:.2f} km.",
                f"Fuel efficiency: {kmpl:.1f} km/L ({fuel_type.capitalize()}).",
                f"Fuel needed: ~{req_litres:.2f} Litres @ ₹{fuel_rate:.2f}/L = ₹{fuel_cost:.2f}.",
                f"Parking & Toll buffer: ₹{parking_and_tolls:.2f} across {total_days} day(s).",
            ],
        )
        notes.append(
            f"Car Telemetry: {total_distance_km:.1f} km road trip requires ~{req_litres:.1f}L {fuel_type} "
            f"(₹{fuel_cost:.2f} @ ₹{fuel_rate:.0f}/L) plus ₹{parking_and_tolls:.2f} parking/tolls."
        )
    else:
        rate_per_km = TRANSPORT_RATES.get(transportation, TRANSPORT_RATES["driving-car"])
        transport_total = round(total_distance_km * rate_per_km, 2)
        estimated_cost += transport_total

    # 3. Food & Dining Expenses Calculation
    daily_meal_rate = MEAL_TIER_RATES.get(dietary_budget_tier, MEAL_TIER_RATES["moderate"])
    food_total = round(daily_meal_rate * travelers_count * total_days, 2)
    estimated_cost += food_total

    # 4. Accommodation Expenses Calculation (Stopovers + Destination Hotels)
    accommodation_total = 0.0
    stopover_cost = 0.0
    destination_cost = 0.0

    if stopover_hotel or destination_hotel:
        if stopover_hotel:
            stopover_cost = round(float(stopover_hotel.total_stay_cost), 2)
            if stopover_hotel.price_status == "verified":
                verified_cost += stopover_cost
            else:
                estimated_cost += stopover_cost
            notes.append(
                f"Stopover Hotel ({stopover_hotel.stopover_town or 'En route'}): '{stopover_hotel.name}' "
                f"({stopover_hotel.nights} night @ ₹{stopover_hotel.estimated_nightly_price:.0f}/night × {stopover_hotel.rooms_needed} room(s)) = ₹{stopover_cost:.2f}."
            )

        if destination_hotel:
            destination_cost = round(float(destination_hotel.total_stay_cost), 2)
            if destination_hotel.price_status == "verified":
                verified_cost += destination_cost
            else:
                estimated_cost += destination_cost
            notes.append(
                f"Destination Hotel ({destination_hotel.city}): '{destination_hotel.name}' "
                f"({destination_hotel.nights} night(s) @ ₹{destination_hotel.estimated_nightly_price:.0f}/night × {destination_hotel.rooms_needed} room(s)) = ₹{destination_cost:.2f}."
            )

        accommodation_total = round(stopover_cost + destination_cost, 2)
    elif include_accommodation and total_days > 1:
        nights = total_days - 1
        num_rooms = rooms_needed or math.ceil(travelers_count / 2.0)
        nightly_room_rate = ACCOMMODATION_RATES.get(accommodation_type, ACCOMMODATION_RATES.get("standard", 3500.0))
        accommodation_total = round(nights * num_rooms * nightly_room_rate, 2)
        destination_cost = accommodation_total
        estimated_cost += accommodation_total
        notes.append(
            f"Included {accommodation_type} accommodation: {nights} night(s) × {num_rooms} room(s) @ ₹{nightly_room_rate:.0f}/night."
        )

    # 5. Contingency Buffer Calculation
    base_subtotal = transport_total + total_entrance_fees + food_total + accommodation_total
    contingency_buffer = round(base_subtotal * CONTINGENCY_PERCENTAGE, 2)
    estimated_cost += contingency_buffer

    # Overall Totals
    estimated_total_cost = round(base_subtotal + contingency_buffer, 2)
    cost_per_traveler = round(estimated_total_cost / travelers_count, 2)
    remaining_budget = round(total_budget - estimated_total_cost, 2)
    budget_overrun = round(max(0.0, estimated_total_cost - total_budget), 2)
    is_budget_exceeded = estimated_total_cost > total_budget

    if is_budget_exceeded:
        notes.append(
            f"Budget exceeded by ₹{budget_overrun:.2f}. Total estimated cost (₹{estimated_total_cost:.2f}) "
            f"surpasses allocated budget of ₹{total_budget:.2f}."
        )

    by_provenance = PriceCategoryBreakdown(
        verified=round(verified_cost, 2),
        user_provided=round(user_provided_cost, 2),
        estimated=round(estimated_cost, 2),
        unknown=round(unknown_cost, 2),
    )

    by_category = ExpenseCategoryBreakdown(
        transportation=round(transport_total, 2),
        entrance_fees=round(total_entrance_fees, 2),
        food=round(food_total, 2),
        accommodation=round(accommodation_total, 2),
        stopover_accommodation=round(stopover_cost, 2),
        destination_accommodation=round(destination_cost, 2),
        contingency_buffer=round(contingency_buffer, 2),
    )

    return BudgetCalculationResult(
        total_budget=round(total_budget, 2),
        estimated_total_cost=estimated_total_cost,
        cost_per_traveler=cost_per_traveler,
        remaining_budget=remaining_budget,
        budget_overrun=budget_overrun,
        is_budget_exceeded=is_budget_exceeded,
        unknown_prices_count=unknown_prices_count,
        has_unknown_expenses=unknown_prices_count > 0,
        by_provenance=by_provenance,
        by_category=by_category,
        stopover_accommodation_cost=round(stopover_cost, 2),
        destination_accommodation_cost=round(destination_cost, 2),
        total_accommodation_cost=round(accommodation_total, 2),
        accommodation_summary=accommodation_summary,
        vehicle_metrics=vehicle_metrics,
        budget_notes=notes,
    )

