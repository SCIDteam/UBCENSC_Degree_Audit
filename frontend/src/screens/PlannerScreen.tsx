import { useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, Plus, X } from 'lucide-react'
import { academicYears, concentrations, programs } from '../utils/setupOptions'
import type { StudentSetupProfile } from '../types/studentProfile'
import type { CourseAddedToast, CourseAttempt, PlannerTerm, PlannerYear } from '../types/coursePlan'
import type { CatalogueCourse } from '../types/courseCatalogue'
import CourseSearchPanel, {
  type CourseSearchPanelHandle,
} from '../components/planner/CourseSearchPanel'
import EditCourseModal from '../components/planner/AddCourseModal'
import CourseCard from '../components/planner/CourseCard'
import CourseAddedToastRegion from '../components/planner/CourseAddedToastRegion'

const TOAST_DURATION_MS = 3000
const HIGHLIGHT_DURATION_MS = 1500
const MAX_VISIBLE_TOASTS = 3

const REPEAT_BLOCKED_MESSAGE =
  'This course is already in the plan and cannot be added again unless all previous attempts were failed or withdrawn.'

function mapCourseLevelToYear(level: number): PlannerYear {
  if (!Number.isFinite(level) || level < 100) {
    console.warn(`[PlannerScreen] Invalid course_level "${level}"; defaulting to Year 1`)
    return 1
  }
  if (level >= 500) return 5
  if (level >= 400) return 4
  if (level >= 300) return 3
  if (level >= 200) return 2
  return 1
}

function mapFirstTermOffered(terms: CatalogueCourse['terms_offered'] | undefined): PlannerTerm {
  const first = terms?.[0]
  if (first === 'Winter Term 1') return 'winter_1'
  if (first === 'Winter Term 2') return 'winter_2'
  if (first === 'Summer') return 'summer'
  console.warn(`[PlannerScreen] Invalid terms_offered value "${String(first)}"; defaulting to Winter Term 1`)
  return 'winter_1'
}

const PLANNER_SECTIONS: { id: PlannerYear; label: string }[] = [
  { id: 1, label: 'Year 1' },
  { id: 2, label: 'Year 2' },
  { id: 3, label: 'Year 3' },
  { id: 4, label: 'Year 4' },
  { id: 5, label: 'Year 5+' },
]

const PLANNER_TERMS: { id: PlannerTerm; label: string }[] = [
  { id: 'winter_1', label: 'Winter Term 1' },
  { id: 'winter_2', label: 'Winter Term 2' },
  { id: 'summer', label: 'Summer' },
]

const YEAR_LABELS = Object.fromEntries(
  PLANNER_SECTIONS.map((section) => [section.id, section.label]),
) as Record<PlannerYear, string>

const TERM_LABELS = Object.fromEntries(
  PLANNER_TERMS.map((term) => [term.id, term.label]),
) as Record<PlannerTerm, string>

function normalizeCourseCode(code: string) {
  return code.trim().toUpperCase()
}

function resolveProgramLabel(code: StudentSetupProfile['program']) {
  return programs.find((program) => program.code === code)?.name ?? code
}

function resolveConcentrationLabel(optionId: StudentSetupProfile['option_id']) {
  return concentrations.find((concentration) => concentration.optionId === optionId)?.name ?? optionId
}

function resolveAcademicYearLabel(value: StudentSetupProfile['academic_year']) {
  return academicYears.find((year) => year.value === value)?.label ?? String(value)
}

function HeaderBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
      {children}
    </span>
  )
}

function TermColumn({
  label,
  attempts,
  repeatCodes,
  highlightedAttemptIds,
  onAddClick,
  onEditAttempt,
  onDeleteAttempt,
}: {
  label: string
  attempts: CourseAttempt[]
  repeatCodes: Set<string>
  highlightedAttemptIds: Set<string>
  onAddClick: () => void
  onEditAttempt: (attempt: CourseAttempt) => void
  onDeleteAttempt: (attemptId: string) => void
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-background/50">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-heading text-[11px] font-semibold text-foreground">{label}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        {attempts.length === 0 ? (
          <div className="flex min-h-[60px] flex-1 items-center justify-center rounded-md border-2 border-dashed border-border/60">
            <span className="text-[11px] text-muted-foreground/50">No courses</span>
          </div>
        ) : (
          attempts.map((attempt) => (
            <CourseCard
              key={attempt.attempt_id}
              attempt={attempt}
              isRepeat={repeatCodes.has(normalizeCourseCode(attempt.course_code))}
              isHighlighted={highlightedAttemptIds.has(attempt.attempt_id)}
              onEdit={onEditAttempt}
              onDelete={onDeleteAttempt}
            />
          ))
        )}
      </div>
      <button
        type="button"
        onClick={onAddClick}
        className="flex w-full flex-shrink-0 items-center gap-1 rounded-b-lg border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent/30 hover:text-primary"
      >
        <Plus size={10} />
        Add course
      </button>
    </div>
  )
}

