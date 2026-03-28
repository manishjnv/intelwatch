/**
 * @module App
 * @description Root app component with React Router configuration.
 * Routes: /login, /register, /dashboard (protected), module pages, /404
 */
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { LandingPage } from '@/pages/LandingPage'; // ⛔ DESIGN LOCKED — see UI_DESIGN_LOCK.md
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { IntegrationPage } from '@/pages/IntegrationPage';
import { UserManagementPage } from '@/pages/UserManagementPage';
import { CustomizationPage } from '@/pages/CustomizationPage';
import { IocListPage } from '@/pages/IocListPage';
import { FeedListPage } from '@/pages/FeedListPage';
import { ThreatActorListPage } from '@/pages/ThreatActorListPage';
import { MalwareListPage } from '@/pages/MalwareListPage';
import { VulnerabilityListPage } from '@/pages/VulnerabilityListPage';
import { CommandCenterPage } from '@/pages/CommandCenterPage';
import { DRPDashboardPage } from '@/pages/DRPDashboardPage';
import { CorrelationPage } from '@/pages/CorrelationPage';
import { HuntingWorkbenchPage } from '@/pages/HuntingWorkbenchPage';
import { BillingPage } from '@/pages/BillingPage';
import { AdminOpsPage } from '@/pages/AdminOpsPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { ReportingPage } from '@/pages/ReportingPage';
import { AlertingPage } from '@/pages/AlertingPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { SearchPage } from '@/pages/SearchPage';
import { GlobalCatalogPage } from '@/pages/GlobalCatalogPage';
import { PlanLimitsPage } from '@/pages/PlanLimitsPage';
import { GlobalMonitoringPage } from '@/pages/GlobalMonitoringPage';

// Lazy-loaded — D3 (~190KB) splits into its own chunk, only fetched on /graph navigation
const ThreatGraphPage = React.lazy(() =>
  import('@/pages/ThreatGraphPage').then(m => ({ default: m.ThreatGraphPage }))
)

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

export function App() {
  return (
    <ErrorBoundary>
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
            {/* Phase 4 module pages — live */}
            <Route path="/graph" element={
              <React.Suspense fallback={<div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-brand" /></div>}>
                <ThreatGraphPage />
              </React.Suspense>
            } />
            <Route path="/hunting" element={<HuntingWorkbenchPage />} />
            <Route path="/command-center" element={<CommandCenterPage />} />
            <Route path="/enrichment" element={<Navigate to="/command-center" replace />} />
            <Route path="/drp" element={<DRPDashboardPage />} />
            <Route path="/correlation" element={<CorrelationPage />} />
            <Route path="/integrations" element={<IntegrationPage />} />
            <Route path="/settings" element={<UserManagementPage />} />
            <Route path="/customization" element={<CustomizationPage />} />
            {/* Phase 6 module pages */}
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/admin" element={<AdminOpsPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            {/* Phase 7 module pages */}
            <Route path="/reporting" element={<ReportingPage />} />
            <Route path="/alerting" element={<AlertingPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            {/* Global Feed Catalog (DECISION-029) */}
            <Route path="/global-catalog" element={<GlobalCatalogPage />} />
            <Route path="/global-ai-config" element={<Navigate to="/command-center" replace />} />
            <Route path="/plan-limits" element={<PlanLimitsPage />} />
            <Route path="/global-monitoring" element={<GlobalMonitoringPage />} />
            {/* ES Search — cross-cutting */}
            <Route path="/search" element={<SearchPage />} />
          </Route>
        </Route>

        {/* Landing page — ⛔ design locked, see UI_DESIGN_LOCK.md */}
        <Route path="/" element={<LandingPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  );
}
