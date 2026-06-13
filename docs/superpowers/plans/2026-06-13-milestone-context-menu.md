# Milestone Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Right-click on a project lane adds a milestone at that sprint; right-click on an existing milestone marker deletes it.

**Architecture:** A single `LaneContextMenu` state in `App` (modelled after the existing `AssignmentContextMenu`). `ProjectLane` gains two context-menu callback props. A new `LaneContextMenuView` component renders contextually (add vs delete) based on whether `milestoneId` is null. All mutations go through the existing `updateScenario` function.

**Tech Stack:** React, TypeScript, Vitest, React Testing Library

---

### Task 1: Write failing tests

**Files:**
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Add two failing tests to `src/App.test.tsx`**

Append these two `it` blocks inside the existing `describe("ResourcePlanner app", ...)` block:

```ts
it("adds a milestone via right-click context menu on a project lane", async () => {
  const user = userEvent.setup();
  render(<App />);

  const track = screen.getByTestId("track-clinical-atlas");
  track.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 320,
      height: 70,
      right: 320,
      bottom: 70,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;

  fireEvent.contextMenu(track, { clientX: 40, clientY: 10 });

  const addButton = await screen.findByRole("menuitem", { name: /add milestone/i });
  await user.click(addButton);

  // milestone marker appears in the track
  expect(track.querySelectorAll(".milestone-marker").length).toBeGreaterThan(
    screen.getByTestId("track-program-orion").querySelectorAll(".milestone-marker").length - 1,
  );
});

it("deletes a milestone via right-click context menu on a milestone marker", async () => {
  const user = userEvent.setup();
  render(<App />);

  // Program Orion has one milestone in the sample scenario
  const track = screen.getByTestId("track-program-orion");
  const marker = track.querySelector(".milestone-marker") as HTMLElement;
  expect(marker).not.toBeNull();

  fireEvent.contextMenu(marker);

  await user.click(screen.getByRole("menuitem", { name: /delete milestone/i }));

  expect(track.querySelector(".milestone-marker")).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/xbattiwalla/src/ResourcePlanner && npm test -- --reporter=verbose 2>&1 | tail -30
```

Expected: 2 new tests fail — "adds a milestone" and "deletes a milestone".

---

### Task 2: Add `LaneContextMenu` state and handlers to `App`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 3: Add `LaneContextMenu` interface after `AssignmentContextMenu`**

In `src/App.tsx`, after:
```ts
interface AssignmentContextMenu {
  assignmentId: string;
  x: number;
  y: number;
}
```

Add:
```ts
interface LaneContextMenu {
  projectId: string;
  dateKey: TimeKey;
  milestoneId: string | null;
  x: number;
  y: number;
}
```

- [ ] **Step 4: Add `laneMenu` state alongside `assignmentMenu` state**

In `App()`, after:
```ts
const [assignmentMenu, setAssignmentMenu] = useState<AssignmentContextMenu | null>(null);
```

Add:
```ts
const [laneMenu, setLaneMenu] = useState<LaneContextMenu | null>(null);
```

- [ ] **Step 5: Clear `laneMenu` in the existing `onClick` handler on `<main>`**

Change:
```tsx
      onClick={() => setAssignmentMenu(null)}
```
To:
```tsx
      onClick={() => { setAssignmentMenu(null); setLaneMenu(null); }}
```

- [ ] **Step 6: Add `openLaneMenu` and `openMilestoneMenu` handler functions**

After the `openAssignmentMenu` function:
```ts
  function openLaneMenu(projectId: string, dateKey: TimeKey, x: number, y: number) {
    setLaneMenu({ projectId, dateKey, milestoneId: null, x, y });
  }

  function openMilestoneMenu(
    projectId: string,
    milestoneId: string,
    dateKey: TimeKey,
    x: number,
    y: number,
  ) {
    setLaneMenu({ projectId, dateKey, milestoneId, x, y });
  }
```

- [ ] **Step 7: Add `addMilestone` and `removeMilestone` functions**

After `openMilestoneMenu`:
```ts
  function addMilestone(projectId: string, dateKey: TimeKey) {
    updateScenario((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              milestones: [
                ...project.milestones,
                {
                  id: crypto.randomUUID(),
                  name: "Milestone",
                  dateKey,
                  requiredPercent: 70,
                },
              ],
            }
          : project,
      ),
    }));
    setLaneMenu(null);
  }

  function removeMilestone(projectId: string, milestoneId: string) {
    updateScenario((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              milestones: project.milestones.filter((m) => m.id !== milestoneId),
            }
          : project,
      ),
    }));
    setLaneMenu(null);
  }
```

---

### Task 3: Update `ProjectLane` to fire context-menu callbacks

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 8: Add two new props to the `ProjectLane` props interface**

In the `ProjectLane` destructured props list, after `onTrackPointerDown`:
```ts
  onTrackPointerDown: (event: PointerEvent<HTMLElement>, projectId: string) => void;
  pendingCreate: CreateDragState | null;
```

Change to:
```ts
  onTrackPointerDown: (event: PointerEvent<HTMLElement>, projectId: string) => void;
  onLaneContextMenu: (projectId: string, dateKey: TimeKey, x: number, y: number) => void;
  onMilestoneContextMenu: (
    projectId: string,
    milestoneId: string,
    dateKey: TimeKey,
    x: number,
    y: number,
  ) => void;
  pendingCreate: CreateDragState | null;
```

