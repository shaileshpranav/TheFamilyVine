import type { Schemas } from '../api/client'

export type EventType = Schemas['EventType']
export type PartnerStatus = Schemas['PartnerStatus']
export type RelativeRelation = Schemas['RelativeOut']['relation']
export type NewRelation = Schemas['RelativeLink']['relation']

export const PERSON_EVENT_TYPES: { type: EventType; label: string; placeholder: string }[] = [
  { type: 'birth', label: 'Birth', placeholder: '' },
  { type: 'baptism', label: 'Baptism', placeholder: '' },
  { type: 'education', label: 'Education', placeholder: 'B.A. Architecture' },
  { type: 'occupation', label: 'Work', placeholder: 'Founded Hollis & Co.' },
  { type: 'residence', label: 'Move', placeholder: 'Moved to Seattle' },
  { type: 'emigration', label: 'Emigration', placeholder: 'Emigrated to the United States' },
  { type: 'immigration', label: 'Immigration', placeholder: '' },
  { type: 'military', label: 'Military service', placeholder: 'Royal Navy' },
  { type: 'retirement', label: 'Retirement', placeholder: '' },
  { type: 'death', label: 'Death', placeholder: '' },
  { type: 'burial', label: 'Burial', placeholder: '' },
  { type: 'other', label: 'Something else', placeholder: 'Opened the family bakery' },
]

export const FAMILY_EVENT_TYPES: { type: EventType; label: string; placeholder: string }[] = [
  { type: 'engagement', label: 'Engagement', placeholder: '' },
  { type: 'marriage', label: 'Marriage', placeholder: '' },
  { type: 'separation', label: 'Separation', placeholder: '' },
  { type: 'divorce', label: 'Divorce', placeholder: '' },
  { type: 'other', label: 'Something else', placeholder: 'Renewed their vows' },
]

export const STATUS_LABEL: Record<PartnerStatus, string> = {
  together: 'Together',
  separated: 'Separated',
  divorced: 'Divorced',
}

/** How relatives are grouped on a profile, in order. Half-siblings sit with siblings. */
export const RELATIVE_GROUPS: { label: string; relations: RelativeRelation[] }[] = [
  { label: 'Parents', relations: ['parent'] },
  { label: 'Step-parents', relations: ['step_parent'] },
  { label: 'Partners', relations: ['partner'] },
  { label: 'Siblings', relations: ['sibling', 'half_sibling'] },
  { label: 'Step-siblings', relations: ['step_sibling'] },
  { label: 'Children', relations: ['child'] },
  { label: 'Step-children', relations: ['step_child'] },
]

export const ADD_RELATION: Record<NewRelation, { label: string; hint: string; blended: boolean }> = {
  partner: { label: 'Partner', hint: 'Spouse or life partner', blended: false },
  parent: { label: 'Parent', hint: 'Mother or father', blended: false },
  child: { label: 'Child', hint: 'Son or daughter', blended: false },
  sibling: { label: 'Sibling', hint: 'Brother or sister', blended: false },
  step_parent: { label: 'Step-parent', hint: 'A parent’s partner', blended: true },
  step_child: { label: 'Step-child', hint: 'A partner’s child', blended: true },
  step_sibling: { label: 'Step-sibling', hint: 'A step-parent’s child', blended: true },
}

export const FAVORITE_CATEGORIES = ['Food', 'Film', 'Music', 'Hobby', 'Book', 'Place', 'Sport']

const PLATFORMS: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)facebook\.com$/, 'Facebook'],
  [/(^|\.)linkedin\.com$/, 'LinkedIn'],
  [/(^|\.)(x|twitter)\.com$/, 'X'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)youtube\.com$/, 'YouTube'],
  [/(^|\.)github\.com$/, 'GitHub'],
]

/** The link's label, or the platform it's on, or its site name. */
export function linkLabel(url: string, label?: string): string {
  if (label) return label
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return PLATFORMS.find(([re]) => re.test(host))?.[1] ?? 'Website'
  } catch {
    return 'Link'
  }
}

/** Short text for a link: "@elliehollis" for social profiles, the site name otherwise. */
export function linkText(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const path = u.pathname.replace(/\/+$/, '')
    const handle = path.split('/').filter(Boolean).pop()
    if (handle && /(instagram|tiktok|x|twitter)\.com$/.test(host)) return `@${handle.replace(/^@/, '')}`
    if (handle && /(linkedin|github|facebook)\.com$/.test(host)) return handle
    return host + (path && path !== '/' ? path : '')
  } catch {
    return url
  }
}
