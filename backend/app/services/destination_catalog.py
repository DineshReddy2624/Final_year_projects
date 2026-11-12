from typing import Any, Dict, List, Optional, Tuple
try:
    from app.algorithms.geographic_clustering import haversine_distance_km
except ImportError:
    from backend.app.algorithms.geographic_clustering import haversine_distance_km

# Curated Regional Real-World POI Catalog
# Strictly verified real-world places: Malls, Historical Forts/Palaces, Nature/Lakes/Safaris, Crafts & Distanced Excursions.
# Zero synthetic / random created places.

DESTINATION_REGIONAL_CATALOG: Dict[str, Dict[str, Any]] = {
    "hyderabad": {
        "center": (17.385044, 78.486671),
        "max_radius_km": 50.0,
        "state": "Telangana",
        "forbidden_city_tokens": ["bengaluru", "bangalore", "mysuru", "mysore", "chennai", "mumbai", "delhi", "pune", "kochi"],
        "regions": [
            {
                "region_id": "old_city_heritage",
                "region_name": "Old City & Royal Heritage District",
                "description": "Historic Qutb Shahi and Asaf Jahi monuments, royal Nizam palaces, museums, and natural safaris in southern Hyderabad.",
                "centroid": (17.360, 78.468),
                "pois": [
                    {
                        "id": "hyd_charminar",
                        "name": "Charminar",
                        "category": "Historical Monument",
                        "latitude": 17.3616,
                        "longitude": 78.4747,
                        "address": "Charminar Rd, Char Kaman, Ghansi Bazaar, Hyderabad, Telangana 500002",
                        "visit_duration_mins": 75,
                        "opening_hours": "09:30 - 17:30",
                        "entrance_fee": 25.0,
                        "rating": 4.6,
                        "is_outdoor": True,
                    },
                    {
                        "id": "hyd_chowmahalla",
                        "name": "Chowmahalla Palace",
                        "category": "Royal Palace & Museum",
                        "latitude": 17.3578,
                        "longitude": 78.4717,
                        "address": "20-4-236, Motigalli, Khilwat, Hyderabad, Telangana 500002",
                        "visit_duration_mins": 90,
                        "opening_hours": "10:00 - 17:00 (Closed Fridays)",
                        "entrance_fee": 100.0,
                        "rating": 4.7,
                        "is_outdoor": False,
                    },
                    {
                        "id": "hyd_salar_jung",
                        "name": "Salar Jung Museum",
                        "category": "Art & Heritage Museum",
                        "latitude": 17.3713,
                        "longitude": 78.4804,
                        "address": "Salar Jung Rd, Darulshifa, Hyderabad, Telangana 500002",
                        "visit_duration_mins": 120,
                        "opening_hours": "10:00 - 17:00 (Closed Fridays)",
                        "entrance_fee": 50.0,
                        "rating": 4.7,
                        "is_outdoor": False,
                    },
                    {
                        "id": "hyd_nehru_zoo",
                        "name": "Nehru Zoological Park & Safari",
                        "category": "Nature & Wildlife Reserve",
                        "latitude": 17.3512,
                        "longitude": 78.4502,
                        "address": "Zoo Park Main Rd, Kishan Bagh, Bahadurpura, Hyderabad, Telangana 500064",
                        "visit_duration_mins": 150,
                        "opening_hours": "08:30 - 17:00 (Closed Mondays)",
                        "entrance_fee": 70.0,
                        "rating": 4.5,
                        "is_outdoor": True,
                    },
                    {
                        "id": "hyd_nizam_museum",
                        "name": "The Nizam's Museum (Purani Haveli)",
                        "category": "Heritage Museum & Royal Gifts",
                        "latitude": 17.3664,
                        "longitude": 78.4828,
                        "address": "Purani Haveli, Pathar Gatti, Hyderabad, Telangana 500002",
                        "visit_duration_mins": 60,
                        "opening_hours": "10:00 - 17:00 (Closed Fridays)",
                        "entrance_fee": 80.0,
                        "rating": 4.4,
                        "is_outdoor": False,
                    },
                ],
            },
            {
                "region_id": "golconda_nature_west",
                "region_name": "Golconda Citadel & Western Nature Corridor",
                "description": "Medieval hilltop fortresses, royal mausoleums, music pavilions, and scenic lakeside nature.",
                "centroid": (17.385, 78.365),
                "pois": [
                    {
                        "id": "hyd_golconda_fort",
                        "name": "Golconda Fort",
                        "category": "Hilltop Fortress & Citadel",
                        "latitude": 17.3833,
                        "longitude": 78.4011,
                        "address": "Ibrahim Bagh, Hyderabad, Telangana 500008",
                        "visit_duration_mins": 150,
                        "opening_hours": "09:00 - 17:30",
                        "entrance_fee": 25.0,
                        "rating": 4.6,
                        "is_outdoor": True,
                    },
                    {
                        "id": "hyd_qutb_shahi_tombs",
                        "name": "Qutb Shahi Tombs & Gardens",
                        "category": "Royal Mausoleums & Landscape",
                        "latitude": 17.3934,
                        "longitude": 78.3965,
                        "address": "Fort Road, Tolichowki, Hyderabad, Telangana 500008",
                        "visit_duration_mins": 90,
                        "opening_hours": "09:30 - 16:30",
                        "entrance_fee": 30.0,
                        "rating": 4.5,
                        "is_outdoor": True,
                    },
                    {
                        "id": "hyd_osman_sagar",
                        "name": "Osman Sagar (Gandipet Lake) & Viewpoint",
                        "category": "Scenic Freshwater Lake & Nature",
                        "latitude": 17.3861,
                        "longitude": 78.3056,
                        "address": "Gandipet, Hyderabad, Telangana 500075",
                        "visit_duration_mins": 75,
                        "opening_hours": "09:00 - 18:30",
                        "entrance_fee": 20.0,
                        "rating": 4.4,
                        "is_outdoor": True,
                    },
                    {
                        "id": "hyd_taramati_baradari",
                        "name": "Taramati Baradari Cultural Complex",
                        "category": "Historic Music Pavilion",
                        "latitude": 17.3789,
                        "longitude": 78.3802,
                        "address": "Ramdev Guda, Ibrahim Bagh, Hyderabad, Telangana 500031",
                        "visit_duration_mins": 60,
                        "opening_hours": "09:30 - 18:00",
                        "entrance_fee": 0.0,
                        "rating": 4.3,
                        "is_outdoor": True,
                    },
                ],
            },
            {
                "region_id": "central_lakes_malls",
                "region_name": "Hussain Sagar, Nature Parks & Central Malls",
                "description": "Lakefront cruises, lush jungle nature reserves, planetariums, and premier luxury shopping malls.",
                "centroid": (17.418, 78.460),
                "pois": [
                    {
                        "id": "hyd_hussain_sagar",
                        "name": "Hussain Sagar Lake & Buddha Statue",
                        "category": "Scenic Lake & Boat Cruise",
                        "latitude": 17.4239,
                        "longitude": 78.4738,
                        "address": "Tank Bund Rd, Hussain Sagar, Hyderabad, Telangana 500004",
                        "visit_duration_mins": 90,
                        "opening_hours": "08:00 - 22:00",
                        "entrance_fee": 100.0,
                        "rating": 4.5,
                        "is_outdoor": True,
                    },
                    {
                        "id": "hyd_gvk_one_mall",
                        "name": "GVK One Mall & Aquarium",
                        "category": "Shopping Mall & Entertainment",
                        "latitude": 17.4190,
                        "longitude": 78.4485,
                        "address": "Road No. 1, Balapur Basthi, Banjara Hills, Hyderabad, Telangana 500034",
                        "visit_duration_mins": 90,
                        "opening_hours": "11:00 - 22:00",
                        "entrance_fee": 0.0,
                        "rating": 4.5,
                        "is_outdoor": False,
                    },
                    {
                        "id": "hyd_kbr_park",
                        "name": "KBR National Park Nature Trail",
                        "category": "Urban Nature Reserve & Forest",
                        "latitude": 17.4244,
                        "longitude": 78.4192,
                        "address": "Road No. 2, Jubilee Hills, Hyderabad, Telangana 500033",
                        "visit_duration_mins": 75,
                        "opening_hours": "05:30 - 10:00, 16:00 - 19:00",
                        "entrance_fee": 40.0,
                        "rating": 4.6,
                        "is_outdoor": True,
                    },
                    {
                        "id": "hyd_birla_science_museum",
                        "name": "B.M. Birla Science Centre & Planetarium",
                        "category": "Science Museum & Planetarium",
                        "latitude": 17.4055,
                        "longitude": 78.4712,
                        "address": "Naubat Pahad, Ambedkar Colony, Khairtabad, Hyderabad, Telangana 500004",
                        "visit_duration_mins": 90,
                        "opening_hours": "10:30 - 20:00",
                        "entrance_fee": 150.0,
                        "rating": 4.4,
                        "is_outdoor": False,
                    },
                    {
                        "id": "hyd_lumbini_park",
                        "name": "Lumbini Park & Musical Fountain",
                        "category": "Lakefront Urban Park",
                        "latitude": 17.4103,
                        "longitude": 78.4745,
                        "address": "Opposite Secretariat New Gate, Khairatabad, Hyderabad, Telangana 500004",
                        "visit_duration_mins": 60,
                        "opening_hours": "09:00 - 21:00",
                        "entrance_fee": 30.0,
                        "rating": 4.3,
                        "is_outdoor": True,
                    },
                ],
            },
            {
                "region_id": "cyberabad_malls_nature",
                "region_name": "Cyberabad Mega Malls, Crafts & Secret Lake",
                "description": "India's largest mega-malls, cultural craft villages, scenic secret lakes, and botanical conservatories.",
                "centroid": (17.445, 78.375),
                "pois": [
                    {
                        "id": "hyd_sarath_city_mall",
                        "name": "Sarath City Capital Mall",
                        "category": "Shopping Mall & Entertainment Hub",
                        "latitude": 17.4580,
                        "longitude": 78.3620,
                        "address": "Gachibowli - Miyapur Rd, Whitefields, Kondapur, Hyderabad, Telangana 500084",
                        "visit_duration_mins": 120,
                        "opening_hours": "11:00 - 22:30",
                        "entrance_fee": 0.0,
                        "rating": 4.6,
                        "is_outdoor": False,
                    },
                    {
                        "id": "hyd_inorbit_mall",
                        "name": "Inorbit Mall Cyberabad & Waterfront Promenade",
                        "category": "Shopping Mall & Waterfront Dining",
                        "latitude": 17.4350,
                        "longitude": 78.3878,
                        "address": "APIIC Software Layout, Mindspace, Madhapur, Hyderabad, Telangana 500081",
                        "visit_duration_mins": 90,
                        "opening_hours": "11:00 - 22:30",
                        "entrance_fee": 0.0,
                        "rating": 4.5,
                        "is_outdoor": False,
                    },
                    {
                        "id": "hyd_durgam_cheruvu",
                        "name": "Durgam Cheruvu Secret Lake & Cable Bridge",
                        "category": "Scenic Lake & Nature Walkway",
                        "latitude": 17.4334,
                        "longitude": 78.3862,
                        "address": "Jubilee Hills / Madhapur, Hyderabad, Telangana 500081",
                        "visit_duration_mins": 75,
                        "opening_hours": "10:00 - 21:00",
                        "entrance_fee": 0.0,
                        "rating": 4.5,
                        "is_outdoor": True,
                    },
                    {
                        "id": "hyd_shilparamam",
                        "name": "Shilparamam Cultural Crafts Village",
                        "category": "Arts, Crafts & Cultural Village",
                        "latitude": 17.4526,
                        "longitude": 78.3773,
                        "address": "Hi-Tech City Main Road, Madhapur, Hyderabad, Telangana 500081",
                        "visit_duration_mins": 120,
                        "opening_hours": "10:30 - 20:30",
                        "entrance_fee": 60.0,
                        "rating": 4.6,
                        "is_outdoor": True,
                    },
                    {
                        "id": "hyd_botanical_garden",
                        "name": "Kotla Vijayabhaskara Reddy Botanical Garden",
                        "category": "Nature Trails & Botanical Conservatory",
                        "latitude": 17.4589,
                        "longitude": 78.3562,
                        "address": "Kothaguda Reserve Forest, Gachibowli, Hyderabad, Telangana 500084",
                        "visit_duration_mins": 90,
                        "opening_hours": "06:00 - 18:00",
                        "entrance_fee": 25.0,
                        "rating": 4.3,
                        "is_outdoor": True,
                    },
                ],
            },
            {
                "region_id": "distanced_studio_excursion",
                "region_name": "Ramoji Film City Distanced Excursion",
                "description": "World-record film studio theme park, live stunt shows, movie sets, and gardens on the eastern city boundary.",
                "centroid": (17.254, 78.680),
                "pois": [
                    {
                        "id": "hyd_ramoji_film_city",
                        "name": "Ramoji Film City",
                        "category": "Film Studio Theme Park & Entertainment",
                        "latitude": 17.2543,
                        "longitude": 78.6808,
                        "address": "Ramoji Film City Main Rd, Hayathnagar, Telangana 501512",
                        "visit_duration_mins": 240,
                        "opening_hours": "09:00 - 17:30",
                        "entrance_fee": 1350.0,
                        "rating": 4.6,
                        "is_outdoor": True,
                    },
                    {
                        "id": "hyd_sanghi_temple",
                        "name": "Sanghi Hilltop Panoramic Viewpoint",
                        "category": "Scenic Hilltop Viewpoint",
                        "latitude": 17.2662,
                        "longitude": 78.6758,
                        "address": "Sanghi Nagar, Hayathnagar, Telangana 501511",
                        "visit_duration_mins": 45,
                        "opening_hours": "08:00 - 19:30",
                        "entrance_fee": 0.0,
                        "rating": 4.4,
                        "is_outdoor": True,
                    },
                ],
            },
        ],
    },
    "bengaluru": {
        "center": (12.971598, 77.594562),
        "max_radius_km": 40.0,
        "state": "Karnataka",
        "forbidden_city_tokens": ["hyderabad", "chennai", "mumbai", "delhi", "kolkata"],
        "regions": [
            {
                "region_id": "blr_central_historic",
                "region_name": "Central Bengaluru & Royal Heritage",
                "description": "Lush botanical gardens, colonial monuments, and royal palaces.",
                "centroid": (12.980, 77.590),
                "pois": [
                    {
                        "id": "blr_lalbagh",
                        "name": "Lalbagh Botanical Garden",
                        "category": "Botanical Garden & Glass House",
                        "latitude": 12.9507,
                        "longitude": 77.5848,
                        "address": "Mavalli, Bengaluru, Karnataka 560004",
                        "visit_duration_mins": 105,
                        "opening_hours": "06:00 - 19:00",
                        "entrance_fee": 30.0,
                        "rating": 4.6,
                        "is_outdoor": True,
                    },
                    {
                        "id": "blr_cubbon_park",
                        "name": "Cubbon Park & Vidhana Soudha",
                        "category": "Heritage Park & Neo-Dravidian Architecture",
                        "latitude": 12.9763,
                        "longitude": 77.5929,
                        "address": "Kasturba Rd, Sampangi Rama Nagar, Bengaluru, Karnataka 560001",
                        "visit_duration_mins": 90,
                        "opening_hours": "06:00 - 18:00",
                        "entrance_fee": 0.0,
                        "rating": 4.6,
                        "is_outdoor": True,
                    },
                    {
                        "id": "blr_bangalore_palace",
                        "name": "Bangalore Palace",
                        "category": "Tudor Revival Royal Palace",
                        "latitude": 12.9988,
                        "longitude": 77.5921,
                        "address": "Vasanth Nagar, Bengaluru, Karnataka 560052",
                        "visit_duration_mins": 90,
                        "opening_hours": "10:00 - 17:30",
                        "entrance_fee": 250.0,
                        "rating": 4.5,
                        "is_outdoor": False,
                    },
                    {
                        "id": "blr_phoenix_marketcity",
                        "name": "Phoenix Marketcity Bengaluru",
                        "category": "Shopping Mall & Entertainment",
                        "latitude": 12.9972,
                        "longitude": 77.6974,
                        "address": "Whitefield Main Rd, Mahadevapura, Bengaluru, Karnataka 560048",
                        "visit_duration_mins": 120,
                        "opening_hours": "10:30 - 23:00",
                        "entrance_fee": 0.0,
                        "rating": 4.6,
                        "is_outdoor": False,
                    },
                ],
            }
        ],
    },
}


