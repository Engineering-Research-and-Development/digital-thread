import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from './app-sidebar'
import { UploadProgressPopover } from '@/components/uploads/upload-progress-popover'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>{children}</SidebarInset>
      {/* Global upload-progress widget, shared by every upload point. */}
      <UploadProgressPopover />
    </SidebarProvider>
  )
}
