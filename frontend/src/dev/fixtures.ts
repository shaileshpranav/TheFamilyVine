/**
 * Sample data for preview mode: the Hollis family from the Claude Design prototype, plus an
 * empty second tree for checking empty states. Typed against the generated API schema so it
 * stays in step with the real responses. Relatives and timelines are derived here the same
 * way the API derives them (app/kinship.py, app/timeline.py), in simplified form.
 */
import type { Role, Schemas } from '../api/client'
import { dateLabel, dateShort } from '../lib/dates'

type Person = Schemas['PersonOut']
type PersonDetail = Schemas['PersonDetailOut']
type FuzzyDate = Schemas['FuzzyDate']
type FuzzyDateOut = Schemas['FuzzyDateOut']
type EventType = Schemas['EventType']
type PartnerStatus = Schemas['PartnerStatus']
type Relative = Schemas['RelativeOut']
type TimelineItem = Schemas['TimelineItem']

const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()
const ahead = (days: number) => new Date(Date.now() + days * DAY).toISOString()
const RANK: Record<Role, number> = { personal: 1, contributor: 2, admin: 3, owner: 4 }

function fd(d: FuzzyDate): FuzzyDateOut {
  return {
    qualifier: d.qualifier ?? 'exact',
    year: d.year ?? null,
    month: d.month ?? null,
    day: d.day ?? null,
    year2: d.year2 ?? null,
    month2: d.month2 ?? null,
    day2: d.day2 ?? null,
    phrase: d.phrase ?? '',
    label: dateLabel(d),
    short: dateShort(d),
  }
}
const sortKey = (d?: FuzzyDate | null) => (d?.year ? d.year * 10000 + (d.month ?? 1) * 100 + (d.day ?? 1) : Infinity)

const ME: Schemas['UserOut'] = {
  id: 'u-ellie',
  email: 'ellie.hollis@example.com',
  display_name: 'Ellie Hollis',
  avatar_url: null,
}

const USERS: Record<string, Schemas['UserOut']> = {
  ellie: ME,
  margaret: { id: 'u-margaret', email: 'margaret.hollis@example.com', display_name: 'Margaret Hollis', avatar_url: null },
  tom: { id: 'u-tom', email: 'tom.hollis@example.com', display_name: 'Tom Hollis', avatar_url: null },
  grace: { id: 'u-grace', email: 'grace.lane@example.com', display_name: 'Grace Lane', avatar_url: null },
  marco: { id: 'u-marco', email: 'marco.russo@example.com', display_name: 'Marco Russo', avatar_url: null },
  priya: { id: 'u-priya', email: 'priya.raman@example.com', display_name: 'Priya Raman', avatar_url: null },
}

interface SeedEvent {
  type: EventType
  title?: string
  date?: FuzzyDate
  place?: string
  description?: string
}

interface Seed {
  id: string
  given: string
  surname: string
  birthSurname?: string
  nickname?: string
  sex: Schemas['Sex']
  living: boolean
  bio: string
  addedDaysAgo: number
  user?: string
  born?: SeedEvent
  died?: SeedEvent
  events?: SeedEvent[]
  occupation?: string
  nationality?: string
  education?: string
  links?: string[]
  vehicles?: string[]
  pets?: [string, string][]
  favorites?: [string, string][]
}

