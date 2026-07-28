import { CheckCircle2 } from 'lucide-react'
import type { CourseAddedToast, PlannerTerm, PlannerYear } from '../../types/coursePlan'

export default function CourseAddedToastRegion({
  toasts,
  yearLabels,
  termLabels,
}: {
  toasts: CourseAddedToast[]
  yearLabels: Record<PlannerYear, string>
  termLabels: Record<PlannerTerm, string>
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed right-3 top-[60px] z-50 flex w-64 max-w-[calc(100vw-1.5rem)] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs shadow-card transition-opacity"
        >
          <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0 text-emerald-600" />
          <div className="flex flex-col">
            <span className="font-heading font-semibold text-foreground">{toast.courseCode} added</span>
            <span className="text-muted-foreground">
              {yearLabels[toast.year]}, {termLabels[toast.term]}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
