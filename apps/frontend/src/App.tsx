/**
 * @module App
 * @description Root app component with React Router configuration.
 * Session 111: 12 absorbed routes now redirect to /command-center#tab.
 * Session 112: Global Catalog removed — feeds governed by plan.
 * Session 123e: Feeds tab absorbed into System tab — /feeds + /global-catalog → #system.
 */
import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { usePageMeta } from '@/hooks/use-page-meta';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { LandingPage } from '@/pages/LandingPage'; // ⛔ DESIGN LOCKED — see UI_DESIGN_LOCK.md
import { NotFoundPage } from '@/pages/NotFoundPage';
import { FeatureGate } from '@/components/FeatureGate';


// Everything except the landing page is lazy-loaded, so `/` ships only landing code
// (LCP / Core Web Vitals). ThreatGraphPage additionally isolates D3 (~190KB).
const DashboardLayout = React.lazy(() => import('@/components/layout/DashboardLayout').then(m => ({ default: m.DashboardLayout })));
const LoginPage = React.lazy(() => import('@/pages/LoginPage').then(m => ({ default: m.LoginPage })));
const RegisterPage = React.lazy(() => import('@/pages/RegisterPage').then(m => ({ default: m.RegisterPage })));
const DashboardPage = React.lazy(() => import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const IocListPage = React.lazy(() => import('@/pages/IocListPage').then(m => ({ default: m.IocListPage })));
const ThreatActorListPage = React.lazy(() => import('@/pages/ThreatActorListPage').then(m => ({ default: m.ThreatActorListPage })));
const MalwareListPage = React.lazy(() => import('@/pages/MalwareListPage').then(m => ({ default: m.MalwareListPage })));
const VulnerabilityListPage = React.lazy(() => import('@/pages/VulnerabilityListPage').then(m => ({ default: m.VulnerabilityListPage })));
const CommandCenterPage = React.lazy(() => import('@/pages/CommandCenterPage').then(m => ({ default: m.CommandCenterPage })));
const DRPDashboardPage = React.lazy(() => import('@/pages/DRPDashboardPage').then(m => ({ default: m.DRPDashboardPage })));
const CorrelationPage = React.lazy(() => import('@/pages/CorrelationPage').then(m => ({ default: m.CorrelationPage })));
const HuntingWorkbenchPage = React.lazy(() => import('@/pages/HuntingWorkbenchPage').then(m => ({ default: m.HuntingWorkbenchPage })));
const SearchPage = React.lazy(() => import('@/pages/SearchPage').then(m => ({ default: m.SearchPage })));
const MfaChallengePage = React.lazy(() => import('@/pages/MfaChallengePage').then(m => ({ default: m.MfaChallengePage })));
const MfaSetupRequiredPage = React.lazy(() => import('@/pages/MfaSetupRequiredPage').then(m => ({ default: m.MfaSetupRequiredPage })));
const VerifyEmailPage = React.lazy(() => import('@/pages/VerifyEmailPage').then(m => ({ default: m.VerifyEmailPage })));
const ClientOnboardingPage = React.lazy(() => import('@/pages/ClientOnboardingPage').then(m => ({ default: m.ClientOnboardingPage })));
const ThreatGraphPage = React.lazy(() => import('@/pages/ThreatGraphPage').then(m => ({ default: m.ThreatGraphPage })));

const PageSpinner = (
  <div className="flex h-full min-h-[50vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-brand" /></div>
);

/** Catches render errors and displays them instead of blank page */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: '#ef4444', fontFamily: 'monospace', background: '#0a0a0a', minHeight: '100vh' }}>
          <h1>React Error</h1>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#f8fafc' }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#94a3b8', fontSize: 12 }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Syncs <head> meta with the current route (renders nothing). */
function RouteMeta() {
  usePageMeta(useLocation().pathname);
  return null;
}

export function App() {
  return (
    <ErrorBoundary>
      <RouteMeta />
      <React.Suspense fallback={PageSpinner}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/auth/mfa-challenge" element={<MfaChallengePage />} />
        <Route path="/auth/mfa-setup-required" element={<MfaSetupRequiredPage />} />
        <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
        <Route path="/onboard/invite" element={<ClientOnboardingPage />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            {/* Intelligence pages — FeatureGate wrapped */}
            <Route path="/iocs" element={<FeatureGate feature="ioc_management"><IocListPage /></FeatureGate>} />
            <Route path="/threat-actors" element={<FeatureGate feature="threat_actors"><ThreatActorListPage /></FeatureGate>} />
            <Route path="/malware" element={<FeatureGate feature="malware_intel"><MalwareListPage /></FeatureGate>} />
            <Route path="/vulnerabilities" element={<FeatureGate feature="vulnerability_intel"><VulnerabilityListPage /></FeatureGate>} />
            <Route path="/graph" element={<FeatureGate feature="graph_exploration"><ThreatGraphPage /></FeatureGate>} />
            <Route path="/hunting" element={<FeatureGate feature="threat_hunting"><HuntingWorkbenchPage /></FeatureGate>} />
            <Route path="/drp" element={<FeatureGate feature="digital_risk_protection"><DRPDashboardPage /></FeatureGate>} />
            <Route path="/correlation" element={<FeatureGate feature="correlation_engine"><CorrelationPage /></FeatureGate>} />
            <Route path="/global-catalog" element={<Navigate to="/command-center#system" replace />} />
            <Route path="/search" element={<FeatureGate feature="ioc_management"><SearchPage /></FeatureGate>} />
            {/* Command Center — unified hub */}
            <Route path="/command-center" element={<CommandCenterPage />} />
            {/* Absorbed route redirects → Command Center tabs */}
            <Route path="/feeds" element={<Navigate to="/command-center#system" replace />} />
            <Route path="/integrations" element={<Navigate to="/command-center#users-access" replace />} />
            <Route path="/settings" element={<Navigate to="/command-center#users-access" replace />} />
            <Route path="/customization" element={<Navigate to="/command-center#settings" replace />} />
            <Route path="/billing" element={<Navigate to="/command-center#billing-plans" replace />} />
            <Route path="/admin" element={<Navigate to="/command-center#system" replace />} />
            <Route path="/onboarding" element={<Navigate to="/command-center#settings" replace />} />
            <Route path="/reporting" element={<Navigate to="/command-center#alerts-reports" replace />} />
            <Route path="/alerting" element={<Navigate to="/command-center#alerts-reports" replace />} />
            <Route path="/analytics" element={<Navigate to="/command-center#overview" replace />} />
            <Route path="/plan-limits" element={<Navigate to="/command-center#billing-plans" replace />} />
            <Route path="/global-monitoring" element={<Navigate to="/command-center#system" replace />} />
            <Route path="/enrichment" element={<Navigate to="/command-center" replace />} />
            <Route path="/global-ai-config" element={<Navigate to="/command-center" replace />} />
          </Route>
        </Route>

        {/* Landing page — ⛔ design locked, see UI_DESIGN_LOCK.md */}
        <Route path="/" element={<LandingPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </React.Suspense>
    </ErrorBoundary>
  );
}