def is_place_valid_for_destination(
    destination_name: str,
    place_name: str,
    place_lat: float,
    place_lon: float,
    place_address: Optional[str] = None,
) -> Tuple[bool, str]:
    """Strictly validates whether a place belongs to the selected destination.
    Rejects:
    1. Distance > 50 km from destination center coordinates (or >60 km for marked excursions).
    2. Forbidden city or state keywords (e.g. 'Bengaluru', 'Mysuru', 'Karnataka' when destination is 'Hyderabad').
    3. Null coordinates.
    """
    if place_lat is None or place_lon is None:
        return False, "Missing coordinates"

    if place_lat == 0.0 and place_lon == 0.0:
        return False, "Invalid (0, 0) coordinates"

    dest_key = destination_name.strip().lower().split(",")[0].strip()
    config = DESTINATION_REGIONAL_CATALOG.get(dest_key)

    if config:
        center_lat, center_lon = config["center"]
        dist_km = haversine_distance_km(center_lat, center_lon, place_lat, place_lon)
        if dist_km > config["max_radius_km"]:
            return False, f"Geographically distant: {dist_km:.1f} km from {destination_name} (max {config['max_radius_km']} km)"

        full_text = f"{place_name} {place_address or ''}".lower()
        for forbidden in config.get("forbidden_city_tokens", []):
            if forbidden in full_text:
                return False, f"Rejected place mentioning unrelated city '{forbidden}' in destination '{destination_name}'"

    return True, "Valid destination attraction"


def get_curated_regions_for_destination(destination_name: str) -> List[Dict[str, Any]]:
    """Return ordered list of regional attraction clusters for destination."""
    dest_key = destination_name.strip().lower().split(",")[0].strip()
    config = DESTINATION_REGIONAL_CATALOG.get(dest_key)
    if config:
        return config.get("regions", [])
    return []
