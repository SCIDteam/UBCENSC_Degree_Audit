import { Trash2 } from 'lucide-react'
import type { CourseAttempt, StoredCourseGrade, StoredCourseStatus } from '../../types/coursePlan'

const STATUS_LABELS: Record<StoredCourseStatus, string> = {
  completed: 'Taken',
  in_progress: 'In Progress',
  planned: 'Planned',
}

const GRADE_LABELS: Record<Exclude<StoredCourseGrade, ''>, string> = {
  P: 'Pass',
  F: 'Fail',
  W: 'Withdrawn',
}

type CardTreatment = {
  border: string
  statusBg: string
  statusText: string
  titleClassName: string
}

function resolveTreatment(status: StoredCourseStatus, grade: StoredCourseGrade): CardTreatment {
  if (status === 'completed' && grade === 'P') {
    return {
      border: 'border-l-emerald-500',
      statusBg: 'bg-emerald-100',
      statusText: 'text-emerald-700',
      titleClassName: 'text-foreground',
    }
  }
  if (status === 'completed' && grade === 'F') {
    return {
      border: 'border-l-destructive',
      statusBg: 'bg-destructive/10',
      statusText: 'text-destructive',
      titleClassName: 'text-muted-foreground line-through',
    }
  }
  if (status === 'completed' && grade === 'W') {
    return {
      border: 'border-l-slate-400',
      statusBg: 'bg-slate-100',
      statusText: 'text-slate-600',
      titleClassName: 'text-muted-foreground line-through',
    }
  }
  if (status === 'in_progress') {
    return {
      border: 'border-l-sky-500',
      statusBg: 'bg-sky-100',
      statusText: 'text-sky-700',
      titleClassName: 'text-foreground',
    }
  }
  return {
    border: 'border-l-border',
    statusBg: 'bg-muted',
    statusText: 'text-muted-foreground',
    titleClassName: 'text-foreground',
  }
}

export default function CourseCard({
  attempt,
  isRepeat,
  onDelete,
}: {
  attempt: CourseAttempt
  isRepeat: boolean
  onDelete: (attemptId: string) => void
}) {
  const treatment = resolveTreatment(attempt.status, attempt.grade)
  const gradeLabel = attempt.grade ? GRADE_LABELS[attempt.grade] : null

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-md border border-border border-l-4 bg-card px-2.5 py-2 ${treatment.border}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className={`font-heading text-[11px] font-bold ${treatment.titleClassName}`}>
            {attempt.display_code}
          </span>
          <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
            {attempt.subject}
          </span>
          {isRepeat && (
            <span className="rounded bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
              Repeat
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDelete(attempt.attempt_id)}
          aria-label={`Remove ${attempt.display_code} from plan`}
          className="flex-shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <p className={`text-[11px] leading-snug ${treatment.titleClassName}`}>{attempt.course_title}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${treatment.statusBg} ${treatment.statusText}`}>
            {STATUS_LABELS[attempt.status]}
          </span>
          {gradeLabel && (
            <span className="text-[10px] text-muted-foreground">{gradeLabel}</span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground/70">{attempt.credits} cr</span>
      </div>
    </div>
  )
}
