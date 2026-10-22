import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { accountsReviewPlugin } from "./src/accounts-review/server";
export default defineConfig({
  plugins: [react(), accountsReviewPlugin()],
  optimizeDeps: { include: ["pdfjs-dist"] },
  build: {
    rollupOptions: {
      input:
        process.env.AZZORA_ACCOUNTS_PREVIEW === "1"
          ? { accountant: "accountant.html" }
          : { main: "index.html", accountant: "accountant.html" },
    },
  },
});
