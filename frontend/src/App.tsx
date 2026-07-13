import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/app-shell'
import { Dashboard } from '@/pages/dashboard'
import { StateMachineLibrary } from '@/pages/state-machine-library'
import { GraphicalEditor } from '@/pages/graphical-editor'
import { MachineVersions } from '@/pages/machine-versions'
import { DigitalThreadExplorer } from '@/pages/digital-thread-explorer'
import { IterationDetail } from '@/pages/iteration-detail'
import { IterationLibrary } from '@/pages/iteration-library'
import { ProductsLibrary } from '@/pages/products-library'
import { Profile } from '@/pages/profile'
import { Settings } from '@/pages/settings'
import { LineageExplorer } from '@/pages/lineage-explorer'
import { FileEnrichment } from '@/pages/file-enrichment'
import { IterationProvenance } from '@/pages/iteration-provenance'
import { GovernanceDashboard } from '@/pages/governance-dashboard'
import { ChangeRequests } from '@/pages/change-requests'
import { ComplianceReport } from '@/pages/compliance-report'
import { ComponentPassport } from '@/pages/component-passport'
import { IngestionInbox } from '@/pages/ingestion-inbox'
import { FieldIssues } from '@/pages/field-issues'
import { BindingEditor } from '@/pages/binding-editor'
import { VersionCompare } from '@/pages/version-compare'
import { OidcComplete } from '@/pages/oidc-complete'
import { NotificationsAdmin } from '@/pages/notifications-admin'
import { DataExchange } from '@/pages/data-exchange'
import { AasFederation } from '@/pages/aas-federation'
import { RetentionAdmin } from '@/pages/retention-admin'
import { AuditAdmin } from '@/pages/audit-admin'
import { NotFound } from '@/pages/not-found'
import { Login } from '@/pages/login'
import { DocsStandards } from '@/pages/docs-standards'
import { StandardsReference } from '@/pages/standards-reference'
import { useAuthStore } from '@/stores/auth-store'
import { useMachineStore } from '@/stores/machine-store'
import { usePartnerStore } from '@/stores/partner-store'
import { useDataSourceStore } from '@/stores/datasource-store'
import { Toaster } from '@/components/ui/sonner'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { RoleGuard } from '@/components/auth/role-guard'
import { ROLE } from '@/lib/roles'
import { Loader2 } from 'lucide-react'

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Login />
  }

  return <>{children}</>
}

function AppInitializer({ children }: { children: React.ReactNode }) {
  const { init: initMachines } = useMachineStore()
  const { init: initPartners } = usePartnerStore()
  const { init: initDataSources } = useDataSourceStore()
  const role = useAuthStore((s) => s.user?.role)

  useEffect(() => {
    initMachines()
    initPartners()
    // DataSources only meaningful for SUPERADMIN/OWNER (settings + binding editor)
    if (role === ROLE.SUPERADMIN || role === ROLE.OWNER) initDataSources()
  }, [initMachines, initPartners, initDataSources, role])

  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <AppInitializer>
          <ConfirmProvider>
            <AppShell>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/machines" element={<StateMachineLibrary />} />
                <Route
                  path="/editor/:machineId"
                  element={
                    <RoleGuard allow={[ROLE.SUPERADMIN, ROLE.OWNER]} inline>
                      <GraphicalEditor />
                    </RoleGuard>
                  }
                />
                <Route path="/machines/:machineId/versions" element={<MachineVersions />} />
                <Route path="/explorer" element={<DigitalThreadExplorer />} />
                <Route path="/lineage/:fileId" element={<LineageExplorer />} />
                <Route path="/enrichment/:fileId" element={<FileEnrichment />} />
                <Route
                  path="/provenance/iteration/:iterationId"
                  element={<RoleGuard allow={[ROLE.SUPERADMIN, ROLE.OWNER]} inline><IterationProvenance /></RoleGuard>}
                />
                <Route path="/iterations" element={<IterationLibrary />} />
                <Route
                  path="/products"
                  element={<RoleGuard allow={[ROLE.SUPERADMIN, ROLE.OWNER]} inline><ProductsLibrary /></RoleGuard>}
                />
                <Route path="/profile" element={<Profile />} />
                <Route path="/iteration/:iterationId" element={<IterationDetail />} />
                <Route
                  path="/governance"
                  element={<RoleGuard allow={[ROLE.SUPERADMIN, ROLE.OWNER]} inline><GovernanceDashboard /></RoleGuard>}
                />
                <Route
                  path="/changes"
                  element={<RoleGuard allow={[ROLE.SUPERADMIN, ROLE.OWNER]} inline><ChangeRequests /></RoleGuard>}
                />
                <Route
                  path="/compliance/iteration/:iterationId"
                  element={<RoleGuard allow={[ROLE.SUPERADMIN, ROLE.OWNER]} inline><ComplianceReport /></RoleGuard>}
                />
                <Route path="/components/:componentRef/passport" element={<ComponentPassport />} />
                <Route
                  path="/ingestion/inbox"
                  element={<RoleGuard allow={[ROLE.SUPERADMIN, ROLE.OWNER]} inline><IngestionInbox /></RoleGuard>}
                />
                <Route path="/field-issues" element={<FieldIssues />} />
                <Route
                  path="/bindings/:machineId"
                  element={<RoleGuard allow={[ROLE.SUPERADMIN, ROLE.OWNER]} inline><BindingEditor /></RoleGuard>}
                />
                <Route path="/compare" element={<VersionCompare />} />
                {/* Redirects to the single role-aware Dashboard at '/'. */}
                <Route path="/my-dashboard" element={<Navigate to="/" replace />} />
                <Route path="/oidc/complete" element={<OidcComplete />} />
                <Route
                  path="/notifications"
                  element={<RoleGuard allow={[ROLE.SUPERADMIN, ROLE.OWNER, ROLE.OPERATOR]} inline><NotificationsAdmin /></RoleGuard>}
                />
                <Route
                  path="/data-exchange"
                  element={<RoleGuard allow={[ROLE.SUPERADMIN, ROLE.OWNER]} inline><DataExchange /></RoleGuard>}
                />
                <Route
                  path="/aas-federation"
                  element={<RoleGuard allow={[ROLE.SUPERADMIN, ROLE.OWNER]} inline><AasFederation /></RoleGuard>}
                />
                <Route
                  path="/retention"
                  element={<RoleGuard allow={[ROLE.SUPERADMIN]} inline><RetentionAdmin /></RoleGuard>}
                />
                <Route
                  path="/audit"
                  element={<RoleGuard allow={[ROLE.SUPERADMIN]} inline><AuditAdmin /></RoleGuard>}
                />
                <Route
                  path="/docs/standards"
                  element={<RoleGuard allow={[ROLE.SUPERADMIN, ROLE.OWNER]} inline><DocsStandards /></RoleGuard>}
                />
                <Route
                  path="/docs/standards/:format"
                  element={<RoleGuard allow={[ROLE.SUPERADMIN, ROLE.OWNER]} inline><StandardsReference /></RoleGuard>}
                />
                <Route
                  path="/settings"
                  element={
                    <RoleGuard allow={[ROLE.SUPERADMIN]} inline>
                      <Settings />
                    </RoleGuard>
                  }
                />
                <Route path="/login" element={<Navigate to="/" replace />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppShell>
            <Toaster />
          </ConfirmProvider>
        </AppInitializer>
      </AuthGate>
    </BrowserRouter>
  )
}

export default App
