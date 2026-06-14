# Engineer Resource Map — Design Spec

**Date:** 2026-06-14  
**Status:** Approved

## Problem

The portfolio board shows squad-level commitments, but stakeholders need a per-engineer resource mapping that can be exported to Excel for detailed staffing plans. Engineers have not previously been modelled in the data; squads carry only a headcount number.

## Goals

- Model individual engineers (numeric ID + name) as members of each squad.
- Show engineer membership in the squad editor so the list can be maintained without editing raw JSON.
- Replace the editable FTE capacity field on each squad with a live count derived from `members.length`.
- Provide a full-screen Resource Map modal that tables one row per (engineer × project assignment) with monthly `1`/blank cells covering the full scenario range.
- Support copy-to-clipboard as TSV for direct paste into Excel.

## Non-Goals

- Engineers belonging to more than one squad simultaneously — deferred.
- Role/title, FTE equivalent, location, manager columns — these are left blank in the app output; the user fills them in Excel.
- Per-engineer drag/resize interactions on the planning board — out of scope.
- Schema version bump — the change is additive and backward-compatible.

## Data Model

### New type

```ts
export interface Engineer {
  id: number;    // user-supplied numeric identifier (e.g. employee number)
  name: string;
}
```

Added to `src/domain/types.ts`.

### Squad extension

```ts
export interface Squad {
  id: string;
  name: string;
  capacityFte: number;      // kept for backward compat; ignored in UI when members present
  color?: string;
  members?: Engineer[];     // optional — existing files without this field load unchanged
}
```

When `members` is present, `capacityFte` is treated as `members.length` for capacity calculations. When absent, existing behaviour is unchanged.

## Squad Editor Changes

### Capacity field

The `<input type="number">` FTE capacity field is removed from each squad row. It is replaced with a read-only badge:
- `n members` — when `members` is defined (any length, including 0).
- `—` — when `members` is undefined (legacy squad, no member list loaded yet).

The underlying `capacityFte` value on the data model is updated to `members.length` whenever the member list changes (add/remove).

### Collapsible member sub-list

Each squad row gains a **chevron toggle** on its left edge. Clicking it expands an inlined member list directly beneath the row.

**Expanded layout:**

```
▼ [ color ] [ Squad Name .................. ] [ 3 members ] [ 🗑 ]
  ┌──────────────────────────────────────────────────────────┐
  │ [ ID ] [ Name ...................................... ] [🗑] │
  │ [ ID ] [ Name ...................................... ] [🗑] │
  │ [ + Add member ]                                          │
  └──────────────────────────────────────────────────────────┘
```

- **ID field** — `<input type="number">`, narrow (~72 px). User-entered numeric identifier.
- **Name field** — text input, fills remaining width.
- **Delete member button** — `Trash2` icon. Removes the row immediately; no guard needed (unlike squad deletion).
- **"+ Add member" button** — appends `{ id: 0, name: "" }` to the end of the list.

Only one squad is expanded at a time (`expandedSquadId` state). Clicking the chevron of an already-expanded squad collapses it.

### State and handlers (in `App.tsx`)

```ts
const [expandedSquadId, setExpandedSquadId] = useState<string | null>(null);

function addMember(squadId: string): void
function updateMember(squadId: string, memberId: number, patch: Partial<Engineer>): void
function removeMember(squadId: string, memberId: number): void
```

Each handler mutates `scenario.squads` immutably and synchronises `capacityFte` to `members.length`.

### New component: `SquadMemberList`

Pure presentational component. Props:

| Prop | Type |
|------|------|
| `members` | `Engineer[]` |
| `onAdd` | `() => void` |
| `onUpdate` | `(id: number, patch: Partial<Engineer>) => void` |
| `onRemove` | `(id: number) => void` |

## Resource Map Modal

### Entry point

A **"Resource map"** button is added to the `.topbar-actions` toolbar (alongside the existing "Scenario data" button). Opens `ResourceMapModal`.

### Modal layout

- Full-screen overlay (`position: fixed`, `inset: 0`, z-index above all content).
- Inner panel fills ~95% of viewport (`width: 95vw`, `height: 95vh`), centred.
- Header row: title "Resource map", "Copy as TSV" button, close (✕) button.
- Body: horizontally and vertically scrollable table.
- First two columns (ID, Name) are sticky (`position: sticky`, `left: 0`).
- Header row is sticky (`position: sticky`, `top: 0`).

### Table columns

| Column | Source |
|--------|--------|
| ID | `engineer.id` |
| Name | `engineer.name` |
| Role / Title | _(blank)_ |
| FTE Equivalent | _(blank)_ |
| Location | _(blank)_ |
| Team / Squad | `squad.name` |
| Project | `project.name` |
| Manager | _(blank)_ |
| Jul-26 … | `1` or blank |

### Row generation

For each `Assignment` in the scenario:
1. Look up the `Squad` by `assignment.squadId`.
2. Skip if the squad has no `members` or `members` is empty.
3. For each `Engineer` in `squad.members`, emit one row for the (engineer, assignment) pair.

Rows are sorted by `engineer.id` ascending, then by assignment `startKey` ascending.

### Month columns

Columns span from the calendar month of the earliest assignment `startKey` to the calendar month of the latest assignment `finishKey` across the entire scenario. One column per calendar month, labelled `MMM-YY` (e.g. `Jul-26`).

**Sprint-to-calendar-month mapping:**

A new pure function in `src/domain/time.ts`:

```ts
export function sprintToCalendarMonthIndex(key: TimeKey): number {
  const { year, pi, sprint } = parseTimeKey(key);
  // Each PI covers 3 calendar months; sprints map approximately:
  // sprint 1-2 → month 0, sprint 3 → month 1, sprint 4 → month 2
  const monthWithinPi = Math.floor(((sprint - 1) * 3) / 4);
  return year * 12 + (pi - 1) * 3 + monthWithinPi;
}
```

A cell is `1` if:
```
sprintToCalendarMonthIndex(assignment.startKey) <= columnMonthIndex
  <= sprintToCalendarMonthIndex(assignment.finishKey)
```

### Copy as TSV

"Copy as TSV" serialises the visible table (header row + all data rows) as a tab-separated string and writes it to the clipboard via `navigator.clipboard.writeText`. Blank cells emit an empty string between tabs. The button label briefly changes to "Copied!" on success.

### New function: `buildResourceMapRows`

Pure function in `src/domain/resourceMap.ts`:

```ts
export interface ResourceMapRow {
  engineerId: number;
  engineerName: string;
  squadName: string;
  projectName: string;
  monthCells: boolean[];   // index matches months array passed in
}

export interface CalendarMonth {
  year: number;    // 0-99 (two-digit)
  month: number;   // 1-12
  label: string;   // e.g. "Jul-26"
}

export function buildResourceMapRows(
  squads: Squad[],
  assignments: Assignment[],
  projects: Project[],
): { months: CalendarMonth[]; rows: ResourceMapRow[] }
```

The function derives the month range internally from the assignment extents.

## Testing

- Unit tests for `sprintToCalendarMonthIndex` covering PI boundary cases.
- Unit tests for `buildResourceMapRows`: correct row count, correct month-cell values, empty result when no members defined, correct sorting.

## Backward Compatibility

- Existing scenario files without `members` on any squad load and display without change.
- The FTE capacity number previously stored in `capacityFte` is preserved in the file on save; it is simply no longer editable through the UI when `members` is present.
- The resource map modal emits no rows for squads without a `members` array — it will appear empty until members are added.
