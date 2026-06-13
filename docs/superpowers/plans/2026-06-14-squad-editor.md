# Squad Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inline squad editor section to the side panel that lets users add, rename, set FTE capacity, set colour, and remove squads — with a guard that blocks deletion when assignments exist.

**Architecture:** All changes are in `src/App.tsx` (new state, two new handler functions, a new `SquadsEditorSection` component, and updates to `EditorPanel` props/render). CSS additions go in `src/styles.css`. No new files are created.

**Tech Stack:** React 18, TypeScript, lucide-react (Trash2, Plus already imported), Vitest + React Testing Library

**Spec:** `docs/superpowers/specs/2026-06-14-squad-editor-design.md`

---

### Task 1: Write failing tests

**Files:**
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Add three failing tests to `src/App.test.tsx`**

Append these three `it` blocks inside the existing `describe("Portfolio Scenario Planner app", ...)` block:

```ts
  it("shows all squads with name, FTE, and colour inputs in the editor panel", () => {
    render(<App />);
    // sample scenario has squads "Squad A" and "Squad B"
    expect(screen.getByDisplayValue("Squad A")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Squad B")).toBeInTheDocument();
    // Each squad row has a number input for FTE
    const fteInputs = screen.getAllByRole("spinbutton");
    expect(fteInputs.length).toBeGreaterThanOrEqual(2);
  });

  it("updates squad name immediately when edited", async () => {
    const user = userEvent.setup();
    render(<App />);

    const nameInput = screen.getByDisplayValue("Squad A");
    await user.clear(nameInput);
    await user.type(nameInput, "Alpha Team");

    expect(screen.getByDisplayValue("Alpha Team")).toBeInTheDocument();
  });

  it("shows an error and does not delete a squad that has assignments", async () => {
    const user = userEvent.setup();
    render(<App />);

    // Squad A has assignments in the sample scenario — find its delete button
    const deleteButtons = screen.getAllByRole("button", { name: /delete squad/i });
    await user.click(deleteButtons[0]);

    expect(screen.getByText(/Remove all/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Squad A")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
cd /Users/xbattiwalla/src/ResourcePlanner && npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|shows all squads|updates squad name|shows an error)"
```