const HOLLIS: Seed[] = [
  {
    id: 'arthur', given: 'Arthur', surname: 'Lane', sex: 'male', living: false, addedDaysAgo: 62,
    bio: 'Emigrated from Leeds in 1955 and met Beatrice at a church social the year he arrived. Built boats for forty years.',
    born: { type: 'birth', date: { year: 1931, month: 1, day: 9 }, place: 'Leeds, England' },
    died: { type: 'death', date: { year: 2009, month: 11 }, place: 'Portland, Oregon' },
    events: [{ type: 'emigration', title: 'Emigrated to the United States', date: { year: 1955 } }],
    occupation: 'Shipwright', nationality: 'British-American', education: 'Leeds Trade School',
    vehicles: ['1962 Ford Falcon'], pets: [['Duke', 'Border Collie']],
    favorites: [['Food', 'Sunday roast'], ['Film', 'The Third Man'], ['Music', 'Big band'], ['Hobby', 'Model ships']],
  },
  {
    id: 'beatrice', given: 'Beatrice', surname: 'Lane', birthSurname: 'Byrne', sex: 'female', living: false, addedDaysAgo: 62,
    bio: 'Opened the family bakery on Warren Street and ran it for thirty-eight years.',
    born: { type: 'birth', date: { year: 1934, month: 2, day: 2 }, place: 'Cork, Ireland' },
    died: { type: 'death', date: { year: 2019, month: 4 }, place: 'Portland, Oregon' },
    events: [{ type: 'other', title: 'Opened the family bakery', date: { year: 1960 }, place: 'Warren Street, Boston' }],
    occupation: 'Baker and shop owner', nationality: 'Irish-American', education: 'Cork Technical College',
    pets: [['Marmalade', 'Cat']],
    favorites: [['Food', 'Soda bread'], ['Film', 'Roman Holiday'], ['Music', 'Irish folk'], ['Hobby', 'Gardening']],
  },
  {
    id: 'margaret', given: 'Margaret', surname: 'Hollis', birthSurname: 'Lane', sex: 'female', living: true, addedDaysAgo: 48, user: 'margaret',
    bio: 'A schoolteacher for three decades, and keeper of every family recipe and photograph.',
    born: { type: 'birth', date: { year: 1957, month: 9, day: 4 }, place: 'Boston, Massachusetts' },
    occupation: 'Schoolteacher, retired', nationality: 'American', education: 'B.Ed, Boston College',
    links: ['https://facebook.com/margaret.hollis'], vehicles: ['2016 Volvo V60'], pets: [['Biscuit', 'Beagle']],
    favorites: [['Food', 'Clam chowder'], ['Film', 'Out of Africa'], ['Music', 'Motown'], ['Hobby', 'Quilting']],
  },
  {
    id: 'james', given: 'James', surname: 'Hollis', sex: 'male', living: true, addedDaysAgo: 48,
    bio: 'Founded a small carpentry workshop and built the dining table the family still gathers at.',
    born: { type: 'birth', date: { year: 1955, month: 8, day: 3 }, place: 'Chicago, Illinois' },
    events: [{ type: 'occupation', title: 'Founded Hollis & Co.', date: { year: 1990 }, place: 'Portland, Oregon' }],
    occupation: 'Carpenter, Hollis & Co.', nationality: 'American', education: 'Apprenticeship, Chicago',
    links: ['https://hollisandco.com'], vehicles: ['1998 Ford F-150'],
    favorites: [['Food', 'Deep-dish pizza'], ['Film', 'The Sting'], ['Music', 'Chicago blues'], ['Hobby', 'Woodturning']],
  },
  {
    id: 'david', given: 'David', surname: 'Lane', sex: 'male', living: true, addedDaysAgo: 31,
    bio: 'Moved west for the mountains and never looked back.',
    born: { type: 'birth', date: { year: 1961, month: 6, day: 1 }, place: 'Boston, Massachusetts' },
    events: [{ type: 'residence', title: 'Moved west for the mountains', date: { year: 1985 }, place: 'Boulder, Colorado' }],
    occupation: 'Mountain guide', nationality: 'American', education: 'B.S. Geology, University of Colorado',
    links: ['https://instagram.com/davidlane.alpine'], vehicles: ['2019 Toyota Tacoma'], pets: [['Scout', 'Husky']],
    favorites: [['Food', 'Campfire chili'], ['Film', 'Into the Wild'], ['Music', 'Bluegrass'], ['Hobby', 'Alpine climbing']],
  },
  {
    id: 'susan', given: 'Susan', surname: 'Lane', birthSurname: 'Park', sex: 'female', living: true, addedDaysAgo: 31,
    bio: 'A watercolourist whose paintings hang in three of the family homes. Raised Grace from the age of seven.',
    born: { type: 'birth', date: { year: 1964, month: 10, day: 8 }, place: 'Denver, Colorado' },
    events: [{ type: 'residence', date: { year: 2001 }, place: 'Seattle, Washington' }],
    occupation: 'Watercolour painter', nationality: 'American', education: 'BFA, Rhode Island School of Design',
    links: ['https://instagram.com/susanpaints', 'https://susanlane.art'], vehicles: ['2014 Subaru Forester'],
    pets: [['Inkwell', 'Cat']],
    favorites: [['Food', 'Pad thai'], ['Film', 'Amélie'], ['Music', 'Jazz standards'], ['Hobby', 'Plein-air painting']],
  },
  {
    id: 'ellie', given: 'Ellie', surname: 'Hollis', sex: 'female', living: true, addedDaysAgo: 63, user: 'ellie',
    bio: 'Author and professor, and the one gathering all of these stories into one place.',
    born: { type: 'birth', date: { year: 1989, month: 3, day: 3 }, place: 'Portland, Oregon' },
    events: [{ type: 'education', title: 'B.A. Architecture', date: { year: 2012, month: 6 }, place: 'Eugene, Oregon' }],
    occupation: 'Author and professor', nationality: 'American', education: 'MFA Creative Writing, University of Iowa',
    links: ['https://instagram.com/elliehollis', 'https://linkedin.com/in/ellie-hollis', 'https://elliehollis.com'],
    vehicles: ['2021 Subaru Outback'], pets: [['Pixel', 'Golden Retriever'], ['Bug', 'Cat']],
    favorites: [['Food', 'Thai green curry'], ['Film', 'Eternal Sunshine of the Spotless Mind'], ['Music', 'Indie folk'], ['Hobby', 'Writing and book collecting']],
  },
  {
    id: 'tom', given: 'Tom', surname: 'Hollis', nickname: 'Tommy', sex: 'male', living: true, addedDaysAgo: 12, user: 'tom',
    bio: 'Touring musician. Sends postcards from every city and rarely a phone number.',
    born: { type: 'birth', date: { year: 1992, month: 4, day: 11 }, place: 'Portland, Oregon' },
    events: [
      { type: 'occupation', title: 'Started touring', date: { year: 2014 } },
      { type: 'other', title: 'Released his first album', date: { year: 2020, month: 5 } },
    ],
    occupation: 'Musician and songwriter', nationality: 'American', education: 'Berklee College of Music',
    links: ['https://instagram.com/tomhollismusic', 'https://tomhollis.band'], vehicles: ['1994 VW Transporter'],
    favorites: [['Food', 'Late-night ramen'], ['Film', 'Almost Famous'], ['Music', 'Alt-country'], ['Hobby', 'Vinyl hunting']],
  },
  {
    id: 'grace', given: 'Grace', surname: 'Lane', sex: 'female', living: true, addedDaysAgo: 9, user: 'grace',
    bio: 'Marine biologist, at sea more often than on land.',
    born: { type: 'birth', date: { year: 1994, month: 12, day: 5 }, place: 'Seattle, Washington' },
    events: [
      { type: 'education', title: 'Marine biology degree', date: { year: 2016 } },
      { type: 'occupation', title: 'Joined the ocean survey team', date: { year: 2021 } },
    ],
    occupation: 'Marine biologist', nationality: 'American', education: 'M.Sc. Marine Biology, University of Washington',
    links: ['https://pacificsurvey.org'], vehicles: ['2020 Jeep Renegade'], pets: [['Nori', 'Tortoise']],
    favorites: [['Food', 'Poke bowl'], ['Film', 'My Octopus Teacher'], ['Music', 'Ambient'], ['Hobby', 'Free diving']],
  },
  {
    id: 'sofia', given: 'Sofia', surname: 'Hollis', sex: 'female', living: true, addedDaysAgo: 6,
    bio: 'The newest branch. Fearless on a bicycle and full of questions.',
    born: { type: 'birth', date: { year: 2018, month: 8, day: 2 }, place: 'Portland, Oregon' },
    events: [
      { type: 'other', title: 'First day of preschool', date: { year: 2022, month: 9 } },
      { type: 'other', title: 'Learned to ride a bike', date: { year: 2024 } },
    ],
    nationality: 'American', education: 'Rosewood Primary', vehicles: ['One red bicycle'], pets: [['Pixel', 'Golden Retriever']],
    favorites: [['Food', 'Mac and cheese'], ['Film', 'Kiki’s Delivery Service'], ['Music', 'Anything with a chorus'], ['Hobby', 'Drawing dinosaurs']],
  },
  {
    id: 'marco', given: 'Marco', surname: 'Russo', sex: 'male', living: true, addedDaysAgo: 2,
    bio: 'Runs a small trattoria on Alberta Street and still cooks for the family at Christmas.',
    born: { type: 'birth', date: { year: 1987, month: 5, day: 6 }, place: 'Naples, Italy' },
    events: [{ type: 'immigration', date: { year: 2008 }, place: 'Portland, Oregon' }],
    occupation: 'Chef and restaurateur', nationality: 'Italian-American', education: 'Culinary Institute of America',
    links: ['https://instagram.com/marco.cucina'], vehicles: ['2013 Vespa Primavera'],
    favorites: [['Food', 'Cacio e pepe'], ['Film', 'Big Night'], ['Music', 'Bossa nova'], ['Hobby', 'Fermenting things']],
  },
]

