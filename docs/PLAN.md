# TheFamilyVine: plan

## Decisions

- **Stack:** FastAPI + SQLAlchemy 2 (async) + Alembic + Postgres; React + TypeScript + Vite + TanStack Query. The API is kept separate from the web front end so a mobile app can use it later.
- **Authentication:** SuperTokens (self-hosted core in Docker) with email and password. SuperTokens only confirms who someone is. Everything they're allowed to do is decided in our own database (`app/permissions.py`).
- **Multiple trees with sub-trees (branches).** A branch is defined by a root person, a direction (descendants, ancestors or both) and whether spouses are included. Who is in a branch is **calculated** from relationships each time rather than stored, so newly added relatives join it automatically.
- **Design reference:** the Claude Design project "Family Tree Visualization App" (https://claude.ai/design/p/68b5519e-837f-428c-8725-ae7002d4bce4, file `Family Tree.dc.html`) is the **feature spec**. Its own "Organic" look is not used. Instead, the visuals follow the minimalist rules: warm off-white canvas, white bordered cards, Newsreader headings, Geist text, Geist Mono for metadata, near-black buttons, pastel tags, Phosphor icons, no emoji.
- **Genetic conditions** are visible only to **blood relatives** in the tree. Living people record their own; admins and contributors may record them for deceased people.
- **Photos** are pulled forward from the media phase: tree cover photo, profile photos and a small gallery per person.

## Roles

A member has at most one whole-tree role, plus any number of branch roles. For a given person, a member's *effective role* is the highest role among the memberships whose scope covers that person.

| Action | Owner | Admin | Contributor | Personal |
|---|:-:|:-:|:-:|:-:|
| View people (in scope) | ✅ | ✅ | ✅ | ✅ |
| Add / edit **own** profile | ✅ | ✅ | ✅ | ✅ |
| Add new people (living or deceased) | ✅ | ✅ | ✅ | ❌ |
| Edit **deceased** people | ✅ | ✅ | ✅ | ❌ |
| Edit **other living** people (including ones they added) | ✅ | ✅ | ❌ | ❌ |
| Change the living / deceased flag after creation | ✅ | ✅ | ❌ | ❌ |
| Delete people | ✅ | ✅ | ❌ | ❌ |
| Invite and manage members (tree-wide, or within a branch they admin) | ✅ | ✅ | ❌ | ❌ |
| Create and manage branches, edit tree details | ✅ | ✅ | ❌ | ❌ |
| Delete the tree, transfer ownership | ✅ | ❌ | ❌ | ❌ |
| Change a couple's status or shared events (marriage, divorce…) | ✅ | ✅ | only if both partners are deceased | ❌ |

Members whose only role is on a branch must add new people as relatives of someone already in that branch, so the new person stays visible to them.

Either partner in a couple may always edit their own couple's status and events, whatever their role. Recording a death for someone marked living takes an admin, and marks them deceased.

## Data model

```
User ─< Membership (role, optional subtree) >─ Tree ─< Subtree (root person, direction)
                                                 │
Invite (token, role, optional subtree/email/person, 14-day expiry, single use)
                                                 │
Person ─< FamilyPartner >─ Family (status) ─< ChildLink (biological/adopted/step/foster)
   │                          │
   └──────< Event >───────────┘          Event ─> Place (shared names per tree)
```

`Family` maps directly to a GEDCOM `FAM` record, which covers remarriage, half-siblings and adoption. A family with no partners holds siblings whose parents aren't recorded yet.

- **Only parent/child and partner links are stored.** Siblings (full or half), step-parents, step-children and step-siblings are worked out from them (`app/kinship.py`), so they stay correct as the tree changes and export cleanly to GEDCOM.
- **Events** belong to a person (birth, move, work…) or to a couple (marriage, separation, divorce). Dates are approximate: a qualifier (on, about, before, after, between) plus year, optional month and day, stored as parts with a sort date (`app/dates.py`). A person has at most one birth and one death. Recording a separation or divorce moves the couple's status forward.
- **Profile details** (career, nationality, education, links, vehicles, pets, favourites) live on the person; links must be http(s) web addresses.

## Phases

1. **Foundation** ✅: accounts, trees, roles, invites, branches, permission engine, basic people and relationships, web front end

The design work (from the Claude Design reference) comes next, in six steps:

1. **New look and navigation** ✅: design tokens, fonts, icons; Home / People / You on phones, a sidebar on desktop; tree home page; restyled existing screens; a dev-only preview mode with sample data
2. **Events and profile details** ✅ (core genealogy): events with approximate dates and places, timeline, couple status (together / separated / divorced), sibling and step relatives, career, nationality, education, social links, vehicles, favourites, pets, full profile page
3. **Interactive tree and quick view** ✅: the Tree tab, a pan-and-zoom canvas of everyone you can see, centred on you; automatic generation layout; couple / parent / step / adopted / foster line styles with a key and a relationships toggle; search, branch filter, tap for a quick view, add relatives from the tree; "Show on tree" from a profile. Adding a partner asks whether they're also the parent of the person's children, and a step-parent can be made a parent when their partner is the only parent recorded. People already on the tree can be connected as any relative, and a direct link (parent, child, partner, or sibling without recorded parents) can be removed without deleting anyone
4. **How are we related?** ✅: pick any two people to see what one is to the other, from parents to "second cousin twice removed" (with half-relatives), husband and wife when married, step relatives and in-laws, or a chain like "Aunt's husband's sister"; the chain of people between them, and "Show this line on the tree" to light it up on the canvas; "Your first cousin" labels on profiles, the quick view and the People list. Worked out in the browser from the people the viewer can see
   **App settings** ✅ (added along the way): appearance (system, light or dark), text size, and whether opening a tree lands on its home page or the tree itself; saved to the account so they follow you between devices
5. **Home dashboard and set-up flow** ✅: "Welcome back" with generations among the stats; *On this day* with birthdays, wedding anniversaries and memorials today and in the week ahead; recently added with relation labels; "Plant your family tree", a three-step start (yourself and the tree, your parents, invite links) that replaces the old new-tree form
6. **Photos and genetic conditions** ✅: a gallery on every profile (captions, a full-size viewer, choosing the profile picture), profile pictures on avatars and tree tiles, a tree cover photo; uploads resized with their location data removed, kept on the server's `media` volume and only served to people who may see them. Health conditions (diagnosed, carrier, watch, untested) visible only to the person and their blood relatives, admins included; living people record their own; "watch" items traced from parents, grandparents, great-grandparents and siblings

**Installable app** ✅ (the first step towards the mobile app): installs to a phone's home screen or a computer's dock from an Install button, or on iPhone from Safari's Share menu, offered on the tree's home page (phones) and in Settings; app icons made from the favicon; opens offline with the family data and photos last viewed on that device, cleared on signing out or when someone else signs in; a "You're offline" note, and a "New version" note with Reload after a deploy

Later phases, unchanged:

- **Stories and documents:** markdown stories linked to several people, document uploads, tagging people in photos
- **Sources and GEDCOM:** sources and citations on any fact, GEDCOM import with a preview step (also offered during set-up), GEDCOM export with living people removed
- **Collaboration:** edit history with undo, activity feed, map of places, email delivery of invites, backups
- **Hosting:** production Docker images, HTTPS, S3-compatible media storage, and a mobile app on the same API
