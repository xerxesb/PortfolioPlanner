import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("ResourcePlanner app", () => {
  it("renders the portfolio board, feasibility summary, and capacity heatmap", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /ResourcePlanner/i })).toBeInTheDocument();
    expect(screen.getAllByText("Program Orion").length).toBeGreaterThan(0);
    expect(screen.getByText("Team capacity")).toBeInTheDocument();
    expect(screen.getByText(/red gates/i)).toBeInTheDocument();
  });

  it("moves the selected assignment by one sprint with the keyboard", async () => {
    const user = userEvent.setup();
    render(<App />);

    const bar = screen.getByRole("button", { name: /Squad A on Program Orion/i });
    bar.focus();
    await user.keyboard("{ArrowRight}");

    expect(screen.getByText(/26-1-2 to 26-2-4/i)).toBeInTheDocument();
  });

  it("creates a squad assignment by dragging across empty project space", () => {
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

    firePointer(track, "pointerdown", 40);
    firePointer(screen.getByRole("main"), "pointermove", 70);
    firePointer(screen.getByRole("main"), "pointerup", 70);

    expect(
      screen.getByRole("button", {
        name: /Squad A on Clinical Atlas, 26-2-1 to 26-2-4/i,
      }),
    ).toBeInTheDocument();
  });
});

function firePointer(target: Element, type: string, clientX: number) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "clientX", { value: clientX });
  Object.defineProperty(event, "pointerId", { value: 1 });
  Object.defineProperty(event, "buttons", { value: type === "pointerup" ? 0 : 1 });
  fireEvent(target, event);
}
