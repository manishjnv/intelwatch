/**
 * @module App
 * @description Root app component with React Router configuration.
 * Routes: /login, /register, /dashboard (protected), module pages, /404
 */
import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { LandingPage } from '@/pages/LandingPage'; // ⛔ DESIGN LOCKED — see UI_DESIGN_LOCK.md
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ComingSoonPage } from '@/pages/ComingSoonPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { IocListPage } from '@/pages/IocListPage';
import { FeedListPage } from '@/pages/FeedListPage';
import { ThreatActorListPage } from '@/pages/ThreatActorListPage';
import { MalwareListPage } from '@/pages/MalwareListPage';
import { VulnerabilityListPage } from '@/pages/VulnerabilityListPage';

export function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          {/* Live module pages */}
          <Route path="/iocs" element={<IocListPage />} />
          <Route path="/threat-actors" element={<ThreatActorListPage />} />
          <Route path="/malware" element={<MalwareListPage />} />
          <Route path="/vulnerabilities" element={<VulnerabilityListPage />} />
          <Route path="/feeds" element={<FeedListPage />} />
          {/* Phase 4+ module pages — show ComingSoonPage until implemented */}
          <Route path="/graph" element={<ComingSoonPage />} />
          <Route path="/hunting" element={<ComingSoonPage />} />
          <Route path="/enrichment" element={<ComingSoonPage />} />
          <Route path="/drp" element={<ComingSoonPage />} />
          <Route path="/correlation" element={<ComingSoonPage />} />
          <Route path="/integrations" element={<ComingSoonPage />} />
          <Route path="/settings" element={<ComingSoonPage />} />
        </Route>
      </Route>

      {/* Landing page — ⛔ design locked, see UI_DESIGN_LOCK.md */}
      <Route path="/" element={<LandingPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
