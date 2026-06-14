import {
  Bold,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  Eye,
  FileUp,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  PenLine,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Underline as UnderlineIcon,
  X,
} from "lucide-react";
import {
  Fragment,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import {
  calculateCapacityHeatmap,
  calculateFeasibility,
  scenarioTimeline,
} from "./domain/feasibility";
import {
  calculateProjectCumulativeHeatmap,
  calculateProjectMilestoneCoverageHeatmap,
  calculateProjectSprintHeatmap,
  type ProjectCumulativeHeatmap,
  type ProjectSprintHeatmap,
} from "./domain/projectResourcing";
import { exportScenario, importScenario } from "./domain/scenario";
import {
  compareTimeKeys,
  getFiscalYearLabel,
  getPiLabel,
  parseTimeKey,
  shiftTimeKey,
  sprintDurationInclusive,
} from "./domain/time";
import { buildResourceMapRows } from "./domain/resourceMap";
import type { Assignment, Engineer, Project, ScenarioFileV1, Squad, TimeKey } from "./domain/types";
import { sampleScenario } from "./sampleScenario";

const STORAGE_KEY = "resourceplanner-autosave-v1";

function loadInitialScenario(): ScenarioFileV1 {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return importScenario(saved);
  } catch {
    // corrupt or unavailable, fall through
  }
  return sampleScenario;
}

function makeEmptyScenario(): ScenarioFileV1 {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    scenario: {
      id: `scenario-${Date.now()}`,
      name: "New scenario",
      createdAt: now,
      updatedAt: now,
    },
    calendar: {
      financialYearStartMonth: 7,
      piCountPerCalendarYear: 4,
      sprintsPerPi: 4,
    },
    squads: [],
    projects: [],
    assignments: [],
  };
}

const VIEW_YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => {
  const yy = String(24 + i).padStart(2, "0");
  return { yy, label: `CY20${yy}` };
});

type DragMode = "move" | "start" | "finish";

interface AssignmentDragState {
  kind: "assignment";
  assignmentId: string;
  mode: DragMode;
  originX: number;
  originStart: TimeKey;
  originFinish: TimeKey;
  cellWidth: number;
}

interface CreateDragState {
  kind: "create";
  projectId: string;
  squadId: string;
  originKey: TimeKey;
  currentKey: TimeKey;
}

type DragState = AssignmentDragState | CreateDragState;

interface AssignmentContextMenu {
  assignmentId: string;
  x: number;
  y: number;
}

interface LaneContextMenu {
  projectId: string;
  dateKey: TimeKey;
  milestoneId: string | null;
  x: number;
  y: number;
}

const statusLabel = {
  green: "On track",
  amber: "Tight",
  red: "At risk",
};

