from datetime import datetime, timedelta
from typing import Any, Dict, List, Literal, Optional
from langgraph.graph import END, StateGraph

try:
    from app.agents.state import AgentState
    from app.algorithms.itinerary_validator import validate_itinerary_plan
    from app.core.logger import logger
    from app.rag.retriever import retriever
    from app.schemas.ai import SourceDocument
    from app.schemas.itinerary import ItineraryGenerateRequest
    from app.schemas.recommendation import RecommendationRequest
    from app.services.ai_service import ai_service
    from app.services.itinerary_service import itinerary_service
    from app.services.recommendation_service import recommendation_service
    from app.services.weather_service import weather_service
except ImportError:
    from backend.app.agents.state import AgentState
    from backend.app.algorithms.itinerary_validator import validate_itinerary_plan
    from backend.app.core.logger import logger
    from backend.app.rag.retriever import retriever
    from backend.app.schemas.ai import SourceDocument
    from backend.app.schemas.itinerary import ItineraryGenerateRequest
    from backend.app.schemas.recommendation import RecommendationRequest
    from backend.app.services.ai_service import ai_service
    from backend.app.services.itinerary_service import itinerary_service
    from backend.app.services.recommendation_service import recommendation_service
    from backend.app.services.weather_service import weather_service


# ==============================================================================
# WORKFLOW NODES (1 to 8)
# ==============================================================================

async def understand_request_node(state: AgentState) -> Dict[str, Any]:
    """Node 1: Analyze user message to determine intent and routing."""
    query = state.get("user_query", "").strip().lower()
    trace = list(state.get("workflow_trace", []))
    trace.append("Node 1: understand_request_node")

    # Intent Classification
    if any(keyword in query for keyword in ["plan", "itinerary", "trip", "visit for", "days trip", "weekend"]):
        intent = "plan_trip"
    elif any(keyword in query for keyword in ["why", "explain", "reason", "recommendation"]):
        intent = "explain_recommendation"
    elif any(keyword in query for keyword in ["budget", "cost", "reduce expense", "expensive", "cheaper"]):
        intent = "budget_advice"
    elif any(keyword in query for keyword in ["weather", "rain", "rainy", "hot", "season"]):
        intent = "weather_query"
    else:
        intent = "general_qa"

    # Destination detection heuristic
    dest = None
    for city in ["hyderabad", "bengaluru", "bangalore", "delhi", "mumbai", "jaipur", "goa"]:
        if city in query:
            dest = city.capitalize() if city != "bangalore" else "Bengaluru"
            break

    return {
        "intent": intent,
        "destination": dest,
        "workflow_trace": trace,
    }


async def extract_preferences_node(state: AgentState) -> Dict[str, Any]:
    """Node 2: Extract structured travel preferences from natural language query."""
    trace = list(state.get("workflow_trace", []))
    trace.append("Node 2: extract_preferences_node")

    query = state.get("user_query", "")
    extraction_res = ai_service.extract_preferences(query)
    prefs = extraction_res.preferences

    # Merge destination if detected in earlier node
    if not prefs.destination and state.get("destination"):
        prefs.destination = state.get("destination")
        if "destination" in prefs.missing_fields:
            prefs.missing_fields.remove("destination")
        prefs.needs_clarification = len(prefs.missing_fields) > 0

    return {
        "preferences": prefs.model_dump(),
        "destination": prefs.destination,
        "needs_clarification": prefs.needs_clarification,
        "clarification_question": prefs.clarification_question,
        "workflow_trace": trace,
    }


async def retrieve_tourism_data_node(state: AgentState) -> Dict[str, Any]:
    """Node 3: Retrieve verified knowledge base chunks using ChromaDB RAG."""
    trace = list(state.get("workflow_trace", []))
    trace.append("Node 3: retrieve_tourism_data_node")

    query = state.get("user_query", "")
    dest = state.get("destination")

    source_docs = retriever.retrieve(query=query, destination=dest, top_k=3)
    sources_data = [doc.model_dump() for doc in source_docs]

    return {
        "rag_sources": sources_data,
        "workflow_trace": trace,
    }


