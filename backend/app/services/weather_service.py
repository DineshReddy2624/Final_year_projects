from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple
import httpx
from fastapi import HTTPException, status

try:
    from app.core.config import settings
    from app.core.logger import logger
    from app.schemas.external import CurrentWeather, DailyForecast, WeatherForecastResponse
    from app.utils.cache import api_cache, execute_with_retry
except ImportError:
    from backend.app.core.config import settings
    from backend.app.core.logger import logger
    from backend.app.schemas.external import CurrentWeather, DailyForecast, WeatherForecastResponse
    from backend.app.utils.cache import api_cache, execute_with_retry


class WeatherService:
    """Service wrapping Open-Meteo REST API for weather forecasts, temperatures, and conditions."""

    BASE_URL = "https://api.open-meteo.com/v1/forecast"

    # WMO Weather interpretation code descriptions
    WMO_CONDITIONS: Dict[int, str] = {
        0: "Clear sky",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        48: "Depositing rime fog",
        51: "Light drizzle",
        53: "Moderate drizzle",
        55: "Dense drizzle",
        56: "Light freezing drizzle",
        57: "Dense freezing drizzle",
        61: "Slight rain",
        63: "Moderate rain",
        65: "Heavy rain",
        66: "Light freezing rain",
        67: "Heavy freezing rain",
        71: "Slight snow fall",
        73: "Moderate snow fall",
        75: "Heavy snow fall",
        77: "Snow grains",
        80: "Slight rain showers",
        81: "Moderate rain showers",
        82: "Violent rain showers",
        85: "Slight snow showers",
        86: "Heavy snow showers",
        95: "Thunderstorm",
        96: "Thunderstorm with slight hail",
        99: "Thunderstorm with heavy hail",
    }

    def __init__(self):
        self.timeout = settings.EXTERNAL_API_TIMEOUT_SECONDS

    def get_condition_text(self, code: int) -> str:
        """Convert a WMO weather code to a human-readable condition string."""
        return self.WMO_CONDITIONS.get(code, f"Weather code {code}")

    def validate_coordinates(self, latitude: float, longitude: float) -> None:
        """Validate geographic coordinate ranges."""
        if not (-90.0 <= latitude <= 90.0):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid latitude: {latitude}. Must be between -90 and 90.",
            )
        if not (-180.0 <= longitude <= 180.0):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid longitude: {longitude}. Must be between -180 and 180.",
            )

    def _generate_simulated_weather(
        self,
        latitude: float,
        longitude: float,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> Dict[str, Any]:
        """Generate realistic simulated weather data when Open-Meteo is temporarily unreachable."""
        from datetime import date, timedelta
        base_date = start_date or date.today()
        num_days = 7
        if start_date and end_date:
            num_days = max(1, min((end_date - start_date).days + 1, 16))

        times = [(base_date + timedelta(days=i)).isoformat() for i in range(num_days)]
        codes = [0, 1, 2, 3, 1, 0, 2][:num_days]
        while len(codes) < num_days:
            codes.append(1)

        return {
            "latitude": latitude,
            "longitude": longitude,
            "timezone": "UTC",
            "current": {
                "temperature_2m": 22.0,
                "relative_humidity_2m": 60.0,
                "wind_speed_10m": 12.0,
                "weather_code": 1,
            },
            "daily": {
                "time": times,
                "weather_code": codes,
                "temperature_2m_max": [25.0] * num_days,
                "temperature_2m_min": [16.0] * num_days,
                "precipitation_sum": [0.0] * num_days,
                "wind_speed_10m_max": [14.0] * num_days,
            },
        }

    async def get_forecast(
        self,
        latitude: float,
        longitude: float,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> WeatherForecastResponse:
        """Retrieve daily forecasts and current conditions for given coordinates."""
        self.validate_coordinates(latitude, longitude)

        # Ensure date objects
        if isinstance(start_date, str):
            try:
                start_date = date.fromisoformat(start_date)
            except Exception:
                start_date = None
        if isinstance(end_date, str):
            try:
                end_date = date.fromisoformat(end_date)
            except Exception:
                end_date = None

        # Date validation and warning check
        today = date.today()
        warning_msg: Optional[str] = None

        if start_date and end_date and start_date > end_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="start_date cannot be later than end_date",
            )

        if start_date and (start_date - today).days > 16:
            warning_msg = (
                f"Requested start_date ({start_date}) is beyond the 16-day Open-Meteo forecast horizon. "
                "Returning standard available 7-day outlook."
            )

        date_str_key = f"{start_date.isoformat() if start_date else 'none'}_{end_date.isoformat() if end_date else 'none'}"
        cache_key = f"openmeteo:forecast:{latitude:.3f}:{longitude:.3f}:{date_str_key}"
        cached = api_cache.get(cache_key)
        if cached is not None:
            logger.info(f"[CACHE HIT] Weather forecast for ({latitude}, {longitude})")
            cached_copy = cached.model_copy()
            cached_copy.source = "cached"
            return cached_copy

        params: Dict[str, Any] = {
            "latitude": latitude,
            "longitude": longitude,
            "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
            "timezone": "auto",
        }

        # If specific dates are requested within horizon
        if start_date and end_date and not warning_msg:
            params["start_date"] = start_date.isoformat()
            params["end_date"] = end_date.isoformat()

        async def _call():
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.get(self.BASE_URL, params=params)
                if res.status_code == 400:
                    err_json = res.json()
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=err_json.get("reason", "Open-Meteo rejected the request parameters"),
                    )
                res.raise_for_status()
                return res.json()

        try:
            data = await execute_with_retry(_call, operation_name=f"Open-Meteo weather at ({latitude}, {longitude})")
            source_tag = "live"
        except HTTPException as he:
            raise he
        except Exception as e:
            logger.warning(
                f"Open-Meteo API unavailable ({e}). Generating fallback simulated forecast with explicit provenance."
            )
            data = self._generate_simulated_weather(latitude, longitude, start_date, end_date)
            source_tag = "mocked"
            warning_msg = (
                f"Live Open-Meteo API was temporarily unavailable ({type(e).__name__}). "
                "Simulated seasonal baseline forecast provided."
            )

        # Parse current conditions
        current_data = data.get("current", {})
        current_weather = None
        if current_data:
            code = int(current_data.get("weather_code", 0))
            current_weather = CurrentWeather(
                temperature_celsius=float(current_data.get("temperature_2m", 0.0)),
                humidity_percent=current_data.get("relative_humidity_2m"),
                wind_speed_kmh=float(current_data.get("wind_speed_10m", 0.0)),
                weather_code=code,
                condition=self.get_condition_text(code),
            )

        # Parse daily forecasts
        daily_data = data.get("daily", {})
        times = daily_data.get("time", [])
        codes = daily_data.get("weather_code", [])
        max_temps = daily_data.get("temperature_2m_max", [])
        min_temps = daily_data.get("temperature_2m_min", [])
        precips = daily_data.get("precipitation_sum", [])
        winds = daily_data.get("wind_speed_10m_max", [])

        daily_list: List[DailyForecast] = []
        for i in range(len(times)):
            c = int(codes[i]) if i < len(codes) else 0
            daily_list.append(
                DailyForecast(
                    date=times[i],
                    weather_code=c,
                    condition=self.get_condition_text(c),
                    max_temp_celsius=float(max_temps[i]) if i < len(max_temps) else 0.0,
                    min_temp_celsius=float(min_temps[i]) if i < len(min_temps) else 0.0,
                    precipitation_mm=float(precips[i]) if i < len(precips) else 0.0,
                    max_wind_speed_kmh=float(winds[i]) if i < len(winds) else 0.0,
                )
            )

        forecast_response = WeatherForecastResponse(
            latitude=float(data.get("latitude", latitude)),
            longitude=float(data.get("longitude", longitude)),
            timezone=str(data.get("timezone", "UTC")),
            source=source_tag,
            current=current_weather,
            daily=daily_list,
            warning=warning_msg,
        )

        api_cache.set(cache_key, forecast_response, ttl=settings.CACHE_DEFAULT_TTL_SECONDS)
        return forecast_response


weather_service = WeatherService()
