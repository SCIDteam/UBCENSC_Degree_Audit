// Shared presentation config for specialization requirement groups. Intended
// to be reused later by the course-allocation table via allocationBucketAliases.

export type SpecializationGroupKey = 'core' | 'concentration' | 'tools' | 'complementary' | 'electives' | 'excluded'

export interface BucketStyle {
  key: SpecializationGroupKey
  label: string
  requirementAreaAliases: string[]
  allocationBucketAliases: string[]
  headerBgClassName: string
  headerTextClassName: string
  accentClassName: string
  badgeClassName: string
}

// Approved display order for known specialization groups. Only groups
// actually present in a given AuditResult are rendered by the consumer.
export const BUCKET_STYLES: BucketStyle[] = [
  {
    key: 'core',
    label: 'Core Requirements',
    requirementAreaAliases: ['Core Requirement'],
    allocationBucketAliases: ['core'],
    headerBgClassName: 'bg-blue-50',
    headerTextClassName: 'text-blue-800',
    accentClassName: 'border-blue-200',
    badgeClassName: 'bg-blue-100 text-blue-700',
  },
  {
    key: 'concentration',
    label: 'Area of Concentration',
    requirementAreaAliases: ['Area of Concentration'],
    allocationBucketAliases: ['option', 'concentration'],
    headerBgClassName: 'bg-green-50',
    headerTextClassName: 'text-green-800',
    accentClassName: 'border-green-200',
    badgeClassName: 'bg-green-100 text-green-700',
  },
  {
    key: 'tools',
    label: 'Tools Elective',
    requirementAreaAliases: ['Tools Elective'],
    allocationBucketAliases: ['tools'],
    headerBgClassName: 'bg-purple-50',
    headerTextClassName: 'text-purple-800',
    accentClassName: 'border-purple-200',
    badgeClassName: 'bg-purple-100 text-purple-700',
  },
  {
    key: 'complementary',
    label: 'Complementary Studies',
    requirementAreaAliases: ['Complementary Studies'],
    allocationBucketAliases: ['complementary'],
    headerBgClassName: 'bg-teal-50',
    headerTextClassName: 'text-teal-800',
    accentClassName: 'border-teal-200',
    badgeClassName: 'bg-teal-100 text-teal-700',
  },
  {
    key: 'electives',
    label: 'Electives',
    requirementAreaAliases: ['Electives'],
    allocationBucketAliases: ['electives'],
    headerBgClassName: 'bg-yellow-50',
    headerTextClassName: 'text-yellow-800',
    accentClassName: 'border-yellow-200',
    badgeClassName: 'bg-yellow-100 text-yellow-700',
  },
  {
    key: 'excluded',
    label: 'Excluded / Not Counted',
    requirementAreaAliases: [],
    allocationBucketAliases: ['not_counted_status', 'excluded', 'unallocated'],
    headerBgClassName: 'bg-orange-50',
    headerTextClassName: 'text-orange-800',
    accentClassName: 'border-orange-200',
    badgeClassName: 'bg-orange-100 text-orange-700',
  },
]

// Neutral styling applied to a requirement_area that doesn't match any known
// bucket alias, so unexpected data still renders instead of being discarded.
export const UNKNOWN_BUCKET_STYLE: Omit<BucketStyle, 'key' | 'label' | 'requirementAreaAliases'> = {
  allocationBucketAliases: [],
  headerBgClassName: 'bg-orange-50',
  headerTextClassName: 'text-orange-800',
  accentClassName: 'border-orange-200',
  badgeClassName: 'bg-orange-100 text-orange-700',
}

export function findBucketStyleForRequirementArea(area: string): BucketStyle | undefined {
  return BUCKET_STYLES.find((bucket) => bucket.requirementAreaAliases.includes(area))
}

// Resolves a raw course_allocations[].bucket value to its shared presentation
// style. Unknown raw values return undefined so callers can fall back to
// UNKNOWN_BUCKET_STYLE with a derived label instead of discarding the row.
export function findBucketStyleForAllocationBucket(rawBucket: string): BucketStyle | undefined {
  return BUCKET_STYLES.find((bucket) => bucket.allocationBucketAliases.includes(rawBucket))
}

// Humanizes an unrecognized raw bucket value (e.g. "special_case") into a
// readable label (e.g. "Special case") for display without inventing meaning.
export function humanizeUnknownBucket(rawBucket: string): string {
  const words = rawBucket.replace(/[_-]+/g, ' ').trim().toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
