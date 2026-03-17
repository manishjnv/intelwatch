/**
 * @module App
 * @description Root app component with React Router configuration.
 */
import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { LandingPage } from '@/pages/LandingPage'; // ⛔ DESIGN LOCKED — see UI_DESIGN_LOCK.md
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/iocs" element={<DashboardPage />} />
          <Route path="/threat-actors" element={<DashboardPage />} />
          <Route path="/malware" element={<DashboardPage />} />
          <Route path="/vulnerabilities" element={<DashboardPage />} />
          <Route path="/graph" element={<DashboardPage />} />
          <Route path="/hunting" element={<DashboardPage />} />
          <Route path="/feeds" element={<DashboardPage />} />
          <Route path="/integrations" element={<DashboardPage />} />
          <Route path="/settings" element={<DashboardPage />} />
        </Route>
      </Route>
      {/* Landing page — ⛔ design locked, see UI_DESIGN_LOCK.md */}
      <Route path="/" element={<LandingPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
