import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center h-screen text-center">
      <img
        src="/digital-thread-logo-no-bg.png"
        alt="Digital Thread"
        className="h-20 w-auto opacity-30 mb-6"
      />
      <h1 className="text-4xl font-bold mb-2 font-mono">404</h1>
      <p className="text-muted-foreground mb-6">Page not found in the Digital Thread</p>
      <Button onClick={() => navigate('/')}>Return to Library</Button>
    </div>
  )
}
