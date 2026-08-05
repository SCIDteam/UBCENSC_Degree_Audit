import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { academicYears, concentrations, programs } from '../data/setupOptions'
import type { StudentSetupProfile } from '../types/studentProfile'
import type { AuditInput, AuditResult } from '../types/audit'
import FacultyRequirements from '../components/audit/FacultyRequirements'
import SpecializationRequirements from '../components/audit/SpecializationRequirements'
import PromotionRequirements from '../components/audit/PromotionRequirements'
import CourseAllocationTable from '../components/audit/CourseAllocationTable'

type AuditTab = 'faculty' | 'specialization' | 'promotion' | 'allocation'

const AUDIT_TABS: { id: AuditTab; label: string }[] = [
  { id: 'faculty', label: 'Faculty' },
  { id: 'specialization', label: 'Specialization' },
  { id: 'promotion', label: 'Promotion' },
  { id: 'allocation', label: 'Course Allocation' },
]

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

function OverviewCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-card">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-heading mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  )
}

function SidebarRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

interface AuditScreenProps {
  profile: StudentSetupProfile
  auditInput: AuditInput
  auditResult: AuditResult
  onEditPlan: () => void
}

export default function AuditScreen({ profile, auditResult, onEditPlan }: AuditScreenProps) {
  const [activeTab, setActiveTab] = useState<AuditTab>('faculty')

  const { case_summary } = auditResult
  const { faculty, specialization, promotion } = case_summary

  const requirementsNeedingAttention =
    faculty.partial + faculty.missing + specialization.partial + specialization.missing

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
            <HeaderBadge>Audit: {case_summary.audit_mode}</HeaderBadge>
          </div>
          <div className="ml-auto hidden flex-shrink-0 items-center gap-1.5 sm:flex">
            <button
              type="button"
              onClick={onEditPlan}
              className="rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Edit Course Plan
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-w-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 pb-20 lg:pb-4">
          <div className="rounded-md border border-border bg-muted px-3 py-2 text-[11px] text-foreground">
            This audit is generated from your course plan for prototype purposes only and is not an
            official degree audit. Confirm all graduation decisions with an academic advisor.
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <OverviewCard label="Faculty" value={`${faculty.satisfied} of ${faculty.total}`} />
            <OverviewCard
              label="Specialization"
              value={`${specialization.satisfied} of ${specialization.total}`}
            />
            <OverviewCard label="Promotion" value={promotion.message} />
          </div>

          <div className="text-[11px] text-muted-foreground">
            Counted credits: <span className="font-medium text-foreground">{case_summary.counted_credits}</span>
          </div>

          <div className="rounded-xl border border-border bg-card shadow-card">
            <div role="tablist" aria-label="Audit result category" className="flex border-b border-border">
              {AUDIT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`font-heading flex-1 px-3 py-2.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                    activeTab === tab.id
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div role="tabpanel" className="p-4">
              {activeTab === 'faculty' ? (
                <FacultyRequirements auditResult={auditResult} />
              ) : activeTab === 'specialization' ? (
                <SpecializationRequirements auditResult={auditResult} />
              ) : activeTab === 'promotion' ? (
                <PromotionRequirements auditResult={auditResult} />
              ) : (
                <CourseAllocationTable auditResult={auditResult} />
              )}
            </div>
          </div>
        </main>

        <aside className="hidden w-64 flex-shrink-0 overflow-y-auto border-l border-border bg-card p-4 lg:block">
          <div className="font-heading mb-2 text-xs font-semibold text-foreground">Summary</div>
          <SidebarRow label="Faculty" value={`${faculty.satisfied} / ${faculty.total}`} />
          <SidebarRow label="Specialization" value={`${specialization.satisfied} / ${specialization.total}`} />
          <SidebarRow label="Needs attention" value={requirementsNeedingAttention} />
          <SidebarRow label="Counted credits" value={case_summary.counted_credits} />
          <SidebarRow label="Free elective credits" value={case_summary.free_elective_credits} />
          <SidebarRow label="Other-faculty capacity left" value={case_summary.remaining_other_faculty_capacity} />
          <div className="mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground">
            {promotion.message}
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 flex-shrink-0 border-t border-border bg-card p-2 sm:hidden">
        <button
          type="button"
          onClick={onEditPlan}
          className="font-heading w-full rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
        >
          Edit Course Plan
        </button>
      </div>
    </div>
  )
}
