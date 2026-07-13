import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, LayoutGrid, Search, Settings, LogOut, User, ShieldCheck,
  GitBranch, ShieldAlert,
  Bell, PlayCircle, BookOpen, ClipboardList, Package,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'
import { canManageSettings, canAuthorWorkflows, isStaff, ROLE } from '@/lib/roles'

// `staffOnly` items (e.g. Products) are visible to SUPERADMIN/OWNER only.
const primaryNavItems: { title: string; path: string; icon: typeof LayoutDashboard; staffOnly?: boolean }[] = [
  { title: 'Dashboard', path: '/', icon: LayoutDashboard },
  { title: 'Products', path: '/products', icon: Package, staffOnly: true },
  { title: 'State Machines', path: '/machines', icon: LayoutGrid },
  { title: 'Iterations', path: '/iterations', icon: PlayCircle },
  // Products sits directly below Iterations (owner/superadmin manage their product registry).
  { title: 'File Explorer', path: '/explorer', icon: Search },
  // Notifications - per-user channels + history, available to EVERY role.
  { title: 'Notifications', path: '/notifications', icon: Bell },
  //{ title: 'Field Issues', path: '/field-issues', icon: FileWarning },
]

const staffNavItems = [
  // Governance: SUPERADMIN gets the full platform view, OWNER gets the
  // file-access-request queue + their own decision history.
  { title: 'Governance', path: '/governance', icon: ShieldAlert },
  //{ title: 'Change & NC', path: '/changes', icon: FileWarning },
  //{ title: 'Ingestion Inbox', path: '/ingestion/inbox', icon: Inbox },
  //{ title: 'Data Exchange', path: '/data-exchange', icon: ArrowLeftRight },
  //{ title: 'AAS Federation', path: '/aas-federation', icon: Network },
  { title: 'Compare', path: '/compare', icon: GitBranch },
]

const adminNavItems = [
  { title: 'Audit', path: '/audit', icon: ClipboardList },
  //{ title: 'Retention & GDPR', path: '/retention', icon: Trash2 },
]

const referenceNavItems = [
  { title: 'Standards docs', path: '/docs/standards', icon: BookOpen },
]

function isPathActive(current: string, target: string): boolean {
  if (target === '/') return current === '/'
  return current === target || current.startsWith(target + '/')
}

const ROLE_LABEL: Record<string, string> = {
  [ROLE.SUPERADMIN]: 'Super-admin',
  [ROLE.OWNER]: 'Owner',
  [ROLE.OPERATOR]: 'Operator',
}

export function AppSidebar() {
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const showSettings = canManageSettings(user?.role)
  const showStaffMenu = isStaff(user?.role) || canAuthorWorkflows(user?.role)
  const showAdminMenu = canManageSettings(user?.role)
  const showReferenceMenu = canAuthorWorkflows(user?.role)

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-border px-4 py-4">
        <Link to="/" className="flex items-center" aria-label="Digital Thread home">
          <img
            src="/digital-thread-logo-no-bg.png"
            alt="Digital Thread"
            className="h-9 w-auto"
          />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryNavItems
                .filter((item) => !item.staffOnly || showStaffMenu)
                .map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild isActive={isPathActive(location.pathname, item.path)}>
                      <Link to={item.path}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showStaffMenu && (
          <SidebarGroup>
            <SidebarGroupLabel>Operations</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {staffNavItems.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild isActive={isPathActive(location.pathname, item.path)}>
                      <Link to={item.path}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {showAdminMenu && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNavItems.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild isActive={isPathActive(location.pathname, item.path)}>
                      <Link to={item.path}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {showSettings && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isPathActive(location.pathname, '/settings')}>
                      <Link to="/settings">
                        <Settings className="h-4 w-4" />
                        <span>Settings</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {showReferenceMenu && (
          <SidebarGroup>
            <SidebarGroupLabel>Reference</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {referenceNavItems.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild isActive={isPathActive(location.pathname, item.path)}>
                      <Link to={item.path}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-border px-4 py-3 space-y-2">
        {user && (
          <div className="flex items-center justify-between">
            {/* Clicking your identity opens the self-service Profile page. */}
            <Link
              to="/profile"
              className="flex items-center gap-2 min-w-0 rounded hover:opacity-80"
              title="Open your profile"
              aria-current={isPathActive(location.pathname, '/profile') ? 'page' : undefined}
            >
              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{user.fullName ?? user.email}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  <ShieldCheck className="inline h-2.5 w-2.5 mr-0.5" />
                  {ROLE_LABEL[user.role] ?? user.role}
                  {user.partner?.name ? ` · ${user.partner.name}` : ''}
                </p>
              </div>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              onClick={logout}
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">Digital Thread Platform v0.1.0</p>
      </SidebarFooter>
    </Sidebar>
  )
}
