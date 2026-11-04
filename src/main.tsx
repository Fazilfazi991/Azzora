import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "./store";
import App from "./App";
import "./styles.css";
import { stagingEnabled } from "./staging/client";
import { StagingManagerProvider } from "./staging/client-provider";
const WorkspaceProvider = stagingEnabled ? StagingManagerProvider : Provider;
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WorkspaceProvider>
      <App />
    </WorkspaceProvider>
  </StrictMode>,
);