function PlannerSection({
  id,
  label,
  expanded,
  attempts,
  repeatCodes,
  highlightedAttemptIds,
  onToggle,
  onAddClick,
  onEditAttempt,
  onDeleteAttempt,
}: {
  id: PlannerYear
  label: string
  expanded: boolean
  attempts: CourseAttempt[]
  repeatCodes: Set<string>
  highlightedAttemptIds: Set<string>
  onToggle: () => void
  onAddClick: () => void
  onEditAttempt: (attempt: CourseAttempt) => void
  onDeleteAttempt: (attemptId: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-accent/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        {expanded ? (
          <ChevronDown size={14} className="flex-shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight size={14} className="flex-shrink-0 text-muted-foreground" />
        )}
        <span className="font-heading flex-1 text-sm font-semibold text-foreground">{label}</span>
      </button>
      {expanded && (
        <div className="grid grid-cols-1 gap-3 border-t border-border p-3 sm:grid-cols-3">
          {PLANNER_TERMS.map((term) => (
            <TermColumn
              key={term.id}
              label={term.label}
              attempts={attempts.filter(
                (attempt) => attempt.year_taken === id && attempt.term_taken === term.id,
              )}
              repeatCodes={repeatCodes}
              highlightedAttemptIds={highlightedAttemptIds}
              onAddClick={onAddClick}
              onEditAttempt={onEditAttempt}
              onDeleteAttempt={onDeleteAttempt}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function PlannerScreen({
  profile,
  attempts,
  onAddAttempt,
  onUpdateAttempt,
  onDeleteAttempt,
  onBack,
  onRunAudit,
  auditError,
  onDismissAuditError,
}: {
  profile: StudentSetupProfile
  attempts: CourseAttempt[]
  onAddAttempt: (attempt: CourseAttempt) => void
  onUpdateAttempt: (attempt: CourseAttempt) => void
  onDeleteAttempt: (attemptId: string) => void
  onBack: () => void
  onRunAudit: () => void
  auditError: string | null
  onDismissAuditError: () => void
}) {
  const [expanded, setExpanded] = useState<Set<PlannerYear>>(new Set([1]))
  const [editingAttempt, setEditingAttempt] = useState<CourseAttempt | null>(null)
  const [blockedNotice, setBlockedNotice] = useState<string | null>(null)
  const [toasts, setToasts] = useState<CourseAddedToast[]>([])
  const [highlightedAttemptIds, setHighlightedAttemptIds] = useState<Set<string>>(new Set())
  const searchPanelRef = useRef<CourseSearchPanelHandle>(null)
  const timersRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId))
    }
  }, [])

  const runAfterDelay = (delayMs: number, callback: () => void) => {
    const timerId = window.setTimeout(() => {
      timersRef.current.delete(timerId)
      callback()
    }, delayMs)
    timersRef.current.add(timerId)
  }

  const repeatCodes = new Set<string>()
  const seenCodes = new Set<string>()
  for (const attempt of attempts) {
    const normalized = normalizeCourseCode(attempt.course_code)
    if (seenCodes.has(normalized)) {
      repeatCodes.add(normalized)
    }
    seenCodes.add(normalized)
  }

  const toggleSection = (id: PlannerYear) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleAddCourseClick = () => {
    searchPanelRef.current?.focusInput()
  }

  const isRepeatBlocked = (courseCode: string) => {
    const normalized = normalizeCourseCode(courseCode)
    const matching = attempts.filter((attempt) => normalizeCourseCode(attempt.course_code) === normalized)
    return (
      matching.length > 0 &&
      !matching.every((attempt) => attempt.status === 'completed' && (attempt.grade === 'F' || attempt.grade === 'W'))
    )
  }

  const handleSelectCourse = (course: CatalogueCourse) => {
    if (isRepeatBlocked(course.course_code)) {
      setBlockedNotice(REPEAT_BLOCKED_MESSAGE)
      return
    }
    setBlockedNotice(null)

    const year = mapCourseLevelToYear(course.course_level)
    const term = mapFirstTermOffered(course.terms_offered)
    const attemptId = crypto.randomUUID()

    onAddAttempt({
      ...course,
      attempt_id: attemptId,
      status: 'completed',
      grade: 'P',
      percentage: null,
      year_taken: year,
      term_taken: term,
      source: 'manual'
    })
    setExpanded((prev) => new Set(prev).add(year))

    setHighlightedAttemptIds((prev) => new Set(prev).add(attemptId))
    runAfterDelay(HIGHLIGHT_DURATION_MS, () => {
      setHighlightedAttemptIds((prev) => {
        const next = new Set(prev)
        next.delete(attemptId)
        return next
      })
    })

    const toastId = crypto.randomUUID()
    setToasts((prev) => [{ id: toastId, courseCode: course.display_code, year, term }, ...prev].slice(0, MAX_VISIBLE_TOASTS))
    runAfterDelay(TOAST_DURATION_MS, () => {
      setToasts((prev) => prev.filter((toast) => toast.id !== toastId))
    })

    searchPanelRef.current?.focusLastResult()
  }

  const handleEditAttempt = (attempt: CourseAttempt) => {
    setEditingAttempt(attempt)
  }

  const closeEditModal = () => {
    setEditingAttempt(null)
    searchPanelRef.current?.focusLastResult()
  }

  const handleConfirmEdit = (updatedAttempt: CourseAttempt) => {
    onUpdateAttempt(updatedAttempt)
    setExpanded((prev) => new Set(prev).add(updatedAttempt.year_taken))
    setEditingAttempt(null)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex-shrink-0 border-b border-border bg-card">
        <div className="flex h-[52px] items-center gap-3 px-4">
          <div className="flex flex-shrink-0 items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <BookOpen size={13} className="text-primary-foreground" />
            </div>
            <span className="font-heading hidden text-sm font-semibold text-foreground sm:block">
              ENSC Degree Auditor
            </span>
          </div>
          <div className="hidden h-4 w-px flex-shrink-0 bg-border md:block" />
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            <HeaderBadge>{profile.calendar_year}</HeaderBadge>
            <HeaderBadge>
              {resolveProgramLabel(profile.program)} {profile.program_type}
            </HeaderBadge>
            <HeaderBadge>{resolveConcentrationLabel(profile.option_id)}</HeaderBadge>
            <HeaderBadge>{resolveAcademicYearLabel(profile.academic_year)}</HeaderBadge>
          </div>
          <div className="ml-auto flex flex-shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onBack}
              className="rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Back
            </button>
            <button
              type="button"
              onClick={onRunAudit}
              className="font-heading rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Run Audit
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <CourseSearchPanel ref={searchPanelRef} onSelectCourse={handleSelectCourse} />

        <main className="min-w-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
          {auditError && (
            <div className="flex items-start justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              <span>{auditError}</span>
              <button
                type="button"
                onClick={onDismissAuditError}
                aria-label="Dismiss message"
                className="flex-shrink-0 rounded p-0.5 text-destructive transition-colors hover:bg-destructive/10"
              >
                <X size={12} />
              </button>
            </div>
          )}
          {blockedNotice && (
            <div className="flex items-start justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              <span>{blockedNotice}</span>
              <button
                type="button"
                onClick={() => setBlockedNotice(null)}
                aria-label="Dismiss message"
                className="flex-shrink-0 rounded p-0.5 text-destructive transition-colors hover:bg-destructive/10"
              >
                <X size={12} />
              </button>
            </div>
          )}
          {PLANNER_SECTIONS.map((section) => (
            <PlannerSection
              key={section.id}
              id={section.id}
              label={section.label}
              expanded={expanded.has(section.id)}
              attempts={attempts}
              repeatCodes={repeatCodes}
              highlightedAttemptIds={highlightedAttemptIds}
              onToggle={() => toggleSection(section.id)}
              onAddClick={handleAddCourseClick}
              onEditAttempt={handleEditAttempt}
              onDeleteAttempt={onDeleteAttempt}
            />
          ))}
        </main>
      </div>

      <CourseAddedToastRegion toasts={toasts} yearLabels={YEAR_LABELS} termLabels={TERM_LABELS} />

      {editingAttempt && (
        <EditCourseModal
          attempt={editingAttempt}
          onConfirm={handleConfirmEdit}
          onDismiss={closeEditModal}
        />
      )}
    </div>
  )
}
