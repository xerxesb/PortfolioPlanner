import {
  Database,
  Download,
  FileUp,
  Plus,
  RotateCcw,
  Save,
  Trash2,
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
import {
  calculateCapacityHeatmap,
  calculateFeasibility,
  scenarioTimeline,
} from "./domain/feasibility";
import {
  calculateProjectCumulativeHeatmap,
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
import type { Assignment, Project, ScenarioFileV1, TimeKey } from "./domain/types";
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
  const [drag, setDrag] = useState<DragState | null>(null);
  const [assignmentMenu, setAssignmentMenu] = useState<AssignmentContextMenu | null>(null);
  const [laneMenu, setLaneMenu] = useState<LaneContextMenu | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const timeline = useMemo(() => scenarioTimeline(scenario), [scenario]);
  const feasibility = useMemo(() => calculateFeasibility(scenario), [scenario]);
  const heatmap = useMemo(() => calculateCapacityHeatmap(scenario), [scenario]);
  const cumulativeHeatmap = useMemo(() => calculateProjectCumulativeHeatmap(scenario), [scenario]);
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

  function selectProject(id: string) {
    setSelectedProjectId(id);
    setSelectedAssignmentId("");
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
        <div className="topbar-actions">
          <button type="button" className="command-button" onClick={() => setIsDataModalOpen(true)}>
            <Database size={17} />
            Scenario data
          </button>
        </div>
      </header>

      <section className="workspace-grid">
        <section className="board-panel" aria-label="Project sequencing board">
          <div className="panel-heading">
            <div>
              <h2>Project sequencing</h2>
              <p>{scenario.scenario.name}</p>
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
            <TimelineHeaders timeline={timeline} fiscalYearStartMonth={scenario.calendar.financialYearStartMonth} />
            {scenario.projects.map((project) => (
              <ProjectLane
                key={project.id}
                project={project}
                scenario={scenario}
                timeline={timeline}
                selectedAssignmentId={selectedAssignmentId}
                selectedProjectId={selectedAssignmentId ? "" : selectedProjectId}
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

        <aside className="side-panel">
          <FeasibilitySummaryView feasibility={feasibility} />
          <EditorPanel
            scenario={scenario}
            selectedAssignment={selectedAssignment}
            selectedProject={selectedProject}
            planningSquadId={planningSquadId}
            timeline={timeline}
            onScenarioNameChange={(name) =>
              updateScenario((current) => ({
                ...current,
                scenario: { ...current.scenario, name },
              }))
            }
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
            onAddSquad={addSquad}
          />
        </aside>
      </section>

      <ProjectResourcingPanel
        scenario={scenario}
        heatmap={heatmap}
        cumulativeHeatmap={cumulativeHeatmap}
        sprintHeatmap={sprintHeatmap}
        timeline={timeline}
      />
      <footer className="app-footer">
        <span>© 2026 Xerxes Battiwalla &nbsp;(v {__GIT_SHA__})</span>
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
    </main>
  );
}

function TimelineHeaders({
  timeline,
  fiscalYearStartMonth,
}: {
  timeline: TimeKey[];
  fiscalYearStartMonth: number;
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
        <div className="sprint-cell" key={key}>{parseTimeKey(key).sprint}</div>
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

  return (
    <>
      <button
        type="button"
        className={`project-label${selectedProjectId === project.id ? " selected" : ""}`}
        onClick={() => onSelectProject(project.id)}
      >
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

function FeasibilitySummaryView({
  feasibility,
}: {
  feasibility: ReturnType<typeof calculateFeasibility>;
}) {
  const milestones = Object.values(feasibility.milestonesById);

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
      <div className="risk-list">
        {milestones.map((milestone) => (
          <div className={`risk-item ${milestone.status}`} key={milestone.milestoneId}>
            <strong>{milestone.name}</strong>
            <span>
              {statusLabel[milestone.status]} at {milestone.dateKey}. {Math.round(milestone.actualCapacity)} of {Math.round(milestone.requiredCapacity)} FTE-sprints covered.
            </span>
          </div>
        ))}
      </div>
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
  planningSquadId,
  timeline,
  onScenarioNameChange,
  onSelectPlanningSquad,
  onAssignmentChange,
  onProjectChange,
  onMilestoneChange,
  onAddMilestone,
  onRemoveMilestone,
  onAddAssignment,
  onRemoveAssignment,
  onAddProject,
  onAddSquad,
}: {
  scenario: ScenarioFileV1;
  selectedAssignment?: Assignment;
  selectedProject?: Project;
  planningSquadId: string;
  timeline: TimeKey[];
  onScenarioNameChange: (name: string) => void;
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
  onAddSquad: () => void;
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
        <button type="button" className="small-command" onClick={onAddSquad}>
          <Plus size={14} />
          Squad
        </button>
        <button type="button" className="small-command" onClick={onAddAssignment}>
          <Plus size={14} />
          Assignment
        </button>
      </div>

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
}: {
  scenario: ScenarioFileV1;
  heatmap: ReturnType<typeof calculateCapacityHeatmap>;
  timeline: TimeKey[];
}) {
  return (
    <div className="capacity-grid" style={{ "--sprint-count": timeline.length } as React.CSSProperties}>
      <div className="capacity-label">Squad</div>
      {timeline.map((key) => (
        <div className="capacity-head" key={key}>{key}</div>
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
              <div className={`capacity-cell ${cell.status}`} key={`${squad.id}-${key}`}>
                {cell.status === "idle" ? "-" : shortNames}
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

function ProjectCumulativeView({
  scenario,
  heatmap,
  timeline,
}: {
  scenario: ScenarioFileV1;
  heatmap: ProjectCumulativeHeatmap;
  timeline: TimeKey[];
}) {
  return (
    <>
      <div className="capacity-grid" style={{ "--sprint-count": timeline.length } as React.CSSProperties}>
        <div className="capacity-label">Project</div>
        {timeline.map((key) => (
          <div className="capacity-head" key={key}>{key}</div>
        ))}
        {scenario.projects.map((project) => (
          <Fragment key={project.id}>
            <div className="capacity-label capacity-label--project">
              <span>{project.name}</span>
              <small>{project.effortFteYears} FTE-yrs · {project.targetFinishKey}</small>
            </div>
            {timeline.map((key) => {
              const cell = heatmap.byProject[project.id]?.[key];
              if (!cell) return <div className="capacity-cell resourcing-unresourced" key={key} />;
              return (
                <div className={`capacity-cell resourcing-${cell.status}`} key={key}>
                  {cell.percent > 0 ? `${Math.round(cell.percent)}%` : ""}
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
        <span className="resourcing-legend-item"><span className="resourcing-swatch resourcing-over" />Over-resourced</span>
        <span className="resourcing-legend-item"><span className="resourcing-swatch resourcing-at-risk" />At risk (past target)</span>
      </div>
    </>
  );
}

function ProjectSprintView({
  scenario,
  heatmap,
  timeline,
}: {
  scenario: ScenarioFileV1;
  heatmap: ProjectSprintHeatmap;
  timeline: TimeKey[];
}) {
  return (
    <>
      <div className="capacity-grid" style={{ "--sprint-count": timeline.length } as React.CSSProperties}>
        <div className="capacity-label">Project</div>
        {timeline.map((key) => (
          <div className="capacity-head" key={key}>{key}</div>
        ))}
        {scenario.projects.map((project) => (
          <Fragment key={project.id}>
            <div className="capacity-label capacity-label--project">
              <span>{project.name}</span>
              <small>{project.effortFteYears} FTE-yrs</small>
            </div>
            {timeline.map((key) => {
              const cell = heatmap.byProject[project.id]?.[key];
              if (!cell) return <div className="capacity-cell resourcing-unresourced" key={key} />;
              return (
                <div className={`capacity-cell resourcing-${cell.status}`} key={key}>
                  {cell.fteSprints > 0 ? cell.fteSprints : "–"}
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
  sprintHeatmap,
  timeline,
}: {
  scenario: ScenarioFileV1;
  heatmap: ReturnType<typeof calculateCapacityHeatmap>;
  cumulativeHeatmap: ProjectCumulativeHeatmap;
  sprintHeatmap: ProjectSprintHeatmap;
  timeline: TimeKey[];
}) {
  const [activeTab, setActiveTab] = useState<"cumulative" | "sprint" | "team">("cumulative");

  return (
    <section className="capacity-panel">
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
        <ProjectCumulativeView scenario={scenario} heatmap={cumulativeHeatmap} timeline={timeline} />
      )}
      {activeTab === "sprint" && (
        <ProjectSprintView scenario={scenario} heatmap={sprintHeatmap} timeline={timeline} />
      )}
      {activeTab === "team" && (
        <TeamCapacityGrid scenario={scenario} heatmap={heatmap} timeline={timeline} />
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
      link.download = `${parsed.scenario.id}.resourceplan.json`;
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
