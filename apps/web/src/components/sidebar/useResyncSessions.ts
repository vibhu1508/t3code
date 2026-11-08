import { useNavigate } from "@tanstack/react-router";
import { AuthOrchestrationOperateScope } from "@t3tools/contracts";

import { agentSessionImport, agentSessionRescan } from "../../state/agentSessions";
import { useEnvironments } from "../../state/environments";
import { useEnvironmentsWithScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { toastManager } from "../ui/toast";
import {
  getSessionResyncToastView,
  runSessionResync,
  type SessionResyncSummary,
} from "./resyncSessions.logic";

// The sidebar and command palette share one run.
let resyncRunning = false;

async function resyncWithToast(
  run: () => Promise<SessionResyncSummary>,
  openSetup: () => void,
): Promise<void> {
  if (resyncRunning) return;
  resyncRunning = true;
  const toastId = toastManager.add({
    type: "loading",
    title: "Resyncing sessions",
    timeout: 0,
    data: { hideCopyButton: true },
  });
  try {
    const summary = await run();
    toastManager.update(toastId, {
      ...getSessionResyncToastView(summary),
      timeout: 8_000,
      ...(summary.otherFolderCount > 0
        ? { actionProps: { children: "Open setup", onClick: openSetup } }
        : {}),
    });
  } catch {
    toastManager.update(toastId, {
      type: "error",
      title: "Could not resync sessions",
      description: "Try again.",
      timeout: 8_000,
    });
  } finally {
    resyncRunning = false;
  }
}

export function useResyncSessions(): (() => Promise<void>) | null {
  const navigate = useNavigate();
  const { environments } = useEnvironments();
  const permitted = useEnvironmentsWithScope(environments, AuthOrchestrationOperateScope);
  const rescan = useAtomCommand(agentSessionRescan, { reportFailure: false });
  const importSessions = useAtomCommand(agentSessionImport, { reportFailure: false });
  if (permitted.size === 0) return null;

  return () =>
    resyncWithToast(
      () =>
        runSessionResync({
          environmentIds: [...permitted],
          scan: async (environmentId) => {
            const result = await rescan({ environmentId, input: {} });
            return result._tag === "Success" ? result.value : null;
          },
          importProject: async (environmentId, input) => {
            const result = await importSessions({ environmentId, input });
            return result._tag === "Success" ? result.value : null;
          },
        }),
      () => void navigate({ to: "/welcome" }),
    );
}