Expected: all three new tests FAIL (component doesn't have the squad editor yet).

---

### Task 2: Add `updateSquad` and `removeSquad` handlers in `App.tsx`

**Files:**
- Modify: `src/App.tsx` (around line 480, after `addSquad`)

- [ ] **Step 1: Add `squadDeleteError` state**

Find this block near the top of the `App` component (around line 133):

```ts
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
```

Add directly after it:

```ts
  const [squadDeleteError, setSquadDeleteError] = useState<{ squadId: string; message: string } | null>(null);
```

- [ ] **Step 2: Add `updateSquad` function**

Find the `addSquad` function (around line 480):

```ts
  function addSquad() {
    const id = `squad-${Date.now()}`;
    updateScenario((current) => ({
      ...current,
      squads: [
        ...current.squads,
        {
          id,
          name: "New squad",
          capacityFte: 5,
          color: "#0f766e",
        },
      ],
    }));
  }
```

Add these two functions directly after `addSquad`:

```ts
  function updateSquad(squadId: string, patch: Partial<Pick<Squad, "name" | "capacityFte" | "color">>) {
    setSquadDeleteError(null);
    updateScenario((current) => ({
      ...current,
      squads: current.squads.map((squad) =>
        squad.id === squadId ? { ...squad, ...patch } : squad,
      ),
    }));
  }

  function removeSquad(squadId: string) {
    const assignmentCount = scenario.assignments.filter((a) => a.squadId === squadId).length;
    if (assignmentCount > 0) {
      const squadName = scenario.squads.find((s) => s.id === squadId)?.name ?? "this squad";
      setSquadDeleteError({
        squadId,
        message: `Remove all ${assignmentCount} assignment${assignmentCount === 1 ? "" : "s"} for ${squadName} first.`,
      });
      return;
    }
    setSquadDeleteError(null);
    updateScenario((current) => ({
      ...current,
      squads: current.squads.filter((squad) => squad.id !== squadId),
    }));
  }
```

- [ ] **Step 3: Add Squad import**

Find the existing type import line near the top of the file:

```ts
import type { Assignment, Project, ScenarioFileV1, TimeKey } from "./domain/types";
```

Replace with:

```ts
import type { Assignment, Project, ScenarioFileV1, Squad, TimeKey } from "./domain/types";
```

---

### Task 3: Update `EditorPanel` props — remove `onAddSquad`, add squad editor props

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add four new props to the `EditorPanel` call site in `App`**

Find the `EditorPanel` JSX in the `App` return (around line 617). It currently ends with:

```tsx
            onAddProject={addProject}
            onAddSquad={addSquad}
          />
```

Replace those two lines with:

```tsx
            onAddProject={addProject}
            onSquadAdd={addSquad}
            onSquadUpdate={updateSquad}
            onSquadRemove={removeSquad}
            squadDeleteError={squadDeleteError}
          />
```

- [ ] **Step 2: Update `EditorPanel` function signature**

Find the `EditorPanel` function declaration and its props destructuring. The current props interface ends with:

```ts
  onAddProject: () => void;
  onAddSquad: () => void;
```

Replace those two lines with:

```ts
  onAddProject: () => void;
  onSquadAdd: () => void;
  onSquadUpdate: (squadId: string, patch: Partial<Pick<Squad, "name" | "capacityFte" | "color">>) => void;
  onSquadRemove: (squadId: string) => void;
  squadDeleteError: { squadId: string; message: string } | null;
```

And update the destructuring parameter list — replace `onAddSquad` with the four new props:

```ts
  onAddProject,
  onSquadAdd,
  onSquadUpdate,
  onSquadRemove,
  squadDeleteError,
```

- [ ] **Step 3: Remove "Add Squad" button from the toolbar row in `EditorPanel`**

Find this JSX inside `EditorPanel`:

```tsx
      <div className="editor-row">
        <button type="button" className="small-command" onClick={onAddProject}>
          <Plus size={14} />
          Project
        </button>
        <button type="button" className="small-command" onClick={onAddSquad}>
          <Plus size={14} />
          Squad
        </button>
        <button type="button" className="small-command" onClick={onAddAssignment}>
          <Plus size={14} />
          Assignment
        </button>
      </div>
```

Replace with (Squad button removed):

```tsx
      <div className="editor-row">
        <button type="button" className="small-command" onClick={onAddProject}>
          <Plus size={14} />
          Project
        </button>
        <button type="button" className="small-command" onClick={onAddAssignment}>
          <Plus size={14} />
          Assignment
        </button>
      </div>
```

- [ ] **Step 4: Add `SquadsEditorSection` into `EditorPanel` render**

Find the label for scenario name + the `editor-row` div in `EditorPanel`. Insert the `SquadsEditorSection` after the `editor-row` div and before the `{mode === "none" ? (` block:

Current:
```tsx
      <div className="editor-row">
        <button type="button" className="small-command" onClick={onAddProject}>
          <Plus size={14} />
          Project
        </button>
        <button type="button" className="small-command" onClick={onAddAssignment}>
          <Plus size={14} />
          Assignment
        </button>
      </div>

      {mode === "none" ? (
```

Replace with:
```tsx
      <div className="editor-row">
        <button type="button" className="small-command" onClick={onAddProject}>
          <Plus size={14} />
          Project
        </button>
        <button type="button" className="small-command" onClick={onAddAssignment}>
          <Plus size={14} />
          Assignment
        </button>
      </div>

      <SquadsEditorSection
        squads={scenario.squads}
        deleteError={squadDeleteError}
        onUpdate={onSquadUpdate}
        onRemove={onSquadRemove}
        onAdd={onSquadAdd}
      />

      {mode === "none" ? (
```

---

### Task 4: Add `SquadsEditorSection` component

**Files:**
- Modify: `src/App.tsx` (add new component near the other editor components, after `EditorPanel`)

- [ ] **Step 1: Add the component**

Find the `function InfoIcon` definition (the component after `EditorPanel`). Insert the new component immediately before it:

```tsx
function SquadsEditorSection({
  squads,
  deleteError,
  onUpdate,
  onRemove,
  onAdd,
}: {
  squads: Squad[];
  deleteError: { squadId: string; message: string } | null;
  onUpdate: (squadId: string, patch: Partial<Pick<Squad, "name" | "capacityFte" | "color">>) => void;
  onRemove: (squadId: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="squads-section">
      <div className="squads-section-heading">Squads</div>
      {squads.map((squad) => (
        <div key={squad.id} className="squad-row">
          <input
            type="color"
            className="squad-color-swatch"
            value={squad.color ?? "#0f766e"}
            aria-label={`Colour for ${squad.name}`}
            onChange={(event) => onUpdate(squad.id, { color: event.target.value })}
          />
          <input
            className="squad-name-input"
            value={squad.name}
            aria-label={`Name for squad`}
            onChange={(event) => onUpdate(squad.id, { name: event.target.value })}
          />
          <input
            type="number"
            className="squad-fte-input"
            min="0.5"
            step="0.5"
            value={squad.capacityFte}
            aria-label={`FTE capacity for ${squad.name}`}
            onChange={(event) => onUpdate(squad.id, { capacityFte: Number(event.target.value) })}
          />
          <button
            type="button"
            className="squad-delete-btn"
            aria-label={`Delete squad ${squad.name}`}
            onClick={() => onRemove(squad.id)}
          >
            <Trash2 size={14} />
          </button>
          {deleteError?.squadId === squad.id ? (
            <p className="squad-delete-error">{deleteError.message}</p>
          ) : null}
        </div>
      ))}
      <button type="button" className="small-command squad-add-btn" onClick={onAdd}>
        <Plus size={14} />
        Add squad
      </button>
    </div>
  );
}

```

---

### Task 5: Add CSS for squad editor

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add squad section styles**

Find the `.danger-command` rule (around line 587):

```css
.danger-command {
  margin: 12px 14px 0;
}
```

Add the following immediately after it:

```css
/* Squad editor section */
.squads-section {
  margin: 12px 14px 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.squads-section-heading {
  font-size: 11px;
  font-weight: 900;
  color: #46546a;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}

.squad-row {
  display: grid;
  grid-template-columns: 28px 1fr 52px 32px;
  grid-template-rows: auto auto;
  gap: 4px;
  align-items: center;
}

.squad-color-swatch {
  width: 28px;
  height: 28px;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: 5px;
  cursor: pointer;
  background: none;
}

.squad-name-input {
  height: 28px;
  border: 1px solid var(--line);
  border-radius: 5px;
  padding: 0 7px;
  font-size: 13px;
  color: var(--ink);
  background: #fff;
  min-width: 0;
}

.squad-fte-input {
  width: 52px;
  height: 28px;
  border: 1px solid var(--line);
  border-radius: 5px;
  padding: 0 5px;
  font-size: 13px;
  color: var(--ink);
  background: #fff;
  text-align: right;
}

.squad-delete-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid #fed7aa;
  border-radius: 5px;
  background: var(--panel-strong);
  color: #9a3412;
  cursor: pointer;
}

.squad-delete-btn:hover {
  background: #fff7ed;
}

.squad-delete-error {
  grid-column: 1 / -1;
  font-size: 11px;
  color: #9a3412;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 5px;
  padding: 4px 8px;
  margin: 0;
}

.squad-add-btn {
  align-self: flex-start;
  margin-top: 4px;
}
```

---

### Task 6: Verify and commit

**Files:** None new

- [ ] **Step 1: Run all tests**

```bash
cd /Users/xbattiwalla/src/ResourcePlanner && npm test 2>&1 | tail -20
```

Expected: all tests pass including the three new ones.

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/xbattiwalla/src/ResourcePlanner && npm run typecheck 2>&1
```

Expected: no errors.

- [ ] **Step 3: Run lint**

```bash
cd /Users/xbattiwalla/src/ResourcePlanner && npm run lint 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/xbattiwalla/src/ResourcePlanner && git add src/App.tsx src/styles.css src/App.test.tsx docs/superpowers/specs/2026-06-14-squad-editor-design.md docs/superpowers/plans/2026-06-14-squad-editor.md && git commit -m "feat: add inline squad editor to side panel

- SquadsEditorSection: per-squad name/FTE/colour inputs + delete guard
- updateSquad, removeSquad handlers in App
- Inline error shown when deleting a squad with assignments
- Add squad button moved into the squads section
- Tests: renders squad inputs, edits name, blocks deletion with assignments

Spec: docs/superpowers/specs/2026-06-14-squad-editor-design.md"
```

---

## Self-Review

**Spec coverage:**
- ✅ All squads listed with name, FTE, colour — Task 4
- ✅ Editing name/FTE/colour updates immediately — `updateSquad` in Task 2
- ✅ Add squad button in section footer — Task 4
- ✅ Delete with no assignments → removes — `removeSquad` in Task 2
- ✅ Delete with assignments → inline error — `removeSquad` + `deleteError` prop in Task 4
- ✅ Inline error clears on any squad edit — `setSquadDeleteError(null)` in `updateSquad`
- ✅ "Add Squad" removed from toolbar row — Task 3 Step 3
- ✅ Existing tests pass — Task 6 Step 1
- ✅ Future member list extensibility — row is `display: grid` with `grid-template-rows: auto auto`, error already uses `grid-column: 1 / -1`; expanding a sub-list is additive

**Placeholder scan:** None found.

**Type consistency:** `Squad` type imported in Task 2 Step 3. `Partial<Pick<Squad, "name" | "capacityFte" | "color">>` used consistently in Task 2, Task 3, and Task 4 component signature.
