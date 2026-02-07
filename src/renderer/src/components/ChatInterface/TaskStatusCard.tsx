import { Card, CardContent } from '@/components/ui/card'
import { Loader2, CheckCircle2, XCircle, Globe, ArrowRight } from 'lucide-react'

interface TaskStep {
  step?: number
  url?: string
  page_title?: string
  thinking?: string
  evaluation?: string
  next_goal?: string
  memory?: string
  actions?: Array<Record<string, unknown>>
}

interface TaskStatusCardProps {
  taskStatus: 'running' | 'succeeded' | 'failed'
  taskResult?: Record<string, unknown>
  taskSteps?: TaskStep[]
}

export function TaskStatusCard({ taskStatus, taskResult, taskSteps }: TaskStatusCardProps) {
  if (taskStatus === 'running') {
    return (
      <Card className="mt-2 border-primary/20 bg-primary/5">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <p className="text-sm font-medium text-primary flex-1">
              Browser is working on your task...
            </p>
            <Globe className="h-4 w-4 text-primary/50" />
          </div>

          {/* Real-time step updates */}
          {taskSteps && taskSteps.length > 0 && (
            <div className="pl-7 space-y-2 text-xs">
              {taskSteps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-2 border-l-2 border-primary/30 pl-3 py-1">
                  <div className="flex-1 space-y-1">
                    {/* Chain of Thought */}
                    {step.thinking && (
                      <p className="text-primary/90 italic">
                        💭 {step.thinking}
                      </p>
                    )}

                    {/* Next Goal */}
                    {step.next_goal && (
                      <p className="text-primary font-medium flex items-center gap-1">
                        <ArrowRight className="h-3 w-3 inline" />
                        {step.next_goal}
                      </p>
                    )}

                    {/* Page Context */}
                    {step.page_title && (
                      <p className="text-muted-foreground/80">
                        📄 {step.page_title}
                      </p>
                    )}

                    {/* Actions */}
                    {step.actions && step.actions.length > 0 && (
                      <p className="text-muted-foreground/70 font-mono text-[0.7rem]">
                        → {step.actions.map((a) =>
                          Object.keys(a)[0] || ''
                        ).join(', ')}
                      </p>
                    )}

                    {/* Evaluation */}
                    {step.evaluation && (
                      <p className="text-muted-foreground/60 text-[0.7rem]">
                        ✓ {step.evaluation}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
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