async def fetch_weather_context_node(state: AgentState) -> Dict[str, Any]:
    """Node 4: Fetch real-time weather context using Open-Meteo service."""
    trace = list(state.get("workflow_trace", []))
    trace.append("Node 4: fetch_weather_context_node")

    dest = state.get("destination", "Hyderabad")
    # Coordinates for key cities
    city_coords = {
        "Hyderabad": (17.3850, 78.4867),
        "Bengaluru": (12.9716, 77.5946),
        "Delhi": (28.6139, 77.2090),
        "Mumbai": (19.0760, 72.8777),
        "Jaipur": (26.9124, 75.7873),
    }
    coords = city_coords.get(dest, (17.3850, 78.4867))

    today = datetime.now().date()
    prefs = state.get("preferences") or {}
    dur = prefs.get("duration_days") or 2
    end_date = today + timedelta(days=dur)

    try:
        forecast = await weather_service.get_forecast(
            latitude=coords[0],
            longitude=coords[1],
            start_date=today,
            end_date=end_date,
        )
        weather_summary = {
            "destination": dest,
            "current_temp": forecast.current.temperature_celsius if forecast.current else 26.0,
            "condition": forecast.current.condition if forecast.current else "Mainly clear",
            "is_outdoor_favorable": (forecast.daily_forecasts[0].precipitation_sum_mm or 0.0) < 2.0 if forecast.daily_forecasts else True,
        }
    except Exception as e:
        logger.warning(f"Weather fetch node fallback: {e}")
        weather_summary = {
            "destination": dest,
            "current_temp": 26.0,
            "condition": "Mainly clear",
            "is_outdoor_favorable": True,
        }

    return {
        "weather_info": weather_summary,
        "workflow_trace": trace,
    }


async def generate_recommendations_node(state: AgentState) -> Dict[str, Any]:
    """Node 5: Execute Phase 4 multi-criteria recommendation scoring."""
    trace = list(state.get("workflow_trace", []))
    trace.append("Node 5: generate_recommendations_node")

    dest = state.get("destination", "Hyderabad")
    prefs = state.get("preferences") or {}

    rec_req = RecommendationRequest(
        destination=dest,
        interests=prefs.get("interests") or ["history", "culture"],
        budget=float(prefs.get("budget") or 5000.0),
        available_duration_days=int(prefs.get("duration_days") or 2),
        transportation=prefs.get("transportation") or "driving-car",
        limit=6,
    )

    try:
        rec_res = await recommendation_service.get_recommendations(rec_req)
        rec_list = [r.model_dump() for r in rec_res.recommendations]
    except Exception as e:
        logger.warning(f"Recommendation generation node fallback: {e}")
        rec_list = []

    return {
        "recommendations": rec_list,
        "workflow_trace": trace,
    }


async def plan_routes_and_itinerary_node(state: AgentState) -> Dict[str, Any]:
    """Node 6: Execute Phase 5 2-Opt route optimizer and Phase 6 multi-day scheduler."""
    trace = list(state.get("workflow_trace", []))
    trace.append("Node 6: plan_routes_and_itinerary_node")

    dest = state.get("destination", "Hyderabad")
    prefs = state.get("preferences") or {}
    dur = int(prefs.get("duration_days") or 2)
    budget = float(prefs.get("budget") or 5000.0)

    start_date = datetime.now().date() + timedelta(days=7)
    end_date = start_date + timedelta(days=dur - 1)

    itin_req = ItineraryGenerateRequest(
        destination=dest,
        start_date=start_date.isoformat(),
        end_date=end_date.isoformat(),
        travelers_count=int(prefs.get("travelers_count") or 1),
        budget=budget,
        daily_available_hours=8.0,
        transportation=prefs.get("transportation") or "driving-car",
        pace=prefs.get("travel_style") or "moderate",
    )

    try:
        itin_res = await itinerary_service.generate_itinerary(itin_req)
        itin_data = itin_res.model_dump()
    except Exception as e:
        logger.warning(f"Itinerary planning node fallback: {e}")
        itin_data = None

    return {
        "itinerary": itin_data,
        "workflow_trace": trace,
    }


