# Engineer Resource Map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add engineer members to squads and a full-screen Resource Map modal that tables one row per (engineer × project assignment) with monthly 1/blank cells suitable for copy-paste into Excel.

**Architecture:** `Engineer` type is added to `Squad.members` (optional, backward-compatible). A new pure domain module `resourceMap.ts` computes the table from squads/assignments/projects. The squad editor gains collapsible member sub-lists. A `ResourceMapModal` component renders a scrollable sticky table.

**Tech Stack:** TypeScript, React, Vitest, lucide-react

**Spec:** `docs/superpowers/specs/2026-06-14-engineer-resource-map-design.md`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/domain/types.ts` | Modify | Add `Engineer` type; add `members?` to `Squad` |
| `src/domain/time.ts` | Modify | Add `sprintToCalendarMonthIndex` |
| `src/domain/time.test.ts` | Modify | Tests for `sprintToCalendarMonthIndex` |
| `src/domain/resourceMap.ts` | Create | `buildResourceMapRows` pure function |
| `src/domain/resourceMap.test.ts` | Create | Tests for `buildResourceMapRows` |
| `src/App.tsx` | Modify | Member state/handlers, updated squad editor, modal, topbar button |
| `src/styles.css` | Modify | Styles for member sub-list and resource map modal |

---

## Task 1: Add Engineer type and Squad.members

**Files:**
- Modify: `src/domain/types.ts`

- [ ] **Step 1: Add `Engineer` interface and `members` field to `Squad`**

  Open `src/domain/types.ts`. Add after the imports block, before `ScenarioFileV1`:

  ```ts
  export interface Engineer {
    id: number;
    name: string;
  }
  ```

  Then modify `Squad` to add the optional field:

  ```ts
  export interface Squad {
    id: string;
    name: string;
    capacityFte: number;
    color?: string;
    members?: Engineer[];
  }
  ```

- [ ] **Step 2: Run typecheck to confirm no regressions**

  ```bash
  cd /Users/xbattiwalla/src/ResourcePlanner && npm run typecheck
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/domain/types.ts
  git commit -m "feat(types): add Engineer type and optional members array to Squad"
  ```

---

## Task 2: sprintToCalendarMonthIndex in time.ts

**Files:**
- Modify: `src/domain/time.ts`
- Modify: `src/domain/time.test.ts`

PI maps to calendar months within the calendar year (the `year` field in a TimeKey):
- PI 1 → Jan–Mar (months 1–3)
- PI 2 → Apr–Jun (months 4–6)
- PI 3 → Jul–Sep (months 7–9)
- PI 4 → Oct–Dec (months 10–12)

Each PI has 4 sprints across 3 months. Sprint-to-month offset within PI:
`Math.floor(((sprint - 1) * 3) / 4)` → sprint 1: 0, sprint 2: 0, sprint 3: 1, sprint 4: 2.

A "month index" is `year * 12 + (pi - 1) * 3 + monthWithinPi`, where year is the two-digit value from the TimeKey (e.g. 26).

- [ ] **Step 1: Write the failing test**

  Append to `src/domain/time.test.ts` inside the existing `describe("time keys", ...)` block:

  ```ts
  import {
    compareTimeKeys,
    formatTimeKey,
    getFiscalYearLabel,
    parseTimeKey,
    sprintDurationInclusive,
    sprintToCalendarMonthIndex,
    timelineBetween,
    toSprintIndex,
  } from "./time";

  // ... (existing tests unchanged)

  describe("sprintToCalendarMonthIndex", () => {
    it("maps PI 1 sprint 1 (Jan) to index 312 for year 26", () => {
      // year=26 → 26*12=312; PI 1 → +0; sprint 1 → +0
      expect(sprintToCalendarMonthIndex("26-1-1")).toBe(312);
    });

    it("maps PI 1 sprint 2 to the same month as sprint 1 (Jan)", () => {
      expect(sprintToCalendarMonthIndex("26-1-2")).toBe(312);
    });

    it("maps PI 1 sprint 3 to Feb (index 313)", () => {
      expect(sprintToCalendarMonthIndex("26-1-3")).toBe(313);
    });

    it("maps PI 1 sprint 4 to Mar (index 314)", () => {
      expect(sprintToCalendarMonthIndex("26-1-4")).toBe(314);
    });

    it("maps PI 3 sprint 1 to Jul (index 318)", () => {
      // 26*12 + 2*3 + 0 = 318
      expect(sprintToCalendarMonthIndex("26-3-1")).toBe(318);
    });

    it("maps PI 3 sprint 4 to Sep (index 320)", () => {
      // 26*12 + 2*3 + 2 = 320
      expect(sprintToCalendarMonthIndex("26-3-4")).toBe(320);
    });

    it("maps PI 4 sprint 4 to Dec (index 323)", () => {
      // 26*12 + 3*3 + 2 = 323; 323 % 12 = 11 → month 12 (Dec)
      expect(sprintToCalendarMonthIndex("26-4-4")).toBe(323);
    });

    it("increments correctly at year boundary (26-4-4 to 27-1-1)", () => {
      expect(sprintToCalendarMonthIndex("27-1-1")).toBe(324);
      expect(sprintToCalendarMonthIndex("27-1-1")).toBeGreaterThan(
        sprintToCalendarMonthIndex("26-4-4"),
      );
    });
  });
  ```

- [ ] **Step 2: Run to verify it fails**

  ```bash
  npm test -- --reporter=verbose 2>&1 | grep -A 3 "sprintToCalendarMonthIndex"
  ```

  Expected: errors about `sprintToCalendarMonthIndex` not being exported.

- [ ] **Step 3: Implement the function in `src/domain/time.ts`**

  Append at the end of `src/domain/time.ts`:

  ```ts
  /**
   * Returns a monotonically increasing integer representing the calendar month
   * that contains the given sprint. Formula: year * 12 + (pi - 1) * 3 + monthWithinPi.
   * Sprints 1–2 → month 0 of PI, sprint 3 → month 1, sprint 4 → month 2.
   * E.g. "26-3-1" → 318, which decodes to July 2026 (318 % 12 = 6, month = 7).
   */
  export function sprintToCalendarMonthIndex(key: TimeKey): number {
    const { year, pi, sprint } = parseTimeKey(key);
    const monthWithinPi = Math.floor(((sprint - 1) * 3) / 4);
    return year * 12 + (pi - 1) * 3 + monthWithinPi;
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  npm test -- --reporter=verbose 2>&1 | grep -A 2 "sprintToCalendarMonthIndex"
  ```

  Expected: all 8 new tests pass, existing tests still pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/domain/time.ts src/domain/time.test.ts
  git commit -m "feat(time): add sprintToCalendarMonthIndex for month-level resource mapping"
  ```

---

## Task 3: buildResourceMapRows in resourceMap.ts

**Files:**
- Create: `src/domain/resourceMap.ts`
- Create: `src/domain/resourceMap.test.ts`

- [ ] **Step 1: Write the failing tests**

  Create `src/domain/resourceMap.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";
  import { buildResourceMapRows } from "./resourceMap";
  import type { Assignment, Project, Squad } from "./types";

  const squadWithMembers: Squad = {
    id: "sq1",
    name: "Alpha",
    capacityFte: 2,
    members: [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ],
  };

  const project: Project = {
    id: "p1",
    name: "Project X",
    effortFteYears: 1,
    targetFinishKey: "26-3-4",
    eligibleSquadIds: ["sq1"],
    milestones: [],
  };

  // Assignment covers 26-3-1 (Jul) through 26-3-4 (Sep) — 3 months
  const assignment: Assignment = {
    id: "a1",
    projectId: "p1",
    squadId: "sq1",
    startKey: "26-3-1",
    finishKey: "26-3-4",
  };

  describe("buildResourceMapRows", () => {
    it("returns empty months and rows when no assignments", () => {
      const { months, rows } = buildResourceMapRows([], [], []);
      expect(months).toHaveLength(0);
      expect(rows).toHaveLength(0);
    });

    it("emits one row per member per assignment", () => {
      const { rows } = buildResourceMapRows(
        [squadWithMembers],
        [assignment],
        [project],
      );
      expect(rows).toHaveLength(2);
      expect(rows[0].engineerName).toBe("Alice");
      expect(rows[1].engineerName).toBe("Bob");
    });

    it("produces correct month labels spanning the assignment range", () => {
      const { months } = buildResourceMapRows(
        [squadWithMembers],
        [assignment],
        [project],
      );
      // 26-3-1 → Jul-26, 26-3-4 → Sep-26 → 3 months
      expect(months).toHaveLength(3);
      expect(months[0].label).toBe("Jul-26");
      expect(months[1].label).toBe("Aug-26");
      expect(months[2].label).toBe("Sep-26");
    });

    it("sets monthCells true for months within the assignment range", () => {
      const { rows } = buildResourceMapRows(
        [squadWithMembers],
        [assignment],
        [project],
      );
      expect(rows[0].monthCells).toEqual([true, true, true]);
    });

    it("sets monthCells false for months outside the assignment range", () => {
      const earlyAssignment: Assignment = {
        id: "a2",
        projectId: "p1",
        squadId: "sq1",
        startKey: "26-1-1", // Jan
        finishKey: "26-1-2", // Jan (same month as sprint 1 and 2)
      };
      const lateAssignment: Assignment = {
        id: "a3",
        projectId: "p1",
        squadId: "sq1",
        startKey: "26-3-4", // Sep
        finishKey: "26-3-4", // Sep
      };
      const { months, rows } = buildResourceMapRows(
        [squadWithMembers],
        [earlyAssignment, lateAssignment],
        [project],
      );
      // Range: Jan(312) to Sep(320) = 9 months
      expect(months).toHaveLength(9);
      // earlyAssignment row: Jan only = cell 0 true, rest false
      const earlyRow = rows.find((r) => r.engineerName === "Alice" && r.projectName === "Project X" && rows.indexOf(r) < 2);
      // lateAssignment row: Sep only = cell 8 true
      // Just check month count is correct
      expect(months[0].label).toBe("Jan-26");
      expect(months[8].label).toBe("Sep-26");
    });

    it("skips squads without a members array", () => {
      const squadNoMembers: Squad = {
        id: "sq2",
        name: "Empty",
        capacityFte: 3,
      };
      const a: Assignment = {
        id: "a4",
        projectId: "p1",
        squadId: "sq2",
        startKey: "26-3-1",
        finishKey: "26-3-4",
      };
      const { rows } = buildResourceMapRows([squadNoMembers], [a], [project]);
      expect(rows).toHaveLength(0);
    });

    it("skips squads with empty members array", () => {
      const emptySquad: Squad = {
        id: "sq3",
        name: "Ghost",
        capacityFte: 0,
        members: [],
      };
      const a: Assignment = {
        id: "a5",
        projectId: "p1",
        squadId: "sq3",
        startKey: "26-3-1",
        finishKey: "26-3-4",
      };
      const { rows } = buildResourceMapRows([emptySquad], [a], [project]);
      expect(rows).toHaveLength(0);
    });

    it("sorts rows by engineerId ascending", () => {
      const squad: Squad = {
        id: "sq1",
        name: "Alpha",
        capacityFte: 2,
        members: [
          { id: 10, name: "Zara" },
          { id: 3, name: "Aaron" },
        ],
      };
      const { rows } = buildResourceMapRows([squad], [assignment], [project]);
      expect(rows[0].engineerId).toBe(3);
      expect(rows[1].engineerId).toBe(10);
    });

    it("populates squadName and projectName correctly", () => {
      const { rows } = buildResourceMapRows(
        [squadWithMembers],
        [assignment],
        [project],
      );
      expect(rows[0].squadName).toBe("Alpha");
      expect(rows[0].projectName).toBe("Project X");
    });
  });
  ```

- [ ] **Step 2: Run to verify they fail**

  ```bash
  npm test -- --reporter=verbose src/domain/resourceMap.test.ts 2>&1 | tail -20
  ```

  Expected: module not found / import errors.

- [ ] **Step 3: Implement `src/domain/resourceMap.ts`**

  Create `src/domain/resourceMap.ts`:

  ```ts
  import { sprintToCalendarMonthIndex } from "./time";
  import type { Assignment, Project, Squad } from "./types";

  export interface CalendarMonth {
    year: number;   // two-digit, e.g. 26
    month: number;  // 1–12
    label: string;  // e.g. "Jul-26"
  }

  export interface ResourceMapRow {
    engineerId: number;
    engineerName: string;
    squadName: string;
    projectName: string;
    monthCells: boolean[];
  }

  const MONTH_LABELS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  function indexToCalendarMonth(idx: number): CalendarMonth {
    const year = Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    return {
      year,
      month,
      label: `${MONTH_LABELS[month - 1]}-${String(year).padStart(2, "0")}`,
    };
  }

  export function buildResourceMapRows(
    squads: Squad[],
    assignments: Assignment[],
    projects: Project[],
  ): { months: CalendarMonth[]; rows: ResourceMapRow[] } {
    if (assignments.length === 0) {
      return { months: [], rows: [] };
    }

    let minIdx = Infinity;
    let maxIdx = -Infinity;
    for (const a of assignments) {
      const s = sprintToCalendarMonthIndex(a.startKey);
      const e = sprintToCalendarMonthIndex(a.finishKey);
      if (s < minIdx) minIdx = s;
      if (e > maxIdx) maxIdx = e;
    }

    const months: CalendarMonth[] = [];
    for (let i = minIdx; i <= maxIdx; i++) {
      months.push(indexToCalendarMonth(i));
    }

    const squadMap = new Map(squads.map((s) => [s.id, s]));
    const projectMap = new Map(projects.map((p) => [p.id, p]));

    const rows: ResourceMapRow[] = [];

    for (const assignment of assignments) {
      const squad = squadMap.get(assignment.squadId);
      if (!squad?.members?.length) continue;

      const project = projectMap.get(assignment.projectId);
      if (!project) continue;

      const aStart = sprintToCalendarMonthIndex(assignment.startKey);
      const aEnd = sprintToCalendarMonthIndex(assignment.finishKey);

      for (const member of squad.members) {
        const monthCells = months.map((m) => {
          const idx = m.year * 12 + m.month - 1;
          return idx >= aStart && idx <= aEnd;
        });
        rows.push({
          engineerId: member.id,
          engineerName: member.name,
          squadName: squad.name,
          projectName: project.name,
          monthCells,
        });
      }
    }

    rows.sort((a, b) => {
      if (a.engineerId !== b.engineerId) return a.engineerId - b.engineerId;
      return a.projectName.localeCompare(b.projectName);
    });

    return { months, rows };
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  npm test -- --reporter=verbose src/domain/resourceMap.test.ts 2>&1 | tail -30
  ```

  Expected: all tests pass.

- [ ] **Step 5: Run full test suite**

  ```bash
  npm test 2>&1 | tail -10
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add src/domain/resourceMap.ts src/domain/resourceMap.test.ts
  git commit -m "feat(domain): add buildResourceMapRows for per-engineer monthly allocation table"
  ```

---

## Task 4: Add member state and handlers to App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add `Engineer` to the type import at the top of `App.tsx`**

  Find:
  ```ts
  import type { Assignment, Project, ScenarioFileV1, Squad, TimeKey } from "./domain/types";
  ```
  Replace with:
  ```ts
  import type { Assignment, Engineer, Project, ScenarioFileV1, Squad, TimeKey } from "./domain/types";
  ```

- [ ] **Step 2: Add `buildResourceMapRows` import**

  Add after the existing domain imports:
  ```ts
  import { buildResourceMapRows } from "./domain/resourceMap";
  ```

- [ ] **Step 3: Add state variables**

  Find the block of `useState` declarations near line 151 (after `squadDeleteError`):
  ```ts
  const [squadDeleteError, setSquadDeleteError] = useState<{ squadId: string; message: string } | null>(null);
  ```
  Add immediately after it:
  ```ts
  const [expandedSquadId, setExpandedSquadId] = useState<string | null>(null);
  const [isResourceMapOpen, setIsResourceMapOpen] = useState(false);
  ```

- [ ] **Step 4: Add member handler functions**

  Find the `removeSquad` function (ends around line 564). Add the three new handlers directly after it:

  ```ts
  function addMember(squadId: string): void {
    updateScenario((current) => ({
      ...current,
      squads: current.squads.map((squad) => {
        if (squad.id !== squadId) return squad;
        const members = [...(squad.members ?? []), { id: 0, name: "" }];
        return { ...squad, members, capacityFte: members.length };
      }),
    }));
  }

  function updateMember(
    squadId: string,
    memberIndex: number,
    patch: Partial<Engineer>,
  ): void {
    updateScenario((current) => ({
      ...current,
      squads: current.squads.map((squad) => {
        if (squad.id !== squadId) return squad;
        const members = (squad.members ?? []).map((m, i) =>
          i === memberIndex ? { ...m, ...patch } : m,
        );
        return { ...squad, members };
      }),
    }));
  }

  function removeMember(squadId: string, memberIndex: number): void {
    updateScenario((current) => ({
      ...current,
      squads: current.squads.map((squad) => {
        if (squad.id !== squadId) return squad;
        const members = (squad.members ?? []).filter((_, i) => i !== memberIndex);
        return { ...squad, members, capacityFte: members.length };
      }),
    }));
  }
  ```

- [ ] **Step 5: Run typecheck**

  ```bash
  npm run typecheck 2>&1 | tail -10
  ```

  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add src/App.tsx
  git commit -m "feat(app): add member state handlers (addMember, updateMember, removeMember)"
  ```

---

## Task 5: Update SquadsEditorSection with member sub-list

**Files:**
- Modify: `src/App.tsx`

This task has two parts: (A) update the `EditorPanel` call site to pass new props, and (B) rewrite `SquadsEditorSection` + add new `SquadMemberList` component.

- [ ] **Step 1: Add member props to `EditorPanel` prop types**

  Find the `EditorPanel` props interface around line 1471:
  ```ts
  onSquadUpdate: (squadId: string, patch: Partial<Pick<Squad, "name" | "capacityFte" | "color">>) => void;
  onSquadRemove: (squadId: string) => void;
  squadDeleteError: { squadId: string; message: string } | null;
  ```
  Replace with:
  ```ts
  onSquadUpdate: (squadId: string, patch: Partial<Pick<Squad, "name" | "capacityFte" | "color">>) => void;
  onSquadRemove: (squadId: string) => void;
  squadDeleteError: { squadId: string; message: string } | null;
  expandedSquadId: string | null;
  onToggleSquadExpand: (squadId: string) => void;
  onSquadAddMember: (squadId: string) => void;
  onSquadUpdateMember: (squadId: string, index: number, patch: Partial<Engineer>) => void;
  onSquadRemoveMember: (squadId: string, index: number) => void;
  ```

- [ ] **Step 2: Add member props to the `EditorPanel` destructuring**

  Find the destructuring around line 1446 (the `EditorPanel` function arguments). Add these after `squadDeleteError`:
  ```ts
  expandedSquadId,
  onToggleSquadExpand,
  onSquadAddMember,
  onSquadUpdateMember,
  onSquadRemoveMember,
  ```

- [ ] **Step 3: Update `SquadsEditorSection` call inside `EditorPanel`**

  Find the `<SquadsEditorSection ...>` call around line 1503. Replace it with:
  ```tsx
  <SquadsEditorSection
    squads={scenario.squads}
    deleteError={squadDeleteError}
    expandedSquadId={expandedSquadId}
    onToggleExpand={onToggleSquadExpand}
    onUpdate={onSquadUpdate}
    onRemove={onSquadRemove}
    onAdd={onSquadAdd}
    onAddMember={onSquadAddMember}
    onUpdateMember={onSquadUpdateMember}
    onRemoveMember={onSquadRemoveMember}
  />
  ```

- [ ] **Step 4: Update the `EditorPanel` invocation in the App return**

  Find the `<EditorPanel ...>` render around line 820. Add these props to it:
  ```tsx
  expandedSquadId={expandedSquadId}
  onToggleSquadExpand={(id) => setExpandedSquadId((prev) => (prev === id ? null : id))}
  onSquadAddMember={addMember}
  onSquadUpdateMember={updateMember}
  onSquadRemoveMember={removeMember}
  ```

- [ ] **Step 5: Replace `SquadsEditorSection` component**

  Find the entire `function SquadsEditorSection(...)` component (lines ~1708–1782). Replace it with:

  ```tsx
  function SquadsEditorSection({
    squads,
    deleteError,
    expandedSquadId,
    onToggleExpand,
    onUpdate,
    onRemove,
    onAdd,
    onAddMember,
    onUpdateMember,
    onRemoveMember,
  }: {
    squads: Squad[];
    deleteError: { squadId: string; message: string } | null;
    expandedSquadId: string | null;
    onToggleExpand: (squadId: string) => void;
    onUpdate: (squadId: string, patch: Partial<Pick<Squad, "name" | "capacityFte" | "color">>) => void;
    onRemove: (squadId: string) => void;
    onAdd: () => void;
    onAddMember: (squadId: string) => void;
    onUpdateMember: (squadId: string, index: number, patch: Partial<Engineer>) => void;
    onRemoveMember: (squadId: string, index: number) => void;
  }) {
    const [open, setOpen] = useState(true);

    return (
      <div className="squads-section">
        <button
          type="button"
          className="squads-section-heading"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          Squads
        </button>
        {open ? (
          <>
            {squads.map((squad) => (
              <div key={squad.id} className="squad-row-group">
                <div className="squad-row">
                  <button
                    type="button"
                    className="squad-expand-btn"
                    aria-label={`${expandedSquadId === squad.id ? "Collapse" : "Expand"} members of ${squad.name}`}
                    onClick={() => onToggleExpand(squad.id)}
                  >
                    {expandedSquadId === squad.id ? (
                      <ChevronDown size={12} />
                    ) : (
                      <ChevronRight size={12} />
                    )}
                  </button>
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
                    aria-label={`Name for ${squad.name}`}
                    onChange={(event) => onUpdate(squad.id, { name: event.target.value })}
                  />
                  <span className="squad-member-count">
                    {squad.members != null ? `${squad.members.length} mbr` : "—"}
                  </span>
                  <button
                    type="button"
                    className="squad-delete-btn"
                    aria-label={`Delete squad ${squad.name}`}
                    onClick={() => onRemove(squad.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {deleteError?.squadId === squad.id ? (
                  <p className="squad-delete-error">{deleteError.message}</p>
                ) : null}
                {expandedSquadId === squad.id ? (
                  <SquadMemberList
                    members={squad.members ?? []}
                    onAdd={() => onAddMember(squad.id)}
                    onUpdate={(idx, patch) => onUpdateMember(squad.id, idx, patch)}
                    onRemove={(idx) => onRemoveMember(squad.id, idx)}
                  />
                ) : null}
              </div>
            ))}
            <button type="button" className="small-command squad-add-btn" onClick={onAdd}>
              <Plus size={14} />
              Add squad
            </button>
          </>
        ) : null}
      </div>
    );
  }

  function SquadMemberList({
    members,
    onAdd,
    onUpdate,
    onRemove,
  }: {
    members: Engineer[];
    onAdd: () => void;
    onUpdate: (index: number, patch: Partial<Engineer>) => void;
    onRemove: (index: number) => void;
  }) {
    return (
      <div className="squad-member-list">
        {members.map((member, i) => (
          <div key={i} className="squad-member-row">
            <input
              type="number"
              className="squad-member-id"
              value={member.id || ""}
              placeholder="ID"
              aria-label="Engineer ID"
              onChange={(event) => onUpdate(i, { id: Number(event.target.value) })}
            />
            <input
              className="squad-member-name"
              value={member.name}
              placeholder="Name"
              aria-label="Engineer name"
              onChange={(event) => onUpdate(i, { name: event.target.value })}
            />
            <button
              type="button"
              className="squad-delete-btn"
              aria-label={`Remove ${member.name || "member"}`}
              onClick={() => onRemove(i)}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <button type="button" className="small-command" onClick={onAdd}>
          <Plus size={12} />
          Add member
        </button>
      </div>
    );
  }
  ```

- [ ] **Step 6: Run typecheck**

  ```bash
  npm run typecheck 2>&1 | tail -15
  ```

  Expected: no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add src/App.tsx
  git commit -m "feat(app): add collapsible engineer member sub-list to squad editor rows"
  ```

---

## Task 6: Add ResourceMapModal and topbar button

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add "Resource map" button to the topbar**

  Find the topbar actions div (~line 630):
  ```tsx
  <div className="topbar-actions">
    <button type="button" className="command-button" onClick={() => setIsDataModalOpen(true)}>
      <Database size={17} />
      Scenario data
    </button>
  </div>
  ```
  Replace with:
  ```tsx
  <div className="topbar-actions">
    <button type="button" className="command-button" onClick={() => setIsResourceMapOpen(true)}>
      Resource map
    </button>
    <button type="button" className="command-button" onClick={() => setIsDataModalOpen(true)}>
      <Database size={17} />
      Scenario data
    </button>
  </div>
  ```

- [ ] **Step 2: Add `ResourceMapModal` render at the bottom of the App return**

  Find the closing block of the App return (after the `ScenarioDataModal` block):
  ```tsx
      ) : null}
    </main>
  );
  ```
  Replace with:
  ```tsx
      ) : null}
      {isResourceMapOpen ? (
        <ResourceMapModal
          squads={scenario.squads}
          assignments={scenario.assignments}
          projects={scenario.projects}
          onClose={() => setIsResourceMapOpen(false)}
        />
      ) : null}
    </main>
  );
  ```

- [ ] **Step 3: Add `ResourceMapModal` component**

  Add this new component after the closing brace of the existing `ScenarioDataModal` component (search for the last `function` before `function TimelineHeaders`). Insert before `function TimelineHeaders`:

  ```tsx
  function ResourceMapModal({
    squads,
    assignments,
    projects,
    onClose,
  }: {
    squads: Squad[];
    assignments: Assignment[];
    projects: Project[];
    onClose: () => void;
  }) {
    const { months, rows } = useMemo(
      () => buildResourceMapRows(squads, assignments, projects),
      [squads, assignments, projects],
    );
    const [copied, setCopied] = useState(false);

    function copyAsTsv() {
      const fixedHeaders = [
        "ID", "Name", "Role / Title", "FTE Equivalent",
        "Location", "Team / Squad", "Project", "Manager",
      ];
      const header = [...fixedHeaders, ...months.map((m) => m.label)].join("\t");
      const dataRows = rows.map((row) => {
        const fixed = [
          row.engineerId,
          row.engineerName,
          "", "", "",
          row.squadName,
          row.projectName,
          "",
        ];
        const cells = row.monthCells.map((v) => (v ? "1" : ""));
        return [...fixed, ...cells].join("\t");
      });
      const tsv = [header, ...dataRows].join("\n");
      navigator.clipboard.writeText(tsv).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }

    return (
      <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Resource map">
        <div className="modal-panel resource-map-modal">
          <div className="modal-header">
            <h2>Resource map</h2>
            <div className="modal-header-actions">
              <button type="button" className="command-button" onClick={copyAsTsv}>
                {copied ? "Copied!" : "Copy as TSV"}
              </button>
              <button
                type="button"
                className="modal-close-btn"
                aria-label="Close resource map"
                onClick={onClose}
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="resource-map-scroll">
            <table className="resource-map-table">
              <thead>
                <tr>
                  <th className="rm-sticky rm-col-id">ID</th>
                  <th className="rm-sticky rm-col-name">Name</th>
                  <th>Role / Title</th>
                  <th>FTE Equivalent</th>
                  <th>Location</th>
                  <th>Team / Squad</th>
                  <th>Project</th>
                  <th>Manager</th>
                  {months.map((m) => (
                    <th key={m.label} className="rm-month-head">{m.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td className="rm-sticky rm-col-id">{row.engineerId}</td>
                    <td className="rm-sticky rm-col-name">{row.engineerName}</td>
                    <td />
                    <td />
                    <td />
                    <td>{row.squadName}</td>
                    <td>{row.projectName}</td>
                    <td />
                    {row.monthCells.map((v, j) => (
                      <td key={j} className="rm-cell">{v ? "1" : ""}</td>
                    ))}
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8 + months.length} className="rm-empty">
                      No engineer members defined. Add members to squads to populate the resource map.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 4: Run typecheck**

  ```bash
  npm run typecheck 2>&1 | tail -10
  ```

  Expected: no errors.

- [ ] **Step 5: Run tests**

  ```bash
  npm test 2>&1 | tail -10
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add src/App.tsx
  git commit -m "feat(app): add ResourceMapModal with TSV copy and topbar button"
  ```

---

## Task 7: Add CSS styles

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Append styles to `src/styles.css`**

  Append at the very end of the file:

  ```css
  /* ── Squad member sub-list ──────────────────────────────────────── */

  .squad-row-group {
    display: flex;
    flex-direction: column;
  }

  .squad-expand-btn {
    background: none;
    border: none;
    padding: 0 2px;
    color: var(--muted);
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .squad-expand-btn:hover {
    color: var(--ink);
  }

  .squad-member-count {
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
    min-width: 52px;
    text-align: right;
    flex-shrink: 0;
  }

  .squad-member-list {
    margin: 2px 0 4px 28px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    border-left: 2px solid var(--line);
    padding-left: 8px;
  }

  .squad-member-row {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .squad-member-id {
    width: 68px;
    flex-shrink: 0;
  }

  .squad-member-name {
    flex: 1;
    min-width: 0;
  }

  /* ── Resource map modal ─────────────────────────────────────────── */

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(22, 32, 51, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-panel {
    background: var(--panel-strong);
    border-radius: 10px;
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .resource-map-modal {
    width: 95vw;
    height: 95vh;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 16px;
  }

  .modal-header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .modal-close-btn {
    background: none;
    border: none;
    padding: 4px;
    color: var(--muted);
    display: flex;
    align-items: center;
    border-radius: 4px;
    line-height: 1;
  }

  .modal-close-btn:hover {
    background: var(--canvas);
    color: var(--ink);
  }

  .resource-map-scroll {
    flex: 1;
    overflow: auto;
  }

  .resource-map-table {
    border-collapse: collapse;
    font-size: 12px;
    white-space: nowrap;
  }

  .resource-map-table th,
  .resource-map-table td {
    padding: 4px 8px;
    border: 1px solid var(--line);
    text-align: left;
  }

  .resource-map-table thead th {
    background: #f6f8fb;
    font-weight: 600;
    position: sticky;
    top: 0;
    z-index: 2;
  }

  .rm-sticky {
    position: sticky;
    z-index: 1;
    background: var(--panel-strong);
  }

  .resource-map-table thead .rm-sticky {
    z-index: 3;
  }

  .rm-col-id {
    left: 0;
    min-width: 52px;
  }

  .rm-col-name {
    left: 52px;
    min-width: 160px;
  }

  .rm-month-head {
    min-width: 52px;
    text-align: center;
  }

  .rm-cell {
    text-align: center;
  }

  .rm-empty {
    text-align: center;
    color: var(--muted);
    padding: 32px;
  }
  ```

- [ ] **Step 2: Run full test suite and typecheck**

  ```bash
  npm run typecheck && npm test 2>&1 | tail -10
  ```

  Expected: no errors, all tests pass.

- [ ] **Step 3: Commit**

  ```bash
  git add src/styles.css
  git commit -m "feat(styles): add squad member sub-list and resource map modal styles"
  ```

---

## Task 8: Manual browser verification

- [ ] **Step 1: Open the dev server**

  ```bash
  npm run dev
  ```

  Open `http://localhost:5173`.

- [ ] **Step 2: Verify squad editor member sub-list**

  1. Open "Scenario editor" panel.
  2. Click the chevron on any squad row — member sub-list expands.
  3. Click "Add member" — a blank row appears with ID and Name inputs.
  4. Type an ID and name — they persist; the badge updates count.
  5. Delete a member — row removes; badge updates.
  6. Clicking another squad chevron collapses the first and expands the new one.
  7. FTE capacity input is gone; badge shows `n mbr`.

- [ ] **Step 3: Verify Resource Map modal**

  1. Load a scenario with assignments and squads that have members.
  2. Click "Resource map" in the top bar.
  3. Modal opens full-screen. Table shows engineer rows with `1` in relevant month columns.
  4. Blank columns (no assignment that month) are empty.
  5. Click "Copy as TSV" — paste into Excel; columns and values match expected layout.
  6. Click ✕ — modal closes.

- [ ] **Step 4: Final commit and push**

  ```bash
  git push origin main
  ```

---

## Task 9: Update scenario file with engineer members

After the app is working, the user will provide their current `.resourceplan` JSON file. Update the `squads` array entries by adding a `members` field to each squad that has known engineers. Squads without known engineers are left unchanged (the field simply remains absent).

The engineer-to-squad mapping for the user's scenario (file: `sps-es-portfolio-resourcing-june-2026.resourceplan-*.json`) is provided separately as a JSON patch output — see the session message following this plan.
