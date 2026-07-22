import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronDown,
  Info,
  Search,
  X,
} from 'lucide-react'
import {
  academicYears,
  calendarYears,
  concentrations,
  programTypes,
  programs,
} from '../data/setupOptions'
import { emptyStudentSetupProfile, type StudentSetupProfile } from '../types/studentProfile'

interface Option {
  value: string
  label: string
}

function FormSelect({
  id,
  label,
  value,
  options,
  placeholder,
  onChange,
  error,
  required,
}: {
  id: string
  label: string
  value: string
  options: Option[]
  placeholder: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={[
            'w-full cursor-pointer appearance-none rounded-md border bg-card px-3 py-2.5 pr-9 font-body text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
            error
              ? 'border-destructive bg-red-50'
              : value
                ? 'border-border text-foreground'
                : 'border-border text-muted-foreground',
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
        <ChevronDown
          size={14}
          className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${
            error ? 'text-destructive' : 'text-muted-foreground'
          }`}
        />
      </div>
      {error && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
/* date saved as string in YYYY-MM-DD format to match the HTML date input value format */
function FormDateInput({ 
  id,
  label,
  value,
  onChange,
  error,
  required,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={[
          'w-full rounded-md border bg-card px-3 py-2.5 font-body text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          error
            ? 'border-destructive bg-red-50'
            : value
              ? 'border-border text-foreground'
              : 'border-border text-muted-foreground',
        ].join(' ')}
      />
      {error && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

function SegmentedControl({
  label,
  options,
  value,
  onChange,
  columns,
  required,
}: {
  label: string
  options: Option[]
  value: string
  onChange: (value: string) => void
  columns?: number
  required?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      <div
        className={`grid gap-1.5 rounded-lg bg-muted p-1 ${
          columns === 5 ? 'grid-cols-5' : 'grid-cols-2'
        }`}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={[
              'flex-1 rounded-md px-3 py-2 font-body text-sm font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              value === option.value
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-card hover:text-foreground',
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function ConcentrationSelect({
  value,
  options,
  onChange,
  error,
  required,
  disabled,
}: {
  value: string
  options: Option[]
  onChange: (value: string) => void
  error?: string
  required?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = options.find((option) => option.value === value)
  const filtered = options.filter((option) =>
    option.label.toLowerCase().includes(query.toLowerCase()),
  )

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const select = (optionValue: string) => {
    onChange(optionValue)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="flex flex-col gap-1.5" ref={containerRef}>
      <label className="text-sm font-semibold text-foreground">
        Area of Concentration
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (disabled) return
            setOpen(true)
            setTimeout(() => inputRef.current?.focus(), 0)
          }}
          className={[
            'flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-left font-body text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
            disabled
              ? 'cursor-not-allowed border-border bg-muted opacity-50'
              : error
                ? 'cursor-pointer border-destructive bg-red-50'
                : open
                  ? 'border-ring bg-card ring-2 ring-ring ring-offset-1'
                  : 'cursor-pointer border-border bg-card hover:border-ring/50',
          ].join(' ')}
        >
          <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
            {selected?.label ?? (disabled ? 'Select a program first' : 'Search concentrations…')}
          </span>
          <div className="ml-2 flex flex-shrink-0 items-center gap-1">
            {selected && !disabled && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  onChange('')
                  setOpen(false)
                }}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={12} />
              </span>
            )}
            <ChevronDown
              size={14}
              className={`transition-transform duration-150 ${open ? 'rotate-180' : ''} ${
                error ? 'text-destructive' : 'text-muted-foreground'
              }`}
            />
          </div>
        </button>
        {open && (
          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search size={12} className="flex-shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setOpen(false)
                  if (e.key === 'Enter' && filtered.length === 1) select(filtered[0].value)
                }}
                placeholder="Type to filter…"
                className="flex-1 bg-transparent font-body text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <ul className="max-h-48 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2.5 text-sm text-muted-foreground">No results</li>
              ) : (
                filtered.map((option) => (
                  <li
                    key={option.value}
                    role="option"
                    aria-selected={value === option.value}
                    onClick={() => select(option.value)}
                    className={[
                      'flex cursor-pointer items-center justify-between px-3 py-2.5 text-sm transition-colors',
                      value === option.value
                        ? 'bg-accent font-medium text-accent-foreground'
                        : 'text-foreground hover:bg-secondary',
                    ].join(' ')}
                  >
                    {option.label}
                    {value === option.value && (
                      <Check size={13} className="flex-shrink-0 text-primary" />
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
      {error && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

const programOptions: Option[] = programs.map((program) => ({
  value: program.code,
  label: program.name,
}))
const concentrationOptions: Option[] = concentrations.map((concentration) => ({
  value: concentration.optionId,
  label: concentration.name,
}))
const programTypeOptions: Option[] = programTypes.map((type) => ({ value: type, label: type }))
const academicYearOptions: Option[] = academicYears.map((year) => ({
  value: String(year.value),
  label: year.label,
}))
const calendarYearOptions: Option[] = calendarYears.map((year) => ({ value: year, label: year }))

const REQUIRED_FIELD_COUNT = 6

function isProfileComplete(profile: StudentSetupProfile) {
  return (
    !!profile.calendar_year &&
    !!profile.program &&
    !!profile.program_type &&
    !!profile.option_id &&
    !!profile.academic_year &&
    !!profile.start_date
  )
}

export default function SetupScreen({
  onComplete,
}: {
  onComplete?: (profile: StudentSetupProfile) => void
}) {
  const [profile, setProfile] = useState<StudentSetupProfile>(emptyStudentSetupProfile)
  const [touched, setTouched] = useState({
    calendar_year: false,
    option_id: false,
    start_date: false,
  })

  const set = <K extends keyof StudentSetupProfile>(key: K, value: StudentSetupProfile[K]) =>
    setProfile((prev) => ({ ...prev, [key]: value }))

  const complete = isProfileComplete(profile)
  const completedCount = [
    profile.calendar_year,
    profile.program,
    profile.program_type,
    profile.option_id,
    profile.academic_year,
    profile.start_date,
  ].filter(Boolean).length

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="w-full border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-primary">
            <BookOpen size={17} className="text-primary-foreground" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight text-foreground">
              ENSC Degree Auditor
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Plan your courses and review your degree progress
            </p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-[700px]">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-foreground">Set up your student profile</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Select your program details to load the correct degree requirements and calendar
              rules.
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
            <div className="flex items-center justify-between border-b border-border px-6 py-3.5">
              <span className="font-heading text-sm font-semibold text-foreground">
                Program Details
              </span>
              <span className="text-xs text-muted-foreground">All fields required</span>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <FormSelect
                  id="calendar-year"
                  label="Calendar Year"
                  value={profile.calendar_year}
                  options={calendarYearOptions}
                  placeholder="Select calendar year…"
                  onChange={(value) => {
                    set('calendar_year', value as StudentSetupProfile['calendar_year'])
                    setTouched((prev) => ({ ...prev, calendar_year: true }))
                  }}
                  error={
                    touched.calendar_year && !profile.calendar_year
                      ? 'Please select a calendar year.'
                      : undefined
                  }
                  required
                />
                <FormSelect
                  id="program"
                  label="Program"
                  value={profile.program}
                  options={programOptions}
                  placeholder="Select program…"
                  onChange={(value) => set('program', value as StudentSetupProfile['program'])}
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <FormDateInput
                  id="start-date"
                  label="Approximate Program Start Date"
                  value={profile.start_date}
                  onChange={(value) => {
                    set('start_date', value)
                    setTouched((prev) => ({ ...prev, start_date: true }))
                  }}
                  error={
                    touched.start_date && !profile.start_date
                      ? 'Please enter an approximate start date.'
                      : undefined
                  }
                  required
                />
              </div>

              <SegmentedControl
                label="Program Type"
                options={programTypeOptions}
                value={profile.program_type}
                onChange={(value) =>
                  set('program_type', value as StudentSetupProfile['program_type'])
                }
                required
              />

              <ConcentrationSelect
                value={profile.option_id}
                options={concentrationOptions}
                onChange={(value) => {
                  set('option_id', value as StudentSetupProfile['option_id'])
                  setTouched((prev) => ({ ...prev, option_id: true }))
                }}
                error={
                  touched.option_id && !profile.option_id
                    ? 'Please select an area of concentration.'
                    : undefined
                }
                required
                disabled={!profile.program}
              />

              <div className="border-t border-border" />

              <SegmentedControl
                label="Current Academic Year"
                options={academicYearOptions}
                value={String(profile.academic_year)}
                onChange={(value) =>
                  set('academic_year', Number(value) as StudentSetupProfile['academic_year'])
                }
                columns={5}
                required
              />

              <div className="flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{
                      width: `${Math.round((completedCount / REQUIRED_FIELD_COUNT) * 100)}%`,
                    }}
                  />
                </div>
                <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
                  {completedCount}/{REQUIRED_FIELD_COUNT} fields
                </span>
              </div>

              <div className="flex flex-col items-center gap-3 pt-1 sm:flex-row">
                <button
                  type="button"
                  disabled={!complete}
                  onClick={() => {
                    setTouched({ calendar_year: true, option_id: true, start_date: true })
                    if (complete) onComplete?.(profile)
                  }}
                  className={[
                    'flex w-full items-center justify-center gap-2 rounded-md px-6 py-3 font-heading text-sm font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto sm:min-w-[220px]',
                    complete
                      ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98]'
                      : 'cursor-not-allowed bg-muted text-muted-foreground',
                  ].join(' ')}
                >
                  Create My Course Plan
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-border bg-accent/40 p-4">
            <div className="flex items-start gap-3">
              <Info size={14} className="mt-0.5 flex-shrink-0 text-primary" />
              <div className="space-y-1.5">
                <p className="font-heading text-xs font-semibold uppercase tracking-wider text-foreground">
                  Before you begin
                </p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {[
                    'The calendar year determines which degree requirements, credit totals, and promotion rules are applied to your plan.',
                    'On the next screen you can add completed, in-progress, and planned courses to build your full course timeline.',
                    'This tool is an early planning prototype and is not an official UBC graduation clearance or audit system.',
                  ].map((text) => (
                    <li key={text} className="flex items-start gap-2">
                      <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-muted-foreground" />
                      {text}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            ENSC Degree Auditor · University of British Columbia ·{' '}
            <em>Not an official UBC system</em>
          </p>
        </div>
      </main>
    </div>
  )
}
