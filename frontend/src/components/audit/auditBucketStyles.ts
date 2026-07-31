// Shared presentation config for specialization requirement groups. Intended
// to be reused later by the course-allocation table via allocationBucketAliases.

export type SpecializationGroupKey = 'core' | 'concentration' | 'tools' | 'complementary' | 'electives'

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
    headerBgClassName: 'bg-gray-50',
    headerTextClassName: 'text-gray-800',
    accentClassName: 'border-gray-200',
    badgeClassName: 'bg-gray-100 text-gray-700',
  },
]

// Neutral styling applied to a requirement_area that doesn't match any known
// bucket alias, so unexpected data still renders instead of being discarded.
export const UNKNOWN_BUCKET_STYLE: Omit<BucketStyle, 'key' | 'label' | 'requirementAreaAliases'> = {
  allocationBucketAliases: [],
  headerBgClassName: 'bg-muted/40',
  headerTextClassName: 'text-foreground',
  accentClassName: 'border-border',
  badgeClassName: 'bg-muted text-muted-foreground',
}

export function findBucketStyleForRequirementArea(area: string): BucketStyle | undefined {
  return BUCKET_STYLES.find((bucket) => bucket.requirementAreaAliases.includes(area))
}
