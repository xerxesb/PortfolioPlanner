# Milestone Context Menu Design

## Purpose

Users need to add milestones to project lanes and remove them without leaving the board surface. Right-click is the established gesture in the app (used for assignment context menus), so milestone management follows the same pattern.

## Approved Direction

A unified lane context menu that appears on right-click anywhere in a project lane. If the right-click lands on an existing milestone marker the menu offers "Delete milestone". If it lands on empty lane space the menu offers "Add milestone at [sprint]". One state object handles both cases.

## Interaction

- **Right-click on empty project lane** → context menu with "Add milestone at [sprint key]"
- **Right-click on a milestone marker** → context menu with "Delete milestone"
- Clicking anywhere outside the menu dismisses it (same behaviour as the assignment context menu).
- The menu is dismissed after any action is taken.

## State

```ts
interface LaneContextMenu {
  projectId: string;
  dateKey: TimeKey;           // sprint at the right-click x position
  milestoneId: string | null; // non-null when right-clicking a marker
  x: number;
  y: number;
}
```

One `useState<LaneContextMenu | null>` in `App`. Cleared by the existing `onClick={() => setAssignmentMenu(null)}` handler on `<main>` — the new state is cleared alongside it.

## Event Wiring

Two `onContextMenu` handlers are added to `ProjectLane`:

1. **`.project-track` `onContextMenu`** — calculates `dateKey` by mapping `event.clientX` to the timeline index (same calculation used for drag-create). Sets `milestoneId: null`.
2. **`.milestone-marker` `onContextMenu`** — calls `event.stopPropagation()` to prevent the lane handler from firing. Passes the marker's `milestoneId` and its `dateKey`.

`ProjectLane` receives two new callback props:

```ts
onLaneContextMenu: (projectId: string, dateKey: TimeKey, x: number, y: number) => void;
onMilestoneContextMenu: (projectId: string, milestoneId: string, dateKey: TimeKey, x: number, y: number) => void;
```

## Menu View

`LaneContextMenuView` — mirrors `AssignmentContextMenuView` in structure and CSS class.

- `milestoneId === null` → single button: **"Add milestone at [dateKey]"**
- `milestoneId !== null` → single button: **"Delete milestone"**

## Data Mutations

**Add milestone**

Appended to `project.milestones` via `updateScenario`:

```ts
{
  id: crypto.randomUUID(),
  name: "Milestone",
  dateKey,          // from context menu state
  requiredPercent: 70,
}
```

**Delete milestone**

Filter `milestoneId` out of `project.milestones` via `updateScenario`.

Both mutations go through the existing `updateScenario` function and update `scenario.updatedAt`.

## Editor Panel

No changes. The existing `milestone-editor` fields (name, gate sprint, required %) continue to work for all milestones including newly added ones.

## Testing

- Unit: `addMilestone` and `removeMilestone` pure helpers (if extracted) — verify array mutation correctness.
- UI: right-click empty lane → menu shows add option → milestone marker appears at correct sprint. Right-click marker → delete → marker removed.
- Keyboard: context menu is not a keyboard-primary surface; no special keyboard handling required beyond Escape to dismiss.

## Out of Scope

- Renaming a milestone via context menu (covered by editor panel).
- Dragging a milestone marker to reposition it (separate feature).
- Multi-milestone selection or bulk delete.
