import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import PlanTripPage from './pages/PlanTripPage';
import RecommendationsPage from './pages/RecommendationsPage';
import ItineraryPage from './pages/ItineraryPage';
import MapPage from './pages/MapPage';
import AssistantPage from './pages/AssistantPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ReportsPage from './pages/ReportsPage';
import ProfilePage from './pages/ProfilePage';
import LiveTripPage from './pages/LiveTripPage';

// Context Providers & Hooks
import { AuthProvider } from './context/AuthContext';
import { TripProvider } from './context/TripContext';
import { LiveTripProvider } from './context/LiveTripContext';
import { useHealthCheck } from './hooks/useHealthCheck';

export default function App() {
  const healthState = useHealthCheck(true);

  return (
    <AuthProvider>
      <TripProvider>
        <LiveTripProvider>
          <BrowserRouter>
            <div className="min-h-screen bg-[#F4F7F6] text-[#26383D] flex flex-col font-sans selection:bg-[#18B8A6]/20 selection:text-[#163B46]">
              <Navbar healthState={healthState} />
              <main className="flex-grow">
                <Routes>
                {/* 1. Landing Page */}
                <Route path="/" element={<LandingPage healthState={healthState} />} />

                {/* 2. Authentication */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />

                {/* 3. User Dashboard (Protected) */}
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />

                {/* 4. Plan Your Trip */}
                <Route path="/plan" element={<PlanTripPage />} />

                {/* 5. Recommended Attractions */}
                <Route path="/recommendations" element={<RecommendationsPage />} />

                {/* 6. Itinerary Page */}
                <Route path="/itinerary" element={<ItineraryPage />} />
                <Route path="/itinerary/:id" element={<ItineraryPage />} />

                {/* 7. Interactive Map */}
                <Route path="/map" element={<MapPage />} />

                {/* 8. AI Travel Assistant */}
                <Route path="/assistant" element={<AssistantPage />} />

                {/* 9. Analytics Dashboard */}
                <Route path="/analytics" element={<AnalyticsPage />} />

                {/* 10. Reports Page */}
                <Route path="/reports" element={<ReportsPage />} />

                {/* 11. Profile Page (Protected) */}
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <ProfilePage />
                    </ProtectedRoute>
                  }
                />

                {/* 12. Real-Time Live On-Trip Execution */}
                <Route path="/live-trip" element={<LiveTripPage />} />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <Footer />
          </div>
        </BrowserRouter>
        </LiveTripProvider>
      </TripProvider>
    </AuthProvider>
  );
}
