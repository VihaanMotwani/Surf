import { Card, CardContent } from '@/components/ui/card'
import { Loader2, CheckCircle2, XCircle, Globe } from 'lucide-react'

interface TaskStatusCardProps {
  taskStatus: 'running' | 'succeeded' | 'failed'
  taskResult?: Record<string, unknown>
}

export function TaskStatusCard({ taskStatus, taskResult }: TaskStatusCardProps) {
  if (taskStatus === 'running') {
    return (
      <Card className="mt-2 border-primary/20 bg-primary/5">
        <CardContent className="flex items-center gap-3 p-3">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="text-sm font-medium text-primary flex-1">
            Browser is working on your task...
          </p>
          <Globe className="h-4 w-4 text-primary/50" />
        </CardContent>
      </Card>
    )
  }

  if (taskStatus === 'succeeded') {
    const finalResult = taskResult?.final_result as string | undefined
    const urls = taskResult?.urls as string[] | undefined

    return (
      <Card className="mt-2 border-border/50 bg-muted/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <p className="text-sm font-medium">
              Task completed
            </p>
          </div>
          {finalResult && (
            <p className="text-sm text-muted-foreground mt-1 pl-6">
              {finalResult}
            </p>
          )}
          {urls && urls.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1 pl-6">
              Visited: {urls.slice(0, 3).join(', ')}
              {urls.length > 3 && ` +${urls.length - 3} more`}
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  if (taskStatus === 'failed') {
    const error = (taskResult?.error ?? taskResult?.message) as string | undefined

    return (
      <Card className="mt-2 border-destructive/20 bg-destructive/5">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-destructive" />
            <p className="text-sm font-medium text-destructive">
              Task failed
            </p>
          </div>
          {error && (
            <p className="text-sm text-muted-foreground mt-1 pl-6">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  return null
}