interface SeedFamily {
  id: string
  partners: string[]
  children: string[]
  status: PartnerStatus
  events?: SeedEvent[]
}

/** Couples and their children, as the prototype draws them. Grace's mother isn't recorded. */
const FAMILIES: SeedFamily[] = [
  { id: 'f-lane', partners: ['arthur', 'beatrice'], children: ['margaret', 'david'], status: 'together',
    events: [{ type: 'marriage', date: { year: 1958 }, place: 'Boston, Massachusetts' }] },
  { id: 'f-hollis', partners: ['james', 'margaret'], children: ['ellie', 'tom'], status: 'together',
    events: [{ type: 'marriage', date: { year: 1986, month: 6, day: 14 }, place: 'Boston, Massachusetts' }] },
  { id: 'f-david', partners: ['david'], children: ['grace'], status: 'together' },
  { id: 'f-david-susan', partners: ['david', 'susan'], children: [], status: 'separated',
    events: [
      { type: 'marriage', date: { year: 1990 } },
      { type: 'separation', date: { year: 2019 }, description: 'Separated, and still close.' },
    ] },
  { id: 'f-ellie-marco', partners: ['ellie', 'marco'], children: ['sofia'], status: 'divorced',
    events: [
      { type: 'marriage', date: { year: 2015, month: 9 }, place: 'Rosewood Farm, Oregon' },
      { type: 'divorce', date: { year: 2020 }, description: 'Co-parenting Sofia.' },
    ] },
]

