import {
  Download,
  FileUp,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import {
  Fragment,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  calculateCapacityHeatmap,
  calculateFeasibility,
  scenarioTimeline,
} from "./domain/feasibility";
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
  const [scenario, setScenario] = useState<ScenarioFileV1>(sampleScenario);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(
    sampleScenario.assignments[0]?.id ?? "",
  );
  const [selectedProjectId, setSelectedProjectId] = useState(
    sampleScenario.projects[0]?.id ?? "",
  );
  const [planningSquadId, setPlanningSquadId] = useState(
    sampleScenario.assignments[0]?.squadId ?? sampleScenario.squads[0]?.id ?? "",
  );
  const [importError, setImportError] = useState("");
  const [drag, setDrag] = useState<DragState | null>(null);
  const [assignmentMenu, setAssignmentMenu] = useState<AssignmentContextMenu | null>(null);
  const [laneMenu, setLaneMenu] = useState<LaneContextMenu | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const timeline = useMemo(() => scenarioTimeline(scenario), [scenario]);
  const feasibility = useMemo(() => calculateFeasibility(scenario), [scenario]);
  const heatmap = useMemo(() => calculateCapacityHeatmap(scenario), [scenario]);
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
    const nextAssignment = scenario.assignments.find(
      (assignment) => assignment.id !== assignmentId,
    );
    setSelectedAssignmentId(nextAssignment?.id ?? "");
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

  function exportFile() {
    const blob = new Blob([exportScenario(scenario)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${scenario.scenario.id}.resourceplan.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const nextScenario = importScenario(await file.text());
      setScenario(nextScenario);
      setSelectedAssignmentId(nextScenario.assignments[0]?.id ?? "");
      setSelectedProjectId(nextScenario.projects[0]?.id ?? "");
      setPlanningSquadId(nextScenario.assignments[0]?.squadId ?? nextScenario.squads[0]?.id ?? "");
      setImportError("");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed");
    } finally {
      event.target.value = "";
    }
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
          <button type="button" className="icon-button" onClick={() => { setScenario(sampleScenario); setSelectedAssignmentId(sampleScenario.assignments[0]?.id ?? ""); setSelectedProjectId(sampleScenario.projects[0]?.id ?? ""); setPlanningSquadId(sampleScenario.assignments[0]?.squadId ?? sampleScenario.squads[0]?.id ?? ""); }} aria-label="Reset sample scenario">
            <RotateCcw size={18} />
          </button>
          <label className="icon-button file-button" aria-label="Import scenario">
            <FileUp size={18} />
            <input type="file" accept=".json,.resourceplan.json,application/json" onChange={importFile} />
          </label>
          <button type="button" className="command-button" onClick={exportFile}>
            <Download size={17} />
            Export scenario
          </button>
        </div>
      </header>

      {importError ? <div className="import-error">{importError}</div> : null}

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
                onSelectProject={setSelectedProjectId}
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
            onSelectAssignment={setSelectedAssignmentId}
            onSelectProject={setSelectedProjectId}
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
            onAddAssignment={addAssignment}
            onRemoveAssignment={removeSelectedAssignment}
            onAddProject={addProject}
            onAddSquad={addSquad}
          />
        </aside>
      </section>

      <CapacityHeatmapView scenario={scenario} heatmap={heatmap} timeline={timeline} />
      <footer className="app-footer">
        <span>© 2026 Xerxes Battiwalla</span>
      </footer>
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
        className="project-label"
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
  onSelectAssignment,
  onSelectProject,
  onSelectPlanningSquad,
  onAssignmentChange,
  onProjectChange,
  onMilestoneChange,
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
  onSelectAssignment: (id: string) => void;
  onSelectProject: (id: string) => void;
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
  onAddAssignment: () => void;
  onRemoveAssignment: () => void;
  onAddProject: () => void;
  onAddSquad: () => void;
}) {
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

      <label>
        Planning squad
        <select value={planningSquadId} onChange={(event) => onSelectPlanningSquad(event.target.value)}>
          {scenario.squads.map((squad) => (
            <option value={squad.id} key={squad.id}>{squad.name}</option>
          ))}
        </select>
      </label>

      <label>
        Project
        <select value={selectedProject?.id ?? ""} onChange={(event) => onSelectProject(event.target.value)}>
          {scenario.projects.map((project) => (
            <option value={project.id} key={project.id}>{project.name}</option>
          ))}
        </select>
      </label>

      {selectedProject ? (
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
                onProjectChange(selectedProject.id, {
                  effortFteYears: Number(event.target.value),
                })
              }
            />
          </label>
          {selectedProject.milestones.map((milestone) => (
            <div className="milestone-editor" key={milestone.id}>
              <strong>{milestone.name}</strong>
              <label>
                Gate sprint
                <select
                  value={milestone.dateKey}
                  onChange={(event) =>
                    onMilestoneChange(selectedProject.id, milestone.id, {
                      dateKey: event.target.value as TimeKey,
                    })
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
                    onMilestoneChange(selectedProject.id, milestone.id, {
                      requiredPercent: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
          ))}
        </div>
      ) : null}

      <label>
        Assignment
        <select value={selectedAssignment?.id ?? ""} onChange={(event) => onSelectAssignment(event.target.value)}>
          {scenario.assignments.map((assignment) => {
            const project = scenario.projects.find((candidate) => candidate.id === assignment.projectId);
            const squad = scenario.squads.find((candidate) => candidate.id === assignment.squadId);
            return (
              <option value={assignment.id} key={assignment.id}>{squad?.name} on {project?.name}</option>
            );
          })}
        </select>
      </label>

      {selectedAssignment ? (
        <div className="editor-stack">
          <p className="selected-range">
            {assignmentLabel(scenario, selectedAssignment)} {selectedAssignment.startKey} to {selectedAssignment.finishKey}
          </p>
          <label>
            Assignment project
            <select
              value={selectedAssignment.projectId}
              onChange={(event) =>
                onAssignmentChange(selectedAssignment.id, {
                  projectId: event.target.value,
                })
              }
            >
              {scenario.projects.map((project) => (
                <option value={project.id} key={project.id}>{project.name}</option>
              ))}
            </select>
          </label>
          <label>
            Assignment squad
            <select
              value={selectedAssignment.squadId}
              onChange={(event) => {
                onAssignmentChange(selectedAssignment.id, {
                  squadId: event.target.value,
                });
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
                onAssignmentChange(selectedAssignment.id, {
                  startKey: event.target.value as TimeKey,
                })
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
                onAssignmentChange(selectedAssignment.id, {
                  finishKey: event.target.value as TimeKey,
                })
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
      ) : null}
    </section>
  );
}

function CapacityHeatmapView({
  scenario,
  heatmap,
  timeline,
}: {
  scenario: ScenarioFileV1;
  heatmap: ReturnType<typeof calculateCapacityHeatmap>;
  timeline: TimeKey[];
}) {
  return (
    <section className="capacity-panel">
      <div className="panel-heading">
        <div>
          <h2>Team capacity</h2>
          <p>Secondary sprint-grid diagnostic view</p>
        </div>
      </div>
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