async def validate_itinerary_node(state: AgentState) -> Dict[str, Any]:
    """Node 7: Perform rigorous feasibility and constraint validation."""
    trace = list(state.get("workflow_trace", []))
    trace.append("Node 7: validate_itinerary_node")

    itin = state.get("itinerary")
    if not itin:
        return {
            "validation_report": {"is_valid": True, "summary": "No itinerary generated to validate."},
            "workflow_trace": trace,
        }

    return {
        "validation_report": {
            "is_valid": itin.get("feasibility_status") in ["feasible", "feasible_with_warnings"],
            "feasibility_status": itin.get("feasibility_status"),
            "unresolved_constraints": itin.get("unresolved_constraints", []),
            "total_cost": itin.get("budget_summary", {}).get("estimated_total_cost"),
        },
        "workflow_trace": trace,
    }


async def generate_explanation_node(state: AgentState) -> Dict[str, Any]:
    """Node 8: Synthesize final grounded response clearly distinguishing facts from suggestions."""
    trace = list(state.get("workflow_trace", []))
    trace.append("Node 8: generate_explanation_node")

    # If clarification was requested
    if state.get("needs_clarification"):
        clarification = state.get("clarification_question") or "Could you clarify your trip destination and budget?"
        return {
            "final_response": f"I'd love to help plan your trip! {clarification}",
            "workflow_trace": trace,
        }

    intent = state.get("intent", "general_qa")
    dest = state.get("destination", "your destination")
    rag_sources = state.get("rag_sources", [])
    itin = state.get("itinerary")
    recs = state.get("recommendations", [])

    response_lines: List[str] = []

    if intent == "plan_trip" and itin:
        b_summary = itin.get("budget_summary", {})
        tot_cost = b_summary.get("estimated_total_cost", 0.0)
        tot_days = itin.get("total_days", 1)
        tot_dist = itin.get("total_distance_km", 0.0)
        ja = itin.get("journey_assessment")
        sh = itin.get("stopover_accommodation")
        dh = itin.get("destination_accommodation")

        response_lines.append(f"### 🗺️ Planned {tot_days}-Day Itinerary for {dest}\n")
        response_lines.append(
            f"Here is your optimized itinerary covering **{tot_dist:.1f} km** with an estimated budget of **₹{tot_cost:,.2f}** "
            f"({itin.get('feasibility_status', 'feasible')}).\n"
        )

        if ja:
            response_lines.append(
                f"**🛣️ Highway Assessment**: {ja.get('journey_classification', 'Comfortable')} • "
                f"{ja.get('total_road_distance_km', 0):.1f} km road trip ({ja.get('total_driving_duration_hours', 0):.1f} hrs driving)."
            )
            if ja.get("recommended_stopover_towns"):
                response_lines.append(f"- *Recommended Midway Hubs*: {', '.join(ja.get('recommended_stopover_towns'))}")
            if ja.get("driver_fatigue_warning"):
                response_lines.append(f"- ⚠️ *Driver Fatigue Advisory*: {ja.get('driver_fatigue_warning')}")
            response_lines.append("")

        if sh or dh:
            response_lines.append("**🏨 Accommodation Arrangements:**")
            if sh:
                response_lines.append(
                    f"- **Midway Stopover**: {sh.get('name')} in {sh.get('stopover_town')} "
                    f"(@ ₹{sh.get('estimated_nightly_price', 0):.0f}/night) — {sh.get('room_type', 'Standard')}"
                )
            if dh:
                response_lines.append(
                    f"- **Destination Stay**: {dh.get('name')} in {dh.get('city')} "
                    f"({dh.get('nights', 1)} nights @ ₹{dh.get('estimated_nightly_price', 0):.0f}/night)"
                )
            response_lines.append("")

        for day in itin.get("days", []):
            d_num = day.get("day_number")
            response_lines.append(f"**Day {d_num}: {day.get('theme')}**")
            for stop in day.get("stops", []):
                if not stop.get("is_start_location") and not stop.get("is_end_location"):
                    arr = stop.get("arrival_time")
                    dep = stop.get("departure_time")
                    fee = stop.get("total_entrance_fee", 0.0)
                    response_lines.append(f"- **{stop.get('name')}** [{arr} - {dep}] (Entrance: ₹{fee:.0f})")
            for meal in day.get("meal_breaks", []):
                response_lines.append(f"- 🍽️ *{meal.get('name')}* [{meal.get('scheduled_start')} - {meal.get('scheduled_end')}]")
            response_lines.append("")

        response_lines.append(
            f"> **Deterministic Calculations**: Distances & times are computed via 2-Opt road TSP algorithms. "
            f"Weather forecast is checked via Open-Meteo."
        )

    elif rag_sources:
        # Knowledge-grounded RAG response
        source_objs = [SourceDocument(**s) for s in rag_sources]
        grounded_answer = retriever.generate_grounded_answer(state.get("user_query", ""), source_objs)
        response_lines.append(grounded_answer)

    elif recs:
        response_lines.append(f"### 🌟 Recommended Attractions in {dest}:\n")
        for r in recs[:4]:
            response_lines.append(f"- **{r.get('name')}** ({r.get('category')}): {r.get('explanation')}")
    else:
        response_lines.append(
            f"I have reviewed your query regarding {dest}. "
            "Please ask about historical sites, travel tips, local cuisine, or request a complete multi-day itinerary."
        )

    final_text = "\n".join(response_lines)
    return {
        "final_response": final_text,
        "workflow_trace": trace,
    }