// ---- simplified kinship (see app/kinship.py) -------------------------------------------

const uniq = <T,>(xs: T[]) => [...new Set(xs)]
const childIn = (id: string) => FAMILIES.filter((f) => f.children.includes(id))
const partnerIn = (id: string) => FAMILIES.filter((f) => f.partners.includes(id))
const parentsOf = (id: string) => uniq(childIn(id).flatMap((f) => f.partners))
const childrenOf = (id: string) => uniq(partnerIn(id).flatMap((f) => f.children))
const partnersOf = (id: string) =>
  partnerIn(id).flatMap((f) => f.partners.filter((x) => x !== id).map((x) => ({ id: x, family: f })))
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

function relativesOf(id: string): Omit<Relative, 'can_edit_family'>[] {
  const out: Omit<Relative, 'can_edit_family'>[] = []
  const seen = new Set([id])
  const add = (r: Omit<Relative, 'can_edit_family'>) => {
    if (!seen.has(r.person_id)) {
      seen.add(r.person_id)
      out.push(r)
    }
  }
  const base = { pedigree: null, family_id: null, status: null, via_person_id: null }
  const parents = parentsOf(id)
  parents.forEach((p) => add({ ...base, person_id: p, relation: 'parent', pedigree: 'biological' }))
  for (const p of parents)
    for (const q of partnersOf(p))
      if (!parents.includes(q.id)) add({ ...base, person_id: q.id, relation: 'step_parent', status: q.family.status, via_person_id: p })
  partnersOf(id).forEach((q) => add({ ...base, person_id: q.id, relation: 'partner', family_id: q.family.id, status: q.family.status }))
  const siblings = uniq([...childIn(id).flatMap((f) => f.children), ...parents.flatMap(childrenOf)]).filter((x) => x !== id)
  siblings.forEach((s) => add({ ...base, person_id: s, relation: sameSet(parentsOf(s), parents) ? 'sibling' : 'half_sibling' }))
  for (const sp of out.filter((r) => r.relation === 'step_parent'))
    for (const c of childrenOf(sp.person_id))
      if (!siblings.includes(c)) add({ ...base, person_id: c, relation: 'step_sibling', via_person_id: sp.person_id })
  const children = childrenOf(id)
  children.forEach((c) => add({ ...base, person_id: c, relation: 'child', pedigree: 'biological' }))
  for (const q of partnersOf(id))
    for (const c of childrenOf(q.id))
      if (!children.includes(c)) add({ ...base, person_id: c, relation: 'step_child', via_person_id: q.id })
  return out
}

