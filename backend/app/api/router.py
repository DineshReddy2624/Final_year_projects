from fastapi import APIRouter

try:
    from app.api.health import router as health_router
    from app.api.routes.ai import router as ai_router
    from app.api.routes.auth import router as auth_router
    from app.api.routes.destinations import router as destinations_router
    from app.api.routes.places import router as places_router
    from app.api.routes.recommendations import router as recommendations_router
    from app.api.routes.routes import router as routes_router
    from app.api.routes.clustering import router as clustering_router
    from app.api.routes.itinerary import router as itinerary_router
    from app.api.routes.reports import router as reports_router
    from app.api.routes.users import router as users_router
    from app.api.routes.weather import router as weather_router
    from app.api.routes.live_trip import router as live_trip_router
except ImportError:
    from backend.app.api.health import router as health_router
    from backend.app.api.routes.ai import router as ai_router
    from backend.app.api.routes.auth import router as auth_router
    from backend.app.api.routes.destinations import router as destinations_router
    from backend.app.api.routes.places import router as places_router
    from backend.app.api.routes.recommendations import router as recommendations_router
    from backend.app.api.routes.routes import router as routes_router
    from backend.app.api.routes.clustering import router as clustering_router
    from backend.app.api.routes.itinerary import router as itinerary_router
    from backend.app.api.routes.reports import router as reports_router
    from backend.app.api.routes.users import router as users_router
    from backend.app.api.routes.weather import router as weather_router
    from backend.app.api.routes.live_trip import router as live_trip_router

api_router = APIRouter()

# Health & System
api_router.include_router(health_router)

# Authentication & User Management
api_router.include_router(auth_router)
api_router.include_router(users_router)

# External Geospatial & Environmental Services
api_router.include_router(destinations_router)
api_router.include_router(places_router)
api_router.include_router(routes_router)
api_router.include_router(weather_router)

# Phase 4 — Context-Aware Recommendation Engine
api_router.include_router(recommendations_router)

# Phase 5 — Geographic Clustering & Route Optimization
api_router.include_router(clustering_router)

# Phase 6 — Itinerary Generation & Budget Management
api_router.include_router(itinerary_router)

# Real-Time On-Trip Execution & Dynamic Replanning
api_router.include_router(live_trip_router)

# Phase 7 — AI Travel Assistant & RAG
api_router.include_router(ai_router)

# Phase 9 — PDF Reports & Travel Analytics
api_router.include_router(reports_router)