And in the destructured parameter list, after `onTrackPointerDown`:
```ts
  onTrackPointerDown,
  pendingCreate,
```
Change to:
```ts
  onTrackPointerDown,
  onLaneContextMenu,
  onMilestoneContextMenu,
  pendingCreate,
```

- [ ] **Step 9: Add `onContextMenu` to the `.project-track` div**

Find the `.project-track` div:
```tsx
      <div
        className="project-track"
        data-testid={`track-${project.id}`}
        onPointerDown={(event) => onTrackPointerDown(event, project.id)}
      >
```

Change to:
```tsx
      <div
        className="project-track"
        data-testid={`track-${project.id}`}
        onPointerDown={(event) => onTrackPointerDown(event, project.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          const cellWidth = rect.width / timeline.length;
          const rawIndex = Math.floor((event.clientX - rect.left) / cellWidth);
          const clampedIndex = Math.min(Math.max(rawIndex, 0), timeline.length - 1);
          onLaneContextMenu(project.id, timeline[clampedIndex], event.clientX, event.clientY);
        }}
      >
```

- [ ] **Step 10: Add `onContextMenu` to each `.milestone-marker` span**

Find:
```tsx
        {project.milestones.map((milestone) => (
          <span
            className="milestone-marker"
            style={{ left: `${((timeline.indexOf(milestone.dateKey) + 0.5) / timeline.length) * 100}%` }}
            title={`${milestone.name}: ${milestone.dateKey}`}
            key={milestone.id}
          />
        ))}
```

Change to:
```tsx
        {project.milestones.map((milestone) => (
          <span
            className="milestone-marker"
            style={{ left: `${((timeline.indexOf(milestone.dateKey) + 0.5) / timeline.length) * 100}%` }}
            title={`${milestone.name}: ${milestone.dateKey}`}
            key={milestone.id}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onMilestoneContextMenu(
                project.id,
                milestone.id,
                milestone.dateKey,
                event.clientX,
                event.clientY,
              );
            }}
          />
        ))}
```

- [ ] **Step 11: Pass the two new props to `<ProjectLane>` in App JSX**

Find the `<ProjectLane>` usage:
```tsx
                onTrackPointerDown={startCreateDrag}
                pendingCreate={drag?.kind === "create" ? drag : null}
```

Change to:
```tsx
                onTrackPointerDown={startCreateDrag}
                onLaneContextMenu={openLaneMenu}
                onMilestoneContextMenu={openMilestoneMenu}
                pendingCreate={drag?.kind === "create" ? drag : null}
```

---

### Task 4: Add `LaneContextMenuView` and render it

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 12: Add `LaneContextMenuView` component**

After the closing brace of `AssignmentContextMenuView`, add:

```tsx
function LaneContextMenuView({
  menu,
  scenario,
  onAdd,
  onDelete,
}: {
  menu: LaneContextMenu;
  scenario: ScenarioFileV1;
  onAdd: (projectId: string, dateKey: TimeKey) => void;
  onDelete: (projectId: string, milestoneId: string) => void;
}) {
  const project = scenario.projects.find((p) => p.id === menu.projectId);
  if (!project) return null;

  return (
    <div
      className="assignment-context-menu"
      role="menu"
      style={{ left: menu.x, top: menu.y }}
      onClick={(event) => event.stopPropagation()}
    >
      <p>{project.name}</p>
      {menu.milestoneId === null ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => onAdd(menu.projectId, menu.dateKey)}
        >
          <Plus size={14} />
          Add milestone at {menu.dateKey}
        </button>
      ) : (
        <button
          type="button"
          role="menuitem"
          onClick={() => onDelete(menu.projectId, menu.milestoneId!)}
        >
          <Trash2 size={14} />
          Delete milestone
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 13: Render `LaneContextMenuView` in App JSX**

In `App`, inside `.board-panel`, after:
```tsx
          {assignmentMenu ? (
            <AssignmentContextMenuView
              menu={assignmentMenu}
              scenario={scenario}
              onDelete={removeAssignment}
            />
          ) : null}
```

Add:
```tsx
          {laneMenu ? (
            <LaneContextMenuView
              menu={laneMenu}
              scenario={scenario}
              onAdd={addMilestone}
              onDelete={removeMilestone}
            />
          ) : null}
```

---

### Task 5: Verify and commit

- [ ] **Step 14: Run tests**

```bash
cd /Users/xbattiwalla/src/ResourcePlanner && npm test -- --reporter=verbose 2>&1 | tail -40
```

Expected: all tests pass including the two new ones.

- [ ] **Step 15: Run typecheck**

```bash
cd /Users/xbattiwalla/src/ResourcePlanner && npm run typecheck 2>&1
```

Expected: no errors.

- [ ] **Step 16: Run lint**

```bash
cd /Users/xbattiwalla/src/ResourcePlanner && npm run lint 2>&1
```

Expected: no errors.

- [ ] **Step 17: Commit**

```bash
cd /Users/xbattiwalla/src/ResourcePlanner && git add src/App.tsx src/App.test.tsx docs/superpowers/specs/2026-06-13-milestone-context-menu-design.md docs/superpowers/plans/2026-06-13-milestone-context-menu.md && git commit -m "feat: add/remove milestones via right-click context menu"
```