// ---- timeline (see app/timeline.py) ----------------------------------------------------

const EVENT_LABEL: Record<EventType, string> = {
  birth: 'Born', baptism: 'Baptised', death: 'Died', burial: 'Buried', education: 'Education',
  occupation: 'Work', retirement: 'Retired', residence: 'Moved', emigration: 'Emigrated',
  immigration: 'Immigrated', military: 'Military service', engagement: 'Engaged', marriage: 'Married',
  separation: 'Separated', divorce: 'Divorced', other: 'Event',
}
const COUPLE: Partial<Record<EventType, string>> = {
  engagement: 'Engaged to', marriage: 'Married', separation: 'Separated from', divorce: 'Divorced',
}

// ---- building the dataset --------------------------------------------------------------

function permissionsFor(role: Role, person: Person): Schemas['PersonPermissions'] {
  const rank = RANK[role]
  const isMe = person.linked_user_id === ME.id
  return {
    can_edit: isMe || rank >= RANK.admin || (role === 'contributor' && !person.is_living),
    can_set_living: rank >= RANK.admin,
    can_delete: rank >= RANK.admin,
    can_add_relatives: rank >= RANK.contributor,
  }
}

function accessFor(role: Role, myPersonId: string | null): Schemas['MyAccessOut'] {
  const rank = RANK[role]
  return {
    tree_role: role,
    subtree_roles: [],
    highest_role: role,
    my_person_id: myPersonId,
    can_manage_members: rank >= RANK.admin,
    can_manage_subtrees: rank >= RANK.admin,
    can_create_people: rank >= RANK.contributor,
    is_owner: role === 'owner',
  }
}

export interface Dataset {
  me: Schemas['UserOut']
  trees: Schemas['TreeListItem'][]
  tree: Record<string, Schemas['TreeDetailOut']>
  people: Record<string, Person[]>
  person: Record<string, Record<string, PersonDetail>>
  members: Record<string, Schemas['MemberOut'][]>
  invites: Record<string, Schemas['InviteOut'][]>
  subtrees: Record<string, Schemas['SubtreeOut'][]>
  subtreePeople: Record<string, Record<string, Person[]>>
  invitePreview: Record<string, Schemas['InvitePreview']>
  places: Record<string, Schemas['PlaceOut'][]>
}

