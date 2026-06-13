import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function gitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

export default defineConfig({
  base: "/PortfolioPlanner/",
  plugins: [react()],
  define: {
    __GIT_SHA__: JSON.stringify(gitSha()),
  },
});
