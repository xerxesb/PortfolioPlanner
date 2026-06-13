import { render, screen } from "@testing-library/react";
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
});
