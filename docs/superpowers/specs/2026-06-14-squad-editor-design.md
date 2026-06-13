# Squad Editor — Design Spec

**Date:** 2026-06-14  
**Status:** Approved

## Problem

Squads can be added via a button in the editor panel, but there is no way to rename them, change their FTE capacity, change their colour, or remove them through the UI. Users must edit the raw JSON scenario file to make these changes.

## Goals

- Let users edit squad name, FTE capacity, and colour directly in the side panel.
- Let users add new squads from within the squad list.
- Let users remove squads, with a guard that prevents deletion when assignments exist.
- Design the section so squad member lists can be added in a future iteration without structural rework.

## Non-Goals

- Squad member (individual person) editing — deferred to a future iteration.
- Reordering squads — out of scope for this iteration.
- Squad-level eligibility editing (which squads can work on which projects) — already handled on the project editor.

## UI Design

### Placement

A new **Squads** section renders inside `EditorPanel`, immediately below the scenario name field and the Add Project / Add Squad / Add Assignment toolbar row. The "Add Squad" button moves from the toolbar row into the Squads section footer. The toolbar row retains "Add Project" and "Add Assignment".

### Squad row layout

Each squad renders as a single row:

```
[ color swatch ] [ name input ........................ ] [ FTE ] [ 🗑 ]
```

- **Color swatch** — `<input type="color">` styled as a small square (no text label). On change, updates `squad.color`.
- **Name field** — text input filling remaining horizontal space. On change, updates `squad.name`.
- **FTE field** — `<input type="number" min="0.5" step="0.5">`, fixed narrow width (~60 px). On change, updates `squad.capacityFte`.
- **Delete button** — `Trash2` icon from lucide-react. Behaviour:
  - If the squad has zero assignments: removes the squad immediately.
  - If the squad has one or more assignments: does **not** delete. Instead, shows an inline error message beneath the row: _"Remove all [n] assignments for [name] first."_
  - The inline error is cleared as soon as any squad field is edited or a different action is taken.

### Section footer

An "Add Squad" button (same style as existing small-command buttons) appends a new squad with default name "New squad", `capacityFte: 5`, and a default colour (`#0f766e`).

### Future extensibility — member lists

When member-level editing is added:

- A chevron toggle on each row expands a sub-list of member name inputs.
- The `Squad` domain type gains `members?: string[]`.
- The row component gains an optional `expanded` state and a `Members` sub-section.
- No structural changes to the section container or row layout are required.

## Implementation Details

### New functions in `App.tsx`

```ts
function updateSquad(squadId: string, patch: Partial<Pick<Squad, "name" | "capacityFte" | "color">>): void
function removeSquad(squadId: string): void   // guarded — sets error if assignments exist
```

### New state in `App.tsx`

```ts
const [squadDeleteError, setSquadDeleteError] = useState<{ squadId: string; message: string } | null>(null);
```

Cleared on: any `updateSquad` call, any `addSquad` call, any squad row interaction.

### New component

`SquadsEditorSection` — pure presentational component, receives:

| Prop | Type | Purpose |
|------|------|---------|
| `squads` | `Squad[]` | List to render |
| `deleteError` | `{ squadId: string; message: string } \| null` | Inline error to display |
| `onUpdate` | `(id, patch) => void` | Edit handler |
| `onRemove` | `(id) => void` | Delete handler |
| `onAdd` | `() => void` | Add squad handler |

### Props removed from `EditorPanel`

`onAddSquad` is removed from `EditorPanel`'s prop interface. The "Add Squad" action moves entirely into `SquadsEditorSection`.

### EditorPanel prop additions

| Prop | Type |
|------|------|
| `squadDeleteError` | `{ squadId: string; message: string } \| null` |
| `onSquadUpdate` | `(id, patch) => void` |
| `onSquadRemove` | `(id) => void` |
| `onSquadAdd` | `() => void` |

## Acceptance Criteria

1. All squads are listed in the side panel with their current name, FTE, and colour.
2. Editing the name field immediately updates the squad name everywhere (board bars, assignment bars, planning squad dropdown).
3. Editing the FTE field immediately updates feasibility calculations.
4. Editing the colour swatch immediately updates assignment bar colours on the board.
5. Clicking "Add Squad" appends a new squad to the list.
6. Deleting a squad with no assignments removes it from the list and from the scenario.
7. Deleting a squad that has assignments shows the inline error message and does not delete.
8. The inline error message clears when the user edits any squad field.
9. The "Add Squad" button is no longer present in the main editor toolbar row.
10. Existing tests pass. No regressions.