export default function App() {
  const [scenario, setScenario] = useState<ScenarioFileV1>(loadInitialScenario);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(
    () => loadInitialScenario().assignments[0]?.id ?? "",
  );
  const [selectedProjectId, setSelectedProjectId] = useState(
    () => loadInitialScenario().projects[0]?.id ?? "",
  );
  const [planningSquadId, setPlanningSquadId] = useState(
    () => { const s = loadInitialScenario(); return s.assignments[0]?.squadId ?? s.squads[0]?.id ?? ""; },
  );
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [squadDeleteError, setSquadDeleteError] = useState<{ squadId: string; message: string } | null>(null);
  const [expandedSquadId, setExpandedSquadId] = useState<string | null>(null);
  const [isResourceMapOpen, setIsResourceMapOpen] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [assignmentMenu, setAssignmentMenu] = useState<AssignmentContextMenu | null>(null);
  const [laneMenu, setLaneMenu] = useState<LaneContextMenu | null>(null);
  const [selectedSprintKey, setSelectedSprintKey] = useState<TimeKey | null>(null);
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(new Set());
  const boardRef = useRef<HTMLDivElement | null>(null);
  const capacityPanelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const board = boardRef.current;
    const capacity = capacityPanelRef.current;
    if (!board || !capacity) return;
    let syncing = false;
    function onBoardScroll() {
      if (syncing) return;
      syncing = true;
      capacity!.scrollLeft = board!.scrollLeft;
      syncing = false;
    }
    function onCapacityScroll() {
      if (syncing) return;
      syncing = true;
      board!.scrollLeft = capacity!.scrollLeft;
      syncing = false;
    }
    board.addEventListener("scroll", onBoardScroll);
    capacity.addEventListener("scroll", onCapacityScroll);
    return () => {
      board.removeEventListener("scroll", onBoardScroll);
      capacity.removeEventListener("scroll", onCapacityScroll);
    };
  }, []);

  const timeline = useMemo(() => scenarioTimeline(scenario), [scenario]);
  const feasibility = useMemo(() => calculateFeasibility(scenario), [scenario]);
  const heatmap = useMemo(() => calculateCapacityHeatmap(scenario), [scenario]);
  const cumulativeHeatmap = useMemo(() => calculateProjectCumulativeHeatmap(scenario), [scenario]);
  const milestoneCoverageHeatmap = useMemo(() => calculateProjectMilestoneCoverageHeatmap(scenario), [scenario]);
  const sprintHeatmap = useMemo(() => calculateProjectSprintHeatmap(scenario), [scenario]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, exportScenario(scenario));
    } catch {
      // storage full or unavailable
    }
  }, [scenario]);

  const selectedAssignment = scenario.assignments.find(
    (assignment) => assignment.id === selectedAssignmentId,
  );
  const selectedProject = scenario.projects.find(
    (project) => project.id === selectedProjectId,
  );

  const timelineStyle = {
    "--sprint-count": timeline.length,
  } as React.CSSProperties;

  function updateScenario(updater: (draft: ScenarioFileV1) => ScenarioFileV1) {
    setScenario((current) => {
      const next = updater(current);
      return {
        ...next,
        scenario: {
          ...next.scenario,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }

  function updateAssignment(
    assignmentId: string,
    patch: Partial<Pick<Assignment, "startKey" | "finishKey" | "projectId" | "squadId">>,
  ) {
    updateScenario((current) => ({
      ...current,
      assignments: current.assignments.map((assignment) =>
        assignment.id === assignmentId ? { ...assignment, ...patch } : assignment,
      ),
    }));
  }

  function moveAssignment(assignmentId: string, offset: number) {
    const assignment = scenario.assignments.find(
      (candidate) => candidate.id === assignmentId,
    );
    if (!assignment) return;

    const nextStart = clampToTimeline(shiftTimeKey(assignment.startKey, offset), timeline);
    const nextFinish = clampToTimeline(shiftTimeKey(assignment.finishKey, offset), timeline);
    if (compareTimeKeys(nextStart, timeline[0]) < 0 || compareTimeKeys(nextFinish, timeline.at(-1)!) > 0) {
      return;
    }
    updateAssignment(assignmentId, { startKey: nextStart, finishKey: nextFinish });
  }

  function resizeAssignment(assignmentId: string, edge: "start" | "finish", offset: number) {
    const assignment = scenario.assignments.find(
      (candidate) => candidate.id === assignmentId,
    );
    if (!assignment) return;

    if (edge === "start") {
      const startKey = clampToTimeline(shiftTimeKey(assignment.startKey, offset), timeline);
      if (compareTimeKeys(startKey, assignment.finishKey) <= 0) {
        updateAssignment(assignmentId, { startKey });
      }
    } else {
      const finishKey = clampToTimeline(shiftTimeKey(assignment.finishKey, offset), timeline);
      if (compareTimeKeys(finishKey, assignment.startKey) >= 0) {
        updateAssignment(assignmentId, { finishKey });
      }
    }
  }

  function handleAssignmentKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    assignmentId: string,
  ) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 1 : -1;
    if (event.shiftKey) {
      resizeAssignment(assignmentId, "finish", offset);
    } else {
      moveAssignment(assignmentId, offset);
    }
  }

  function startDrag(
    event: PointerEvent<HTMLElement>,
    assignment: Assignment,
    mode: DragMode,
  ) {
    if (event.button > 0) return;
    const board = boardRef.current;
    if (!board) return;
    const track = board.querySelector<HTMLElement>(".project-track");
    if (!track) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSelectedAssignmentId(assignment.id);
    setPlanningSquadId(assignment.squadId);
    setDrag({
      kind: "assignment",
      assignmentId: assignment.id,
      mode,
      originX: event.clientX,
      originStart: assignment.startKey,
      originFinish: assignment.finishKey,
      cellWidth: track.getBoundingClientRect().width / timeline.length,
    });
  }

  function startCreateDrag(event: PointerEvent<HTMLElement>, projectId: string) {
    if (event.button > 0) return;
    if (!planningSquadId || event.target !== event.currentTarget) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const key = pointerTimeKey(event, event.currentTarget, timeline);
    setSelectedProjectId(projectId);
    setDrag({
      kind: "create",
      projectId,
      squadId: planningSquadId,
      originKey: key,
      currentKey: key,
    });
  }

  function continueDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    if (drag.kind === "create") {
      const target = document.querySelector<HTMLElement>(
        `[data-testid="track-${drag.projectId}"]`,
      );
      if (!target) return;
      setDrag({
        ...drag,
        currentKey: pointerTimeKey(event, target, timeline),
      });
      return;
    }

    const offset = Math.round((event.clientX - drag.originX) / drag.cellWidth);
    const assignment = scenario.assignments.find(
      (candidate) => candidate.id === drag.assignmentId,
    );
    if (!assignment) return;

    if (drag.mode === "move") {
      const startKey = clampToTimeline(shiftTimeKey(drag.originStart, offset), timeline);
      const finishKey = clampToTimeline(shiftTimeKey(drag.originFinish, offset), timeline);
      if (
        sprintDurationInclusive(startKey, finishKey) ===
        sprintDurationInclusive(drag.originStart, drag.originFinish)
      ) {
        updateAssignment(drag.assignmentId, { startKey, finishKey });
      }
    }

    if (drag.mode === "start") {
      const startKey = clampToTimeline(shiftTimeKey(drag.originStart, offset), timeline);
      if (compareTimeKeys(startKey, assignment.finishKey) <= 0) {
        updateAssignment(drag.assignmentId, { startKey });
      }
    }

    if (drag.mode === "finish") {
      const finishKey = clampToTimeline(shiftTimeKey(drag.originFinish, offset), timeline);
      if (compareTimeKeys(finishKey, assignment.startKey) >= 0) {
        updateAssignment(drag.assignmentId, { finishKey });
      }
    }
  }

  function completeDrag() {
    if (drag?.kind === "create") {
      const [startKey, finishKey] = sortTimeKeys(drag.originKey, drag.currentKey);
      const id = `assignment-${Date.now()}`;
      updateScenario((current) => ({
        ...current,
        assignments: [
          ...current.assignments,
          {
            id,
            projectId: drag.projectId,
            squadId: drag.squadId,
            startKey,
            finishKey,
          },
        ],
      }));
      setSelectedAssignmentId(id);
      setSelectedProjectId(drag.projectId);
    }
    setDrag(null);
  }

  function openAssignmentMenu(event: MouseEvent<HTMLElement>, assignmentId: string) {
    event.preventDefault();
    event.stopPropagation();
    setDrag(null);
    setSelectedAssignmentId(assignmentId);
    setAssignmentMenu({
      assignmentId,
      x: event.clientX,
      y: event.clientY,
    });
  }

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

  function removeAssignment(assignmentId: string) {
    updateScenario((current) => ({
      ...current,
      assignments: current.assignments.filter(
        (assignment) => assignment.id !== assignmentId,
      ),
    }));
    setSelectedAssignmentId("");
    setSelectedProjectId("");
    setAssignmentMenu(null);
  }

  function addAssignment() {
    const project = scenario.projects[0];
    const squad =
      scenario.squads.find((candidate) => candidate.id === planningSquadId) ??
      scenario.squads[0];
    if (!project || !squad) return;
    const id = `assignment-${Date.now()}`;
    updateScenario((current) => ({
      ...current,
      assignments: [
        ...current.assignments,
        {
          id,
          projectId: project.id,
          squadId: squad.id,
          startKey: timeline[0],
          finishKey: timeline[Math.min(3, timeline.length - 1)],
        },
      ],
    }));
    setSelectedAssignmentId(id);
  }

  function removeSelectedAssignment() {
    if (!selectedAssignment) return;
    removeAssignment(selectedAssignment.id);
  }

  function addProject() {
    const id = `project-${Date.now()}`;
    updateScenario((current) => ({
      ...current,
      projects: [
        ...current.projects,
        {
          id,
          name: "New project",
          effortFteYears: 2,
          targetFinishKey: timeline.at(-1)!,
          eligibleSquadIds: current.squads.map((squad) => squad.id),
          milestones: [
            {
              id: `${id}-milestone`,
              name: "Key milestone",
              dateKey: timeline.at(-4)!,
              requiredPercent: 70,
            },
          ],
        },
      ],
    }));
    setSelectedProjectId(id);
  }

  function addSquad() {
    setSquadDeleteError(null);
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

  function updateMember(squadId: string, memberIndex: number, patch: Partial<Engineer>): void {
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

  function selectProject(id: string) {
    setSelectedProjectId(id);
    setSelectedAssignmentId("");
  }

  function toggleCollapsed(id: string) {
    setCollapsedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function collapseAll() {
    setCollapsedProjectIds(new Set(scenario.projects.map((p) => p.id)));
  }

  function expandAll() {
    setCollapsedProjectIds(new Set());
  }

  function setViewStart(yy: string) {
    updateScenario((current) => ({
      ...current,
      calendar: {
        ...current.calendar,
        viewStart: `${yy}-1-1` as TimeKey,
        viewFinish: current.calendar.viewFinish ?? timeline.at(-1)!,
      },
    }));
  }

  function setViewFinish(yy: string) {
    updateScenario((current) => ({
      ...current,
      calendar: {
        ...current.calendar,
        viewStart: current.calendar.viewStart ?? timeline[0],
        viewFinish: `${yy}-4-4` as TimeKey,
      },
    }));
  }

  return (
    <main
      className="app-shell"
      onClick={() => { setAssignmentMenu(null); setLaneMenu(null); }}
      onPointerMove={continueDrag}
      onPointerUp={completeDrag}
    >
      <header className="app-topbar">
        <div>
          <p className="eyebrow">Portfolio feasibility</p>
          <h1>Portfolio Scenario Planner</h1>
        </div>
        <div className="topbar-scenario">
          <p className="eyebrow">Active scenario</p>
          <span className="topbar-scenario-name">{scenario.scenario.name}</span>
        </div>
        <div className="topbar-actions">
          <button type="button" className="command-button" onClick={() => setIsResourceMapOpen(true)}>
            Resource map
          </button>
          <button type="button" className="command-button" onClick={() => setIsDataModalOpen(true)}>
            <Database size={17} />
            Scenario data
          </button>
        </div>
      </header>

      <section className="workspace-grid">
        <div className="board-column">
        <section className="board-panel" aria-label="Project sequencing board">
          <div className="panel-heading">
            <div>
              <h2>Project sequencing</h2>
            </div>
            <div className="collapse-toggles">
              <button type="button" className="command-button" onClick={expandAll}>Expand all</button>
              <button type="button" className="command-button" onClick={collapseAll}>Collapse all</button>
            </div>
            <span>{timeline[0]} to {timeline.at(-1)}</span>
          </div>
          <div className="range-selectors">
            <label>
              From
              <select
                value={(scenario.calendar.viewStart ?? timeline[0]).slice(0, 2)}
                onChange={(event) => setViewStart(event.target.value)}
              >
                {VIEW_YEAR_OPTIONS.map(({ yy, label }) => (
                  <option key={yy} value={yy}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              To
              <select
                value={(scenario.calendar.viewFinish ?? timeline.at(-1)!).slice(0, 2)}
                onChange={(event) => setViewFinish(event.target.value)}
              >
                {VIEW_YEAR_OPTIONS.map(({ yy, label }) => (
                  <option key={yy} value={yy}>{label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="planner-grid" style={timelineStyle} ref={boardRef}>
            <TimelineHeaders
              timeline={timeline}
              fiscalYearStartMonth={scenario.calendar.financialYearStartMonth}
              selectedSprintKey={selectedSprintKey}
              onSelectSprintKey={(key) => setSelectedSprintKey((prev) => (prev === key ? null : key))}
            />
            {scenario.projects.map((project) => (
              <ProjectLane
                key={project.id}
                project={project}
                scenario={scenario}
                timeline={timeline}
                selectedAssignmentId={selectedAssignmentId}
                selectedProjectId={selectedAssignmentId ? "" : selectedProjectId}
                isCollapsed={collapsedProjectIds.has(project.id)}
                onToggleCollapsed={toggleCollapsed}
                onSelectProject={selectProject}
                onSelectAssignment={setSelectedAssignmentId}
                onAssignmentPointerDown={startDrag}
                onAssignmentKeyDown={handleAssignmentKeyDown}
                onAssignmentContextMenu={openAssignmentMenu}
                onTrackPointerDown={startCreateDrag}
                onLaneContextMenu={openLaneMenu}
                onMilestoneContextMenu={openMilestoneMenu}
                pendingCreate={drag?.kind === "create" ? drag : null}
              />
            ))}
            {selectedSprintKey !== null && (() => {
              const col = timeline.indexOf(selectedSprintKey);
              return col !== -1 ? (
                <div
                  className="planner-col-highlight"
                  style={{
                    gridColumn: `${col + 2} / ${col + 3}`,
                    gridRow: "1 / span 9999",
                  } as React.CSSProperties}
                />
              ) : null;
            })()}
          </div>
          {assignmentMenu ? (
            <AssignmentContextMenuView
              menu={assignmentMenu}
              scenario={scenario}
              onDelete={removeAssignment}
            />
          ) : null}
          {laneMenu ? (
            <LaneContextMenuView
              menu={laneMenu}
              scenario={scenario}
              onAdd={addMilestone}
              onDelete={removeMilestone}
            />
          ) : null}
        </section>
        <ProjectResourcingPanel
          scenario={scenario}
          heatmap={heatmap}
          cumulativeHeatmap={cumulativeHeatmap}
          milestoneCoverageHeatmap={milestoneCoverageHeatmap}
          sprintHeatmap={sprintHeatmap}
          timeline={timeline}
          scrollRef={capacityPanelRef}
          selectedSprintKey={selectedSprintKey}
          onSelectSprintKey={(key) => setSelectedSprintKey((prev) => (prev === key ? null : key))}
        />
        </div>

        <aside className="side-panel">
          <FeasibilitySummaryView feasibility={feasibility} />
          <NotesPanel
            notes={scenario.scenario.notes ?? ""}
            onNotesChange={(notes) =>
              updateScenario((current) => ({
                ...current,
                scenario: { ...current.scenario, notes },
              }))
            }
          />
          <EditorPanel
            scenario={scenario}
            selectedAssignment={selectedAssignment}
            selectedProject={selectedProject}
            timeline={timeline}
            onScenarioNameChange={(name) =>
              updateScenario((current) => ({
                ...current,
                scenario: { ...current.scenario, name },
              }))
            }
            planningSquadId={planningSquadId}
            onSelectPlanningSquad={setPlanningSquadId}
            onAssignmentChange={updateAssignment}
            onProjectChange={(projectId, patch) =>
              updateScenario((current) => ({
                ...current,
                projects: current.projects.map((project) =>
                  project.id === projectId ? { ...project, ...patch } : project,
                ),
              }))
            }
            onMilestoneChange={(projectId, milestoneId, patch) =>
              updateScenario((current) => ({
                ...current,
                projects: current.projects.map((project) =>
                  project.id === projectId
                    ? {
                        ...project,
                        milestones: project.milestones.map((milestone) =>
                          milestone.id === milestoneId
                            ? { ...milestone, ...patch }
                            : milestone,
                        ),
                      }
                    : project,
                ),
              }))
            }
            onAddMilestone={(projectId) => {
              const project = scenario.projects.find((p) => p.id === projectId);
              if (!project) return;
              const dateKey = project.targetFinishKey ?? timeline.at(-4) ?? timeline[0];
              updateScenario((current) => ({
                ...current,
                projects: current.projects.map((p) =>
                  p.id === projectId
                    ? {
                        ...p,
                        milestones: [
                          ...p.milestones,
                          {
                            id: crypto.randomUUID(),
                            name: "New milestone",
                            dateKey,
                            requiredPercent: 70,
                          },
                        ],
                      }
                    : p,
                ),
              }));
            }}
            onRemoveMilestone={(projectId, milestoneId) =>
              updateScenario((current) => ({
                ...current,
                projects: current.projects.map((p) =>
                  p.id === projectId
                    ? { ...p, milestones: p.milestones.filter((m) => m.id !== milestoneId) }
                    : p,
                ),
              }))
            }
            onAddAssignment={addAssignment}
            onRemoveAssignment={removeSelectedAssignment}
            onAddProject={addProject}
            onSquadAdd={addSquad}
            onSquadUpdate={updateSquad}
            onSquadRemove={removeSquad}
            squadDeleteError={squadDeleteError}
            expandedSquadId={expandedSquadId}
            onToggleSquadExpand={(id) => setExpandedSquadId((prev) => (prev === id ? null : id))}
            onSquadAddMember={addMember}
            onSquadUpdateMember={updateMember}
            onSquadRemoveMember={removeMember}
          />
        </aside>
      </section>
      <footer className="app-footer">
        <span>© 2026 Xerxes Battiwalla &nbsp;({__GIT_SHA__})</span>
      </footer>
      {isDataModalOpen ? (
        <ScenarioDataModal
          scenario={scenario}
          onApply={(next) => {
            setScenario(next);
            setSelectedAssignmentId(next.assignments[0]?.id ?? "");
            setSelectedProjectId(next.projects[0]?.id ?? "");
            setPlanningSquadId(next.assignments[0]?.squadId ?? next.squads[0]?.id ?? "");
          }}
          onClose={() => setIsDataModalOpen(false)}
        />
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
}

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
        row.engineerId, row.engineerName, "", "", "",
        row.squadName, row.projectName, "",
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

function TimelineHeaders({
  timeline,
  fiscalYearStartMonth,
  selectedSprintKey,
  onSelectSprintKey,
}: {
  timeline: TimeKey[];
  fiscalYearStartMonth: number;
  selectedSprintKey: TimeKey | null;
  onSelectSprintKey: (key: TimeKey) => void;
}) {
  return (
    <>
      <div className="lane-header row-span-4">Project</div>
      {groupTimeline(timeline, (key) => `CY20${parseTimeKey(key).year}`).map((group) => (
        <div className="year-band" style={{ gridColumn: `span ${group.span}` }} key={group.label}>
          {group.label}
        </div>
      ))}
      {groupTimeline(timeline, (key) => getFiscalYearLabel(key, fiscalYearStartMonth)).map((group) => (
        <div className="fy-band" style={{ gridColumn: `span ${group.span}` }} key={group.label}>
          {group.label}
        </div>
      ))}
      {groupTimeline(timeline, getPiLabel).map((group) => (
        <div className="pi-band" style={{ gridColumn: `span ${group.span}` }} key={group.label}>
          {group.label}
        </div>
      ))}
      {timeline.map((key) => (
        <div
          className={`sprint-cell${key === selectedSprintKey ? " col-selected" : ""}`}
          key={key}
          onClick={(e) => { e.stopPropagation(); onSelectSprintKey(key); }}
        >
          {parseTimeKey(key).sprint}
        </div>
      ))}
    </>
  );
}

function ProjectLane({
  project,
  scenario,
  timeline,
  selectedAssignmentId,
  selectedProjectId,
  isCollapsed,
  onToggleCollapsed,
  onSelectProject,
  onSelectAssignment,
  onAssignmentPointerDown,
  onAssignmentKeyDown,
  onAssignmentContextMenu,
  onTrackPointerDown,
  onLaneContextMenu,
  onMilestoneContextMenu,
  pendingCreate,
}: {
  project: Project;
  scenario: ScenarioFileV1;
  timeline: TimeKey[];
  selectedAssignmentId: string;
  selectedProjectId: string;
  isCollapsed: boolean;
  onToggleCollapsed: (id: string) => void;
  onSelectProject: (id: string) => void;
  onSelectAssignment: (id: string) => void;
  onAssignmentPointerDown: (
    event: PointerEvent<HTMLElement>,
    assignment: Assignment,
    mode: DragMode,
  ) => void;
  onAssignmentKeyDown: (event: KeyboardEvent<HTMLButtonElement>, assignmentId: string) => void;
  onAssignmentContextMenu: (event: MouseEvent<HTMLElement>, assignmentId: string) => void;
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
}) {
  const projectAssignments = scenario.assignments.filter(
    (assignment) => assignment.projectId === project.id,
  );

  if (isCollapsed) {
    return (
      <>
        <button
          type="button"
          className={`project-label project-label--collapsed${selectedProjectId === project.id ? " selected" : ""}`}
          onClick={() => onSelectProject(project.id)}
        >
          <span className="collapse-chevron" onClick={(e) => { e.stopPropagation(); onToggleCollapsed(project.id); }}>
            <ChevronRight size={12} />
          </span>
          <span className="project-label-name">{project.name}</span>
        </button>
        <div
          className="project-track project-track--collapsed"
          data-testid={`track-${project.id}`}
        >
          {projectAssignments.map((assignment) => {
            const squad = scenario.squads.find((candidate) => candidate.id === assignment.squadId);
            const start = timeline.indexOf(assignment.startKey);
            const finish = timeline.indexOf(assignment.finishKey);
            const duration = finish - start + 1;
            if (!squad || start < 0 || finish < 0) return null;
            return (
              <div
                key={assignment.id}
                className="assignment-bar--mini"
                style={{
                  gridColumn: `${start + 1} / span ${duration}`,
                  backgroundColor: squad.color,
                }}
                title={`${squad.name}: ${assignment.startKey} → ${assignment.finishKey}`}
              />
            );
          })}
          {project.milestones.map((milestone) => (
            <span
              key={milestone.id}
              className="milestone-marker--mini"
              style={{ left: `${((timeline.indexOf(milestone.dateKey) + 0.5) / timeline.length) * 100}%` }}
              title={`${milestone.name}: ${milestone.dateKey}`}
            />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`project-label${selectedProjectId === project.id ? " selected" : ""}`}
        onClick={() => onSelectProject(project.id)}
      >
        <span className="collapse-chevron" onClick={(e) => { e.stopPropagation(); onToggleCollapsed(project.id); }}>
          <ChevronDown size={12} />
        </span>
        <span>{project.name}</span>
        <small>{project.effortFteYears} FTE-years</small>
      </button>
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
        {projectAssignments.map((assignment) => {
          const squad = scenario.squads.find((candidate) => candidate.id === assignment.squadId);
          const start = timeline.indexOf(assignment.startKey);
          const finish = timeline.indexOf(assignment.finishKey);
          const duration = finish - start + 1;
          if (!squad || start < 0 || finish < 0) return null;

          return (
            <button
              type="button"
              className={`assignment-bar ${selectedAssignmentId === assignment.id ? "selected" : ""}`}
              style={{
                gridColumn: `${start + 1} / span ${duration}`,
                backgroundColor: squad.color,
              }}
              key={assignment.id}
              aria-label={`${squad.name} on ${project.name}, ${assignment.startKey} to ${assignment.finishKey}`}
              onFocus={() => onSelectAssignment(assignment.id)}
              onClick={() => onSelectAssignment(assignment.id)}
              onContextMenu={(event) => onAssignmentContextMenu(event, assignment.id)}
              onKeyDown={(event) => onAssignmentKeyDown(event, assignment.id)}
              onPointerDown={(event) => onAssignmentPointerDown(event, assignment, "move")}
            >
              <span
                className="bar-handle"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onAssignmentPointerDown(event, assignment, "start");
                }}
              />
              <span className="assignment-name">{squad.name}</span>
              <span
                className="bar-handle"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onAssignmentPointerDown(event, assignment, "finish");
                }}
              />
            </button>
          );
        })}
        {(() => {
          if (!project.targetStartKey) return null;
          if (compareTimeKeys(project.targetStartKey, timeline.at(-1)!) > 0) return null;
          if (compareTimeKeys(project.targetFinishKey, timeline[0]) < 0) return null;
          const startIdx = timeline.indexOf(clampToTimeline(project.targetStartKey, timeline));
          const finishIdx = timeline.indexOf(clampToTimeline(project.targetFinishKey, timeline));
          if (startIdx < 0 || finishIdx < 0 || finishIdx < startIdx) return null;
          const left = (startIdx / timeline.length) * 100;
          const width = ((finishIdx - startIdx + 1) / timeline.length) * 100;
          return (
            <div
              className="target-window"
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`Target: ${project.targetStartKey} → ${project.targetFinishKey}`}
            />
          );
        })()}
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
          >
            <span className="milestone-label">{milestone.name}</span>
          </span>
        ))}
        {pendingCreate?.projectId === project.id ? (
          <div
            className="assignment-bar assignment-preview"
            style={previewBarStyle(pendingCreate, timeline, scenario)}
          >
            <span className="bar-handle" />
            <span className="assignment-name">
              {scenario.squads.find((squad) => squad.id === pendingCreate.squadId)?.name}
            </span>
            <span className="bar-handle" />
          </div>
        ) : null}
      </div>
    </>
  );
}

function AssignmentContextMenuView({
  menu,
  scenario,
  onDelete,
}: {
  menu: AssignmentContextMenu;
  scenario: ScenarioFileV1;
  onDelete: (assignmentId: string) => void;
}) {
  const assignment = scenario.assignments.find(
    (candidate) => candidate.id === menu.assignmentId,
  );

  if (!assignment) return null;

  return (
    <div
      className="assignment-context-menu"
      role="menu"
      style={{ left: menu.x, top: menu.y }}
      onClick={(event) => event.stopPropagation()}
    >
      <p>{assignmentLabel(scenario, assignment)}</p>
      <button
        type="button"
        role="menuitem"
        onClick={() => onDelete(menu.assignmentId)}
      >
        <Trash2 size={14} />
        Delete allocation
      </button>
    </div>
  );
}

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
          className="add"
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

function NotesPanel({
  notes,
  onNotesChange,
}: {
  notes: string;
  onNotesChange: (notes: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState<number | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (preview) return;
    const el = textareaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setTextareaHeight(el.offsetHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [preview]);

  function wrap(before: string, after: string) {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const selected = value.slice(s, e) || "text";
    const next = value.slice(0, s) + before + selected + after + value.slice(e);
    onNotesChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = s + before.length;
      el.selectionEnd = s + before.length + (value.slice(s, e) ? selected.length : selected.length);
    });
  }

  function prefixLine(prefix: string) {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, value } = el;
    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const lineEndIdx = value.indexOf("\n", selectionStart);
    const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
    const line = value.slice(lineStart, lineEnd);
    const updated = line.startsWith(prefix) ? line.slice(prefix.length) : prefix + line;
    const delta = updated.length - line.length;
    onNotesChange(value.slice(0, lineStart) + updated + value.slice(lineEnd));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = selectionStart + delta;
    });
  }

  function handleTabKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart, selectionEnd, value } = el;
    const INDENT = "  ";
    if (e.shiftKey) {
      const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const lineEnd = selectionEnd === selectionStart
        ? selectionEnd
        : value.indexOf("\n", selectionEnd - 1) === -1 ? value.length : value.indexOf("\n", selectionEnd - 1);
      const block = value.slice(lineStart, lineEnd);
      let removed = 0;
      const updated = block.replace(/^( {1,2})/gm, (m) => { removed += m.length; return ""; });
      onNotesChange(value.slice(0, lineStart) + updated + value.slice(lineEnd));
      requestAnimationFrame(() => {
        el.selectionStart = Math.max(lineStart, selectionStart - (selectionStart === selectionEnd ? removed : 0));
        el.selectionEnd = Math.max(lineStart, selectionEnd - removed);
      });
    } else if (selectionStart === selectionEnd) {
      onNotesChange(value.slice(0, selectionStart) + INDENT + value.slice(selectionEnd));
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = selectionStart + INDENT.length; });
    } else {
      const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const lineEnd = value.indexOf("\n", selectionEnd - 1) === -1 ? value.length : value.indexOf("\n", selectionEnd - 1);
      const block = value.slice(lineStart, lineEnd);
      const updated = block.replace(/^/gm, INDENT);
      const added = updated.length - block.length;
      onNotesChange(value.slice(0, lineStart) + updated + value.slice(lineEnd));
      requestAnimationFrame(() => {
        el.selectionStart = selectionStart + INDENT.length;
        el.selectionEnd = selectionEnd + added;
      });
    }
  }

  type ToolBtn = { title: string; icon: React.ReactNode; action: () => void };
  const tools: ToolBtn[] = [
    { title: "Bold", icon: <Bold size={13} />, action: () => wrap("**", "**") },
    { title: "Italic", icon: <Italic size={13} />, action: () => wrap("*", "*") },
    { title: "Underline", icon: <UnderlineIcon size={13} />, action: () => wrap("<u>", "</u>") },
  ];
  const lineTools: ToolBtn[] = [
    { title: "Heading 2", icon: <Heading2 size={13} />, action: () => prefixLine("## ") },
    { title: "Heading 3", icon: <Heading3 size={13} />, action: () => prefixLine("### ") },
    { title: "Bullet list", icon: <List size={13} />, action: () => prefixLine("- ") },
    { title: "Numbered list", icon: <ListOrdered size={13} />, action: () => prefixLine("1. ") },
  ];

  return (
    <section className="panel-card">
      <button
        type="button"
        className="panel-heading compact notes-heading"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <h2>Assumptions &amp; notes</h2>
        <ChevronDown size={14} className={expanded ? "rotate-180" : ""} />
      </button>
      {expanded && (
        <div className="notes-body">
          <div className="notes-toolbar">
            {tools.map((t) => (
              <button
                key={t.title}
                type="button"
                className="notes-tool"
                title={t.title}
                onMouseDown={(e) => { e.preventDefault(); t.action(); }}
              >{t.icon}</button>
            ))}
            <div className="notes-toolbar-sep" />
            {lineTools.map((t) => (
              <button
                key={t.title}
                type="button"
                className="notes-tool"
                title={t.title}
                onMouseDown={(e) => { e.preventDefault(); t.action(); }}
              >{t.icon}</button>
            ))}
            <div className="notes-toolbar-spacer" />
            <button
              type="button"
              className={`notes-tool${preview ? " active" : ""}`}
              title={preview ? "Edit" : "Preview"}
              onClick={() => setPreview((p) => !p)}
            >
              {preview ? <PenLine size={13} /> : <Eye size={13} />}
            </button>
          </div>
          {preview ? (
            <div className="notes-preview">
              <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                {notes || "*No notes yet.*"}
              </ReactMarkdown>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              className="notes-textarea"
              style={textareaHeight !== undefined ? { height: textareaHeight } : undefined}
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              onKeyDown={handleTabKey}
              placeholder={"Add planning assumptions, constraints, or notes here.\nUse - or \u2022 for bullets, ## for headings."}
              spellCheck
            />
          )}
        </div>
      )}
    </section>
  );
}

function FeasibilitySummaryView({
  feasibility,
}: {
  feasibility: ReturnType<typeof calculateFeasibility>;
}) {
  const milestones = Object.values(feasibility.milestonesById);
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="panel-card">
      <div className="panel-heading compact">
        <h2>Feasibility summary</h2>
        <span>Current scenario</span>
      </div>
      <div className="metric-grid">
        <Metric value={feasibility.redMilestones} label="red gates" tone="red" />
        <Metric value={feasibility.idleSquadPiEquivalent.toFixed(1)} label="idle squad-PIs" />
        <Metric value={Math.ceil(feasibility.gapFteSprints / 16)} label="FTE-year gap" />
      </div>
      <button
        className="collapse-toggle"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <ChevronDown size={14} className={expanded ? "rotate-180" : ""} />
        {expanded ? "Hide details" : "Show details"}
      </button>
      {expanded && (
        <div className="risk-list">
          {milestones.map((milestone) => (
            <div className={`risk-item ${milestone.status}`} key={milestone.milestoneId}>
              <strong>{milestone.projectName} ({milestone.name})</strong>
              <span>
                {statusLabel[milestone.status]} at {milestone.dateKey}. {Math.round(milestone.actualCapacity)} of {Math.round(milestone.requiredCapacity)} FTE-sprints covered.
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({
  value,
  label,
  tone,
}: {
  value: string | number;
  label: string;
  tone?: "red";
}) {
  return (
    <div className={`metric ${tone ?? ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EditorPanel({
  scenario,
  selectedAssignment,
  selectedProject,
  timeline,
  onScenarioNameChange,
  planningSquadId,
  onSelectPlanningSquad,
  onAssignmentChange,
  onProjectChange,
  onMilestoneChange,
  onAddMilestone,
  onRemoveMilestone,
  onAddAssignment,
  onRemoveAssignment,
  onAddProject,
  onSquadAdd,
  onSquadUpdate,
  onSquadRemove,
  squadDeleteError,
  expandedSquadId,
  onToggleSquadExpand,
  onSquadAddMember,
  onSquadUpdateMember,
  onSquadRemoveMember,
}: {
  scenario: ScenarioFileV1;
  selectedAssignment?: Assignment;
  selectedProject?: Project;
  timeline: TimeKey[];
  onScenarioNameChange: (name: string) => void;
  planningSquadId: string;
  onSelectPlanningSquad: (id: string) => void;
  onAssignmentChange: (
    assignmentId: string,
    patch: Partial<Pick<Assignment, "startKey" | "finishKey" | "projectId" | "squadId">>,
  ) => void;
  onProjectChange: (projectId: string, patch: Partial<Project>) => void;
  onMilestoneChange: (
    projectId: string,
    milestoneId: string,
    patch: Partial<Project["milestones"][number]>,
  ) => void;
  onAddMilestone: (projectId: string) => void;
  onRemoveMilestone: (projectId: string, milestoneId: string) => void;
  onAddAssignment: () => void;
  onRemoveAssignment: () => void;
  onAddProject: () => void;
  onSquadAdd: () => void;
  onSquadUpdate: (squadId: string, patch: Partial<Pick<Squad, "name" | "capacityFte" | "color">>) => void;
  onSquadRemove: (squadId: string) => void;
  squadDeleteError: { squadId: string; message: string } | null;
  expandedSquadId: string | null;
  onToggleSquadExpand: (squadId: string) => void;
  onSquadAddMember: (squadId: string) => void;
  onSquadUpdateMember: (squadId: string, index: number, patch: Partial<Engineer>) => void;
  onSquadRemoveMember: (squadId: string, index: number) => void;
}) {
  const mode = selectedAssignment ? "assignment" : selectedProject ? "project" : "none";

  return (
    <section className="panel-card editor-card">
      <div className="panel-heading compact">
        <h2>Scenario editor</h2>
        <Save size={16} />
      </div>

      <label>
        Scenario name
        <input
          value={scenario.scenario.name}
          onChange={(event) => onScenarioNameChange(event.target.value)}
        />
      </label>

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
        expandedSquadId={expandedSquadId}
        onToggleExpand={onToggleSquadExpand}
        onUpdate={onSquadUpdate}
        onRemove={onSquadRemove}
        onAdd={onSquadAdd}
        onAddMember={onSquadAddMember}
        onUpdateMember={onSquadUpdateMember}
        onRemoveMember={onSquadRemoveMember}
      />

      {mode === "none" ? (
        <div className="editor-empty">
          <label>
            Planning squad
            <select value={planningSquadId} onChange={(event) => onSelectPlanningSquad(event.target.value)}>
              {scenario.squads.map((squad) => (
                <option value={squad.id} key={squad.id}>{squad.name}</option>
              ))}
            </select>
          </label>
          <p className="editor-hint">Select a project or assignment on the board to edit.</p>
        </div>
      ) : null}

      {mode === "project" && selectedProject ? (
        <div className="context-card">
          <div className="context-card-heading">Project</div>
          <div className="editor-stack">
            <label>
              Project name
              <input
                value={selectedProject.name}
                onChange={(event) => onProjectChange(selectedProject.id, { name: event.target.value })}
              />
            </label>
            <label>
              Effort FTE-years
              <input
                type="number"
                min="0.25"
                step="0.25"
                value={selectedProject.effortFteYears}
                onChange={(event) =>
                  onProjectChange(selectedProject.id, { effortFteYears: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Target start
              <select
                value={selectedProject.targetStartKey ?? ""}
                onChange={(event) =>
                  onProjectChange(selectedProject.id, {
                    targetStartKey: event.target.value ? event.target.value as TimeKey : undefined,
                  })
                }
              >
                <option value="">(none)</option>
                {timeline.map((key) => (
                  <option value={key} key={key}>{key}</option>
                ))}
              </select>
            </label>
            <label>
              Target finish
              <select
                value={selectedProject.targetFinishKey}
                onChange={(event) =>
                  onProjectChange(selectedProject.id, { targetFinishKey: event.target.value as TimeKey })
                }
              >
                {timeline.map((key) => (
                  <option value={key} key={key}>{key}</option>
                ))}
              </select>
            </label>
            {selectedProject.milestones.map((milestone) => (
              <div className="milestone-editor" key={milestone.id}>
                <div className="milestone-editor-header">
                  <label>
                    Name
                    <input
                      value={milestone.name}
                      onChange={(event) =>
                        onMilestoneChange(selectedProject.id, milestone.id, { name: event.target.value })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="milestone-delete"
                    aria-label={`Delete milestone ${milestone.name}`}
                    onClick={() => onRemoveMilestone(selectedProject.id, milestone.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <label>
                  Gate sprint
                  <select
                    value={milestone.dateKey}
                    onChange={(event) =>
                      onMilestoneChange(selectedProject.id, milestone.id, { dateKey: event.target.value as TimeKey })
                    }
                  >
                    {timeline.map((key) => (
                      <option value={key} key={key}>{key}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Required %
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={milestone.requiredPercent}
                    onChange={(event) =>
                      onMilestoneChange(selectedProject.id, milestone.id, { requiredPercent: Number(event.target.value) })
                    }
                  />
                </label>
              </div>
            ))}
            <button
              type="button"
              className="small-command milestone-add"
              onClick={() => onAddMilestone(selectedProject.id)}
            >
              <Plus size={14} />
              Add milestone
            </button>
          </div>
        </div>
      ) : null}

      {mode === "assignment" && selectedAssignment ? (
        <div className="context-card">
          <div className="context-card-heading">Assignment</div>
          <div className="editor-stack">
            <p className="selected-range">
              {assignmentLabel(scenario, selectedAssignment)} {selectedAssignment.startKey} to {selectedAssignment.finishKey}
            </p>
            <label>
              Project
              <select
                value={selectedAssignment.projectId}
                onChange={(event) =>
                  onAssignmentChange(selectedAssignment.id, { projectId: event.target.value })
                }
              >
                {scenario.projects.map((project) => (
                  <option value={project.id} key={project.id}>{project.name}</option>
                ))}
              </select>
            </label>
            <label>
              Squad
              <select
                value={selectedAssignment.squadId}
                onChange={(event) => {
                  onAssignmentChange(selectedAssignment.id, { squadId: event.target.value });
                  onSelectPlanningSquad(event.target.value);
                }}
              >
                {scenario.squads.map((squad) => (
                  <option value={squad.id} key={squad.id}>{squad.name}</option>
                ))}
              </select>
            </label>
            <label>
              Start
              <select
                value={selectedAssignment.startKey}
                onChange={(event) =>
                  onAssignmentChange(selectedAssignment.id, { startKey: event.target.value as TimeKey })
                }
              >
                {timeline.map((key) => (
                  <option value={key} key={key}>{key}</option>
                ))}
              </select>
            </label>
            <label>
              Finish
              <select
                value={selectedAssignment.finishKey}
                onChange={(event) =>
                  onAssignmentChange(selectedAssignment.id, { finishKey: event.target.value as TimeKey })
                }
              >
                {timeline.map((key) => (
                  <option value={key} key={key}>{key}</option>
                ))}
              </select>
            </label>
            <button type="button" className="danger-command" onClick={onRemoveAssignment}>
              <Trash2 size={14} />
              Remove assignment
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

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


function InfoIcon({ tooltip }: { tooltip: string }) {
  return (
    <span className="info-icon" aria-label={tooltip}>
      i
      <span className="info-tooltip" role="tooltip">{tooltip}</span>
    </span>
  );
}

function TeamCapacityGrid({
  scenario,
  heatmap,
  timeline,
  selectedSprintKey,
  onSelectSprintKey,
}: {
  scenario: ScenarioFileV1;
  heatmap: ReturnType<typeof calculateCapacityHeatmap>;
  timeline: TimeKey[];
  selectedSprintKey: TimeKey | null;
  onSelectSprintKey: (key: TimeKey) => void;
}) {
  return (
    <div className="capacity-grid" style={{ "--sprint-count": timeline.length } as React.CSSProperties}>
      <div className="capacity-label">Squad</div>
      {timeline.map((key) => (
        <div
          className={`capacity-head${key === selectedSprintKey ? " col-selected" : ""}`}
          key={key}
          onClick={(e) => { e.stopPropagation(); onSelectSprintKey(key); }}
        >
          {key}
        </div>
      ))}
      {scenario.squads.map((squad) => (
        <Fragment key={squad.id}>
          <div className="capacity-label" key={`${squad.id}-label`}>{squad.name}</div>
          {timeline.map((key) => {
            const cell = heatmap.bySquad[squad.id][key];
            const shortNames = cell.projectIds
              .map((projectId) => scenario.projects.find((project) => project.id === projectId)?.name.split(" ")[0])
              .filter(Boolean)
              .join(" + ");
            return (
              <div className={`capacity-cell ${cell.status}${key === selectedSprintKey ? " col-selected" : ""}`} key={`${squad.id}-${key}`}>
                {cell.status === "idle" ? "-" : shortNames}
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

function milestoneCellStyle(cell: { status: string; percent: number }): React.CSSProperties | undefined {
  if (cell.status === "over" || cell.status === "complete") {
    return { background: "#22c55e", color: "white" };
  }
  if (cell.percent >= 95) {
    // Interpolate from light green (#bbf7d0) at 95% to full green (#22c55e) at 100%
    const t = Math.min((cell.percent - 95) / 5, 1);
    const r = Math.round(187 + (34 - 187) * t);
    const g = Math.round(247 + (197 - 247) * t);
    const b = Math.round(208 + (94 - 208) * t);
    return { background: `rgb(${r},${g},${b})`, color: t > 0.5 ? "white" : "#166534" };
  }
  return undefined;
}

function ProjectCumulativeView({
  scenario,
  heatmap,
  timeline,
  selectedSprintKey,
  onSelectSprintKey,
  milestoneMode = false,
}: {
  scenario: ScenarioFileV1;
  heatmap: ProjectCumulativeHeatmap;
  timeline: TimeKey[];
  selectedSprintKey: TimeKey | null;
  onSelectSprintKey: (key: TimeKey) => void;
  milestoneMode?: boolean;
}) {
  return (
    <>
      <div className="capacity-grid" style={{ "--sprint-count": timeline.length } as React.CSSProperties}>
        <div className="capacity-label">Project</div>
        {timeline.map((key) => (
          <div
            className={`capacity-head${key === selectedSprintKey ? " col-selected" : ""}`}
            key={key}
            onClick={(e) => { e.stopPropagation(); onSelectSprintKey(key); }}
          >
            {key}
          </div>
        ))}
        {scenario.projects.map((project) => (
          <Fragment key={project.id}>
            <div className="capacity-label capacity-label--project">
              <span>{project.name}</span>
              <small>{project.effortFteYears} FTE-yrs · {project.targetFinishKey}</small>
            </div>
            {timeline.map((key) => {
              const cell = heatmap.byProject[project.id]?.[key];
              const milestonesHere = project.milestones.filter((m) => m.dateKey === key);
              const milestoneClass = milestonesHere.length > 0 ? " capacity-cell--milestone" : "";
              const milestoneTooltip = milestonesHere.length > 0 ? (
                <span className="cell-milestone-tooltip">
                  {milestonesHere.map((m) => (
                    <span key={m.id} style={{ display: "block" }}>◆ {m.name} · {m.requiredPercent}% required</span>
                  ))}
                </span>
              ) : null;
              if (!cell) return (
                <div className={`capacity-cell resourcing-unresourced${milestoneClass}${key === selectedSprintKey ? " col-selected" : ""}`} key={key}>
                  {milestoneTooltip}
                </div>
              );
              const inlineStyle = milestoneMode ? milestoneCellStyle(cell) : undefined;
              const statusClass = (milestoneMode && inlineStyle) ? "" : ` resourcing-${cell.status}`;
              return (
                <div
                  className={`capacity-cell${statusClass}${milestoneClass}${key === selectedSprintKey ? " col-selected" : ""}`}
                  style={inlineStyle}
                  key={key}
                >
                  {cell.percent > 0 ? `${Math.round(cell.percent)}%` : ""}
                  {milestoneTooltip}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="resourcing-legend">
        <span className="resourcing-legend-item"><span className="resourcing-swatch resourcing-unresourced" />No coverage</span>
        <span className="resourcing-legend-item"><span className="resourcing-swatch resourcing-in-progress" />In progress</span>
        <span className="resourcing-legend-item"><span className="resourcing-swatch resourcing-complete" />Fully resourced</span>
        {!milestoneMode && <span className="resourcing-legend-item"><span className="resourcing-swatch resourcing-over" />Over-resourced</span>}
        <span className="resourcing-legend-item"><span className="resourcing-swatch resourcing-at-risk" />At risk (past target)</span>
      </div>
    </>
  );
}

function ProjectSprintView({
  scenario,
  heatmap,
  timeline,
  selectedSprintKey,
  onSelectSprintKey,
}: {
  scenario: ScenarioFileV1;
  heatmap: ProjectSprintHeatmap;
  timeline: TimeKey[];
  selectedSprintKey: TimeKey | null;
  onSelectSprintKey: (key: TimeKey) => void;
}) {
  return (
    <>
      <div className="capacity-grid" style={{ "--sprint-count": timeline.length } as React.CSSProperties}>
        <div className="capacity-label">Project</div>
        {timeline.map((key) => (
          <div
            className={`capacity-head${key === selectedSprintKey ? " col-selected" : ""}`}
            key={key}
            onClick={(e) => { e.stopPropagation(); onSelectSprintKey(key); }}
          >
            {key}
          </div>
        ))}
        {scenario.projects.map((project) => (
          <Fragment key={project.id}>
            <div className="capacity-label capacity-label--project">
              <span>{project.name}</span>
              <small>{project.effortFteYears} FTE-yrs</small>
            </div>
            {timeline.map((key) => {
              const cell = heatmap.byProject[project.id]?.[key];
              const milestonesHere = project.milestones.filter((m) => m.dateKey === key);
              const milestoneClass = milestonesHere.length > 0 ? " capacity-cell--milestone" : "";
              const milestoneTooltip = milestonesHere.length > 0 ? (
                <span className="cell-milestone-tooltip">
                  {milestonesHere.map((m) => (
                    <span key={m.id} style={{ display: "block" }}>◆ {m.name} · {m.requiredPercent}% required</span>
                  ))}
                </span>
              ) : null;
              if (!cell) return (
                <div className={`capacity-cell resourcing-unresourced${milestoneClass}${key === selectedSprintKey ? " col-selected" : ""}`} key={key}>
                  {milestoneTooltip}
                </div>
              );
              return (
                <div className={`capacity-cell resourcing-${cell.status}${milestoneClass}${key === selectedSprintKey ? " col-selected" : ""}`} key={key}>
                  {cell.fteSprints > 0 ? cell.fteSprints : "–"}
                  {milestoneTooltip}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="resourcing-legend">
        <span className="resourcing-legend-item"><span className="resourcing-swatch resourcing-unresourced" />No assignment</span>
        <span className="resourcing-legend-item"><span className="resourcing-swatch resourcing-resourced" />Assigned FTE</span>
        <span className="resourcing-legend-item"><span className="resourcing-swatch resourcing-over" />Over-resourced</span>
      </div>
    </>
  );
}

function ProjectResourcingPanel({
  scenario,
  heatmap,
  cumulativeHeatmap,
  milestoneCoverageHeatmap,
  sprintHeatmap,
  timeline,
  scrollRef,
  selectedSprintKey,
  onSelectSprintKey,
}: {
  scenario: ScenarioFileV1;
  heatmap: ReturnType<typeof calculateCapacityHeatmap>;
  cumulativeHeatmap: ProjectCumulativeHeatmap;
  milestoneCoverageHeatmap: ProjectCumulativeHeatmap;
  sprintHeatmap: ProjectSprintHeatmap;
  timeline: TimeKey[];
  scrollRef?: React.RefObject<HTMLElement | null>;
  selectedSprintKey: TimeKey | null;
  onSelectSprintKey: (key: TimeKey) => void;
}) {
  const [activeTab, setActiveTab] = useState<"cumulative" | "milestone" | "sprint" | "team">("cumulative");

  return (
    <section className="capacity-panel" ref={scrollRef}>
      <div className="panel-heading">
        <div>
          <h2>Project resourcing</h2>
          <p>Sprint-level diagnostic view</p>
        </div>
      </div>
      <div className="resourcing-tabs">
        <button
          type="button"
          className={`resourcing-tab${activeTab === "cumulative" ? " active" : ""}`}
          onClick={() => setActiveTab("cumulative")}
        >
          Cumulative coverage
          <InfoIcon tooltip="Shows the running % of each project's total FTE-year demand covered as assignments accumulate left to right. Red cells appear when the target finish date passes with less than 100% coverage. Orange cells mean the project is over-resourced." />
        </button>
        <button
          type="button"
          className={`resourcing-tab${activeTab === "milestone" ? " active" : ""}`}
          onClick={() => setActiveTab("milestone")}
        >
          Milestone coverage
          <InfoIcon tooltip="Shows cumulative resourcing as a % of the next upcoming milestone's required effort. Once a milestone is covered (≥100%), the denominator switches to the next milestone. Falls back to total project effort when no future milestones remain. Cells shade green from 95% and above — including over 100% — to reflect that near-full allocation counts as met." />
        </button>
        <button
          type="button"
          className={`resourcing-tab${activeTab === "sprint" ? " active" : ""}`}
          onClick={() => setActiveTab("sprint")}
        >
          Per-sprint allocation
          <InfoIcon tooltip="Shows the raw FTE assigned to each project per sprint. Orange cells appear once the project's cumulative FTE-sprints exceed its total demand — useful for Planisware export validation." />
        </button>
        <button
          type="button"
          className={`resourcing-tab${activeTab === "team" ? " active" : ""}`}
          onClick={() => setActiveTab("team")}
        >
          Team capacity
          <InfoIcon tooltip="Shows each squad's per-sprint status: idle (no work assigned), committed (assigned to a project), or overbooked (assigned to multiple projects in the same sprint)." />
        </button>
      </div>
      {activeTab === "cumulative" && (
        <ProjectCumulativeView scenario={scenario} heatmap={cumulativeHeatmap} timeline={timeline} selectedSprintKey={selectedSprintKey} onSelectSprintKey={onSelectSprintKey} />
      )}
      {activeTab === "milestone" && (
        <ProjectCumulativeView scenario={scenario} heatmap={milestoneCoverageHeatmap} timeline={timeline} selectedSprintKey={selectedSprintKey} onSelectSprintKey={onSelectSprintKey} milestoneMode />
      )}
      {activeTab === "sprint" && (
        <ProjectSprintView scenario={scenario} heatmap={sprintHeatmap} timeline={timeline} selectedSprintKey={selectedSprintKey} onSelectSprintKey={onSelectSprintKey} />
      )}
      {activeTab === "team" && (
        <TeamCapacityGrid scenario={scenario} heatmap={heatmap} timeline={timeline} selectedSprintKey={selectedSprintKey} onSelectSprintKey={onSelectSprintKey} />
      )}
    </section>
  );
}

function groupTimeline(
  timeline: TimeKey[],
  labelFor: (key: TimeKey) => string,
): Array<{ label: string; span: number }> {
  const groups: Array<{ label: string; span: number }> = [];
  for (const key of timeline) {
    const label = labelFor(key);
    const last = groups.at(-1);
    if (last?.label === label) {
      last.span += 1;
    } else {
      groups.push({ label, span: 1 });
    }
  }
  return groups;
}

function clampToTimeline(key: TimeKey, timeline: TimeKey[]): TimeKey {
  if (compareTimeKeys(key, timeline[0]) < 0) return timeline[0];
  if (compareTimeKeys(key, timeline.at(-1)!) > 0) return timeline.at(-1)!;
  return key;
}

function pointerTimeKey(
  event: Pick<PointerEvent<HTMLElement>, "clientX">,
  target: HTMLElement,
  timeline: TimeKey[],
): TimeKey {
  const rect = target.getBoundingClientRect();
  const cellWidth = rect.width / timeline.length;
  const clientX = Number.isFinite(event.clientX) ? event.clientX : rect.left;
  const rawIndex = cellWidth > 0 ? Math.floor((clientX - rect.left) / cellWidth) : 0;
  const safeIndex = Number.isFinite(rawIndex) ? rawIndex : 0;
  const clampedIndex = Math.min(Math.max(safeIndex, 0), timeline.length - 1);
  return timeline[clampedIndex];
}

function sortTimeKeys(a: TimeKey, b: TimeKey): [TimeKey, TimeKey] {
  return compareTimeKeys(a, b) <= 0 ? [a, b] : [b, a];
}

function previewBarStyle(
  pendingCreate: CreateDragState,
  timeline: TimeKey[],
  scenario: ScenarioFileV1,
): React.CSSProperties {
  const [startKey, finishKey] = sortTimeKeys(
    pendingCreate.originKey,
    pendingCreate.currentKey,
  );
  const start = timeline.indexOf(startKey);
  const finish = timeline.indexOf(finishKey);
  const squad = scenario.squads.find((candidate) => candidate.id === pendingCreate.squadId);

  return {
    gridColumn: `${start + 1} / span ${finish - start + 1}`,
    backgroundColor: squad?.color,
  };
}

function assignmentLabel(scenario: ScenarioFileV1, assignment: Assignment): string {
  const project = scenario.projects.find((candidate) => candidate.id === assignment.projectId);
  const squad = scenario.squads.find((candidate) => candidate.id === assignment.squadId);
  return `${squad?.name ?? "Squad"} on ${project?.name ?? "Project"}`;
}

function ScenarioDataModal({
  scenario,
  onApply,
  onClose,
}: {
  scenario: ScenarioFileV1;
  onApply: (next: ScenarioFileV1) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(() => exportScenario(scenario));
  const [error, setError] = useState("");

  function handleApply() {
    try {
      const next = importScenario(text);
      onApply(next);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid scenario JSON");
    }
  }

  function handleExport() {
    try {
      const parsed = importScenario(text);
      const blob = new Blob([exportScenario(parsed)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const slug = parsed.scenario.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || parsed.scenario.id;
      link.download = `${slug}.resourceplan.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fix JSON errors before exporting");
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const json = await file.text();
      const next = importScenario(json);
      setText(exportScenario(next));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      event.target.value = "";
    }
  }

  function handleReset() {
    setText(exportScenario(sampleScenario));
    setError("");
  }

  function handleClear() {
    setText(exportScenario(makeEmptyScenario()));
    setError("");
  }

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Scenario data editor"
    >
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Scenario data</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <textarea
          className="scenario-textarea"
          value={text}
          onChange={(e) => { setText(e.target.value); setError(""); }}
          spellCheck={false}
          aria-label="Scenario JSON"
        />
        {error ? <p className="modal-error">{error}</p> : null}
        <div className="modal-footer">
          <div className="modal-footer-left">
            <button type="button" className="danger-command" onClick={handleReset}>
              <RotateCcw size={14} /> Reset to sample
            </button>
            <button type="button" className="danger-command" onClick={handleClear}>
              <Trash2 size={14} /> Clear
            </button>
          </div>
          <div className="modal-footer-right">
            <label className="icon-button file-button" aria-label="Import from file">
              <FileUp size={18} />
              <input type="file" accept=".json,.resourceplan.json,application/json" onChange={handleImport} />
            </label>
            <button type="button" className="command-button" onClick={handleExport}>
              <Download size={17} /> Export
            </button>
            <button type="button" className="command-button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="command-button" onClick={handleApply}>
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
