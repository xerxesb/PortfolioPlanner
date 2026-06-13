import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/PortfolioPlanner/",
  plugins: [react()],
});