export function buildDataset(role: Role): Dataset {
  const hollis = 'hollis'
  const seeds = new Map(HOLLIS.map((s) => [s.id, s]))
  const vital = (s: Seed, e?: SeedEvent) =>
    e ? { event_id: `${s.id}-${e.type}`, date: e.date ? fd(e.date) : null, place: e.place ?? null } : null

  const people: Person[] = HOLLIS.map((s) => ({
    id: s.id,
    tree_id: hollis,
    given_names: s.given,
    surname: s.surname,
    birth_surname: s.birthSurname ?? '',
    nickname: s.nickname ?? '',
    native_name: '',
    sex: s.sex,
    bio: s.bio,
    occupation: s.occupation ?? '',
    nationality: s.nationality ?? '',
    education: s.education ?? '',
    links: (s.links ?? []).map((url) => ({ url, label: '' })),
    vehicles: s.vehicles ?? [],
    pets: (s.pets ?? []).map(([name, kind]) => ({ name, kind })),
    favorites: (s.favorites ?? []).map(([category, value]) => ({ category, value })),
    is_living: s.living,
    display_name: `${s.given} ${s.surname}`,
    linked_user_id: s.user ? USERS[s.user].id : null,
    created_at: ago(s.addedDaysAgo),
    updated_at: ago(Math.max(0, s.addedDaysAgo - 1)),
    birth: vital(s, s.born),
    death: vital(s, s.died),
  }))
  const byId = new Map(people.map((p) => [p.id, p]))
  const name = (id: string) => byId.get(id)!.display_name

  const canEditPerson = (p: Person) => permissionsFor(role, p).can_edit
  const canEditFamily = (f: SeedFamily) => {
    const partners = f.partners.map((x) => byId.get(x)!)
    return partners.some((p) => p.linked_user_id === ME.id) || partners.every(canEditPerson)
  }

  function timelineFor(id: string): TimelineItem[] {
    const s = seeds.get(id)!
    const rows: [number, TimelineItem][] = []
    const push = (e: SeedEvent, item: Omit<TimelineItem, 'type' | 'type_label' | 'title' | 'description' | 'date' | 'place'>) =>
      rows.push([
        sortKey(e.date),
        {
          ...item,
          type: e.type,
          type_label: EVENT_LABEL[e.type],
          title: e.title ?? '',
          description: e.description ?? '',
          date: e.date ? fd(e.date) : null,
          place: e.place ?? null,
        },
      ])
    const editable = canEditPerson(byId.get(id)!)
    for (const e of [s.born, ...(s.events ?? []), s.died].filter((x): x is SeedEvent => !!x)) {
      const key = `${id}-${e.type}-${e.title ?? ''}`
      push(e, { key, event_id: key, kind: 'person', summary: e.title || EVENT_LABEL[e.type], family_id: null, related_person_id: null, editable })
    }
    for (const f of partnerIn(id)) {
      const others = f.partners.filter((x) => x !== id).map(name).join(' and ')
      for (const e of f.events ?? []) {
        const key = `${f.id}-${e.type}`
        const summary = e.title || (COUPLE[e.type] && others ? `${COUPLE[e.type]} ${others}` : EVENT_LABEL[e.type])
        push(e, { key, event_id: key, kind: 'family', summary, family_id: f.id, related_person_id: null, editable: canEditFamily(f) })
      }
    }
    for (const c of childrenOf(id)) {
      const born = seeds.get(c)?.born
      if (born) push(born, { key: `child-${c}`, event_id: null, kind: 'child_birth', summary: `${name(c)} was born`, family_id: null, related_person_id: c, editable: false })
    }
    for (const q of partnersOf(id)) {
      const died = seeds.get(q.id)?.died
      if (died) push(died, { key: `partner-${q.id}`, event_id: null, kind: 'partner_death', summary: `${name(q.id)} died`, family_id: null, related_person_id: q.id, editable: false })
    }
    return rows.sort((a, b) => a[0] - b[0]).map(([, item]) => item)
  }

  const details = Object.fromEntries(
    people.map((p) => {
      const relatives = relativesOf(p.id).map((r) => ({
        ...r,
        can_edit_family: r.relation === 'partner' && !!r.family_id && canEditFamily(FAMILIES.find((f) => f.id === r.family_id)!),
      }))
      return [
        p.id,
        {
          ...p,
          permissions: permissionsFor(role, p),
          parents: parentsOf(p.id),
          children: childrenOf(p.id),
          partners: partnersOf(p.id).map((q) => q.id),
          relatives,
          timeline: timelineFor(p.id),
        } satisfies PersonDetail,
      ]
    }),
  )

  const places = uniq(
    [...HOLLIS.flatMap((s) => [s.born, s.died, ...(s.events ?? [])]), ...FAMILIES.flatMap((f) => f.events ?? [])]
      .map((e) => e?.place)
      .filter((x): x is string => !!x),
  )
    .sort()
    .map((placeName, i) => ({ id: `place-${i}`, name: placeName }))

  const member = (id: string, user: string, r: Role, days: number, subtree?: [string, string]) => ({
    id,
    user: USERS[user],
    role: r,
    subtree_id: subtree?.[0] ?? null,
    subtree_name: subtree?.[1] ?? null,
    created_at: ago(days),
  })
  const ellieIsOwner = role === 'owner'
  const members: Schemas['MemberOut'][] = [
    member('m-ellie', 'ellie', ellieIsOwner ? 'owner' : role, 63),
    member('m-margaret', 'margaret', ellieIsOwner ? 'admin' : 'owner', 50),
    member('m-tom', 'tom', 'contributor', 12),
    member('m-marco', 'marco', 'personal', 2),
    member('m-grace', 'grace', 'personal', 9, ['david', 'David’s family']),
  ]

  const lane = ['arthur', 'beatrice', 'margaret', 'james', 'david', 'susan', 'ellie', 'tom', 'grace', 'marco', 'sofia']
  const davids = ['david', 'susan', 'grace']
  const subtrees: Schemas['SubtreeOut'][] = [
    { id: 'lane', name: 'Arthur and Beatrice’s line', description: '', root_person_id: 'arthur',
      direction: 'descendants', include_spouses: true, member_count: lane.length },
    { id: 'david', name: 'David’s family', description: '', root_person_id: 'david',
      direction: 'descendants', include_spouses: true, member_count: davids.length },
  ]

  const invites: Schemas['InviteOut'][] = [
    { id: 'i-susan', token: 'demo', role: 'contributor', subtree_id: null, email: 'susan.lane@example.com',
      person_id: 'susan', expires_at: ahead(12), accepted_at: null, revoked: false },
    { id: 'i-open', token: 'demo-open', role: 'personal', subtree_id: 'david', email: null,
      person_id: null, expires_at: ahead(5), accepted_at: null, revoked: false },
  ]

  const raman = 'raman'
  const sortByName = (a: Person, b: Person) =>
    a.surname.localeCompare(b.surname) || a.given_names.localeCompare(b.given_names)

  return {
    me: ME,
    trees: [
      { id: hollis, name: 'The Hollis Family', description: 'Four generations, from Leeds and Cork to Portland.',
        created_at: ago(63), highest_role: role },
      { id: raman, name: 'The Raman Family', description: 'Priya’s side, started this spring.',
        created_at: ago(20), highest_role: 'contributor' },
    ],
    tree: {
      [hollis]: { id: hollis, name: 'The Hollis Family', description: 'Four generations, from Leeds and Cork to Portland.',
        created_at: ago(63), access: accessFor(role, 'ellie'), person_count: people.length },
      [raman]: { id: raman, name: 'The Raman Family', description: 'Priya’s side, started this spring.',
        created_at: ago(20), access: accessFor('contributor', null), person_count: 0 },
    },
    people: { [hollis]: [...people].sort(sortByName), [raman]: [] },
    person: { [hollis]: details, [raman]: {} },
    members: {
      [hollis]: members,
      [raman]: [member('m-priya', 'priya', 'owner', 20), member('m-ellie-r', 'ellie', 'contributor', 18)],
    },
    invites: { [hollis]: invites, [raman]: [] },
    subtrees: { [hollis]: subtrees, [raman]: [] },
    subtreePeople: {
      [hollis]: {
        lane: lane.map((id) => byId.get(id)!).sort(sortByName),
        david: davids.map((id) => byId.get(id)!).sort(sortByName),
      },
    },
    invitePreview: {
      demo: { tree_name: 'The Hollis Family', subtree_name: null, role: 'contributor', person_name: 'Susan Lane', usable: true },
      'demo-open': { tree_name: 'The Hollis Family', subtree_name: 'David’s family', role: 'personal', person_name: null, usable: true },
      expired: { tree_name: 'The Hollis Family', subtree_name: null, role: 'personal', person_name: null, usable: false },
    },
    places: { [hollis]: places, [raman]: [] },
  }
}
