import config from "../vite.config.ts";
// Preparation server only: keep optimizer writes out of shared dependencies.
export default { ...config, cacheDir: "tmp/agent-3-vite-cache" };