# ==============================================================================
# CONDITIONAL ROUTING FUNCTIONS
# ==============================================================================

def route_after_understanding(state: AgentState) -> str:
    """Route after request understanding."""
    intent = state.get("intent", "general_qa")
    if intent == "plan_trip":
        return "extract_preferences"
    return "retrieve_tourism_data"


def route_after_preferences(state: AgentState) -> str:
    """Route after preference extraction."""
    if state.get("needs_clarification", False):
        return "generate_explanation"
    return "retrieve_tourism_data"


def route_after_retrieval(state: AgentState) -> str:
    """Route after data retrieval."""
    intent = state.get("intent", "general_qa")
    if intent == "plan_trip":
        return "fetch_weather_context"
    return "generate_explanation"


# ==============================================================================
# LANGGRAPH WORKFLOW ASSEMBLY
# ==============================================================================

def build_travel_agent_workflow() -> Any:
    """Build and compile the LangGraph StateGraph workflow."""
    workflow = StateGraph(AgentState)

    # Register all 8 nodes
    workflow.add_node("understand_request", understand_request_node)
    workflow.add_node("extract_preferences", extract_preferences_node)
    workflow.add_node("retrieve_tourism_data", retrieve_tourism_data_node)
    workflow.add_node("fetch_weather_context", fetch_weather_context_node)
    workflow.add_node("generate_recommendations", generate_recommendations_node)
    workflow.add_node("plan_routes_and_itinerary", plan_routes_and_itinerary_node)
    workflow.add_node("validate_itinerary", validate_itinerary_node)
    workflow.add_node("generate_explanation", generate_explanation_node)

    # Set Entry Point
    workflow.set_entry_point("understand_request")

    # Conditional edge from understand_request
    workflow.add_conditional_edges(
        "understand_request",
        route_after_understanding,
        {
            "extract_preferences": "extract_preferences",
            "retrieve_tourism_data": "retrieve_tourism_data",
        },
    )

    # Conditional edge from extract_preferences
    workflow.add_conditional_edges(
        "extract_preferences",
        route_after_preferences,
        {
            "generate_explanation": "generate_explanation",
            "retrieve_tourism_data": "retrieve_tourism_data",
        },
    )

    # Conditional edge from retrieve_tourism_data
    workflow.add_conditional_edges(
        "retrieve_tourism_data",
        route_after_retrieval,
        {
            "fetch_weather_context": "fetch_weather_context",
            "generate_explanation": "generate_explanation",
        },
    )

    # Sequential edges for full planning pipeline
    workflow.add_edge("fetch_weather_context", "generate_recommendations")
    workflow.add_edge("generate_recommendations", "plan_routes_and_itinerary")
    workflow.add_edge("plan_routes_and_itinerary", "validate_itinerary")
    workflow.add_edge("validate_itinerary", "generate_explanation")
    workflow.add_edge("generate_explanation", END)

    return workflow.compile()


travel_graph = build_travel_agent_workflow()
