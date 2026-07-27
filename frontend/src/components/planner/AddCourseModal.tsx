import { forwardRef, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type {
  CourseAttempt,
  PlannerTerm,
  PlannerYear,
  StoredCourseGrade,
  StoredCourseStatus,
} from '../../types/coursePlan'

const YEAR_OPTIONS: { value: PlannerYear; label: string }[] = [
  { value: 1, label: 'Year 1' },
  { value: 2, label: 'Year 2' },
  { value: 3, label: 'Year 3' },
  { value: 4, label: 'Year 4' },
  { value: 5, label: 'Year 5+' },
]

const TERM_OPTIONS: { value: PlannerTerm; label: string }[] = [
  { value: 'winter_1', label: 'Winter Term 1' },
  { value: 'winter_2', label: 'Winter Term 2' },
  { value: 'summer', label: 'Summer' },
]

const STATUS_OPTIONS: { value: StoredCourseStatus; label: string }[] = [
  { value: 'completed', label: 'Taken' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'planned', label: 'Planned' },
]

const GRADE_OPTIONS: { value: StoredCourseGrade; label: string }[] = [
  { value: 'P', label: 'Pass' },
  { value: 'F', label: 'Fail' },
  { value: 'W', label: 'Withdrawn' },
]

const ModalSelect = forwardRef<
  HTMLSelectElement,
  {
    id: string
    label: string
    value: string
    onChange: (value: string) => void
    onBlur?: () => void
    options: { value: string; label: string }[]
    placeholder: string
    error?: string
    disabled?: boolean
    required?: boolean
  }
>(function ModalSelect(
  { id, label, value, onChange, onBlur, options, placeholder, error, disabled, required },
  ref,
) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[11px] font-semibold text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      <select
        ref={ref}
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={[
          'w-full rounded-md border bg-card px-2.5 py-2 text-xs text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          disabled ? 'cursor-not-allowed bg-muted text-muted-foreground' : 'cursor-pointer',
          error ? 'border-destructive' : 'border-border',
        ].join(' ')}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  )
})

export default function EditCourseModal({
  attempt,
  onConfirm,
  onDismiss,
}: {
  attempt: CourseAttempt
  onConfirm: (attempt: CourseAttempt) => void
  onDismiss: () => void
}) {
  const [year, setYear] = useState<PlannerYear>(attempt.year_taken)
  const [term, setTerm] = useState<PlannerTerm>(attempt.term_taken)
  const [status, setStatus] = useState<StoredCourseStatus | ''>(attempt.status)
  const [grade, setGrade] = useState<StoredCourseGrade>(attempt.grade)
  const [touched, setTouched] = useState({ status: false, grade: false })
  const firstFieldRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    setYear(attempt.year_taken)
    setTerm(attempt.term_taken)
    setStatus(attempt.status)
    setGrade(attempt.grade)
    setTouched({ status: false, grade: false })
    const timer = setTimeout(() => firstFieldRef.current?.focus(), 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt.attempt_id])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onDismiss])

  const gradeRequired = status === 'completed'
  const valid = !!year && !!term && !!status && (!gradeRequired || !!grade)

  const handleStatusChange = (value: string) => {
    const nextStatus = value as StoredCourseStatus
    setStatus(nextStatus)
    if (nextStatus !== 'completed') setGrade('')
  }

  const handleConfirm = () => {
    if (!valid || !status) return
    onConfirm({
      ...attempt,
      status,
      grade,
      percentage: null,
      year_taken: year,
      term_taken: term,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4"
      onClick={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-course-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="mb-1 flex items-start justify-between">
          <h3
            id="edit-course-modal-title"
            className="font-heading text-sm font-bold text-foreground"
          >
            Edit course
          </h3>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={15} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {attempt.display_code} · {attempt.credits} cr
        </p>
        <p className="mt-2 text-xs text-foreground/80">{attempt.course_title}</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <ModalSelect
            ref={firstFieldRef}
            id="edit-course-year"
            label="Year"
            value={String(year)}
            onChange={(value) => setYear(Number(value) as PlannerYear)}
            options={YEAR_OPTIONS.map((option) => ({
              value: String(option.value),
              label: option.label,
            }))}
            placeholder="Select year…"
            required
          />
          <ModalSelect
            id="edit-course-term"
            label="Term"
            value={term}
            onChange={(value) => setTerm(value as PlannerTerm)}
            options={TERM_OPTIONS}
            placeholder="Select term…"
            required
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <ModalSelect
            id="edit-course-status"
            label="Status"
            value={status}
            onChange={handleStatusChange}
            onBlur={() => setTouched((prev) => ({ ...prev, status: true }))}
            options={STATUS_OPTIONS}
            placeholder="Select status…"
            error={touched.status && !status ? 'Please select a status.' : undefined}
            required
          />
          <ModalSelect
            id="edit-course-grade"
            label="Grade"
            value={grade}
            onChange={(value) => setGrade(value as StoredCourseGrade)}
            onBlur={() => setTouched((prev) => ({ ...prev, grade: true }))}
            options={GRADE_OPTIONS}
            placeholder="Select grade…"
            disabled={!gradeRequired}
            error={
              touched.grade && gradeRequired && !grade ? 'Please select a grade.' : undefined
            }
            required={gradeRequired}
          />
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={handleConfirm}
            className={[
              'flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors',
              valid
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'cursor-not-allowed bg-muted text-muted-foreground',
            ].join(' ')}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
