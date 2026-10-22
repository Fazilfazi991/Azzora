import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { accountsReviewPlugin } from "./src/accounts-review/server";
export default defineConfig({
  plugins: [react(), accountsReviewPlugin()],
  build: {
    rollupOptions: {
      input: { main: "index.html", accountant: "accountant.html" },
    },
  },
});
