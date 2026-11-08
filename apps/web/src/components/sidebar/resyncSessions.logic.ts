import type {
  AgentSessionImportInput,
  AgentSessionImportResult,
  AgentSessionScanResult,
  EnvironmentId,
} from "@t3tools/contracts";

export interface SessionResyncSummary {
  readonly newCount: number;
  readonly skippedCount: number;
  readonly otherFolderCount: number;
  readonly mayBeMissing: boolean;
  readonly anySucceeded: boolean;
}

export async function runSessionResync(input: {
  readonly environmentIds: ReadonlyArray<EnvironmentId>;
  readonly scan: (environmentId: EnvironmentId) => Promise<AgentSessionScanResult | null>;
  readonly importProject: (
    environmentId: EnvironmentId,
    project: AgentSessionImportInput,
  ) => Promise<AgentSessionImportResult | null>;
}): Promise<SessionResyncSummary> {
  let newCount = 0;
  let skippedCount = 0;
  let otherFolderCount = 0;
  let mayBeMissing = false;
  let anySucceeded = false;
  for (const environmentId of input.environmentIds) {
    const scan = await input.scan(environmentId);
    if (scan === null) {
      mayBeMissing = true;
      continue;
    }
    anySucceeded = true;
    if (scan.truncated === true) mayBeMissing = true;
    for (const candidate of scan.candidates) {
      if (candidate.projectId === undefined) {
        if (candidate.threadCount > 0) otherFolderCount += 1;
        continue;
      }
      const result = await input.importProject(environmentId, {
        projectId: candidate.projectId,
        expectedWorkspaceRoot: candidate.path,
      });
      if (result === null) {
        mayBeMissing = true;
        continue;
      }
      // shortcut: older servers omit newCount, so this overstates new sessions until they update.
      newCount += result.newCount ?? result.importedCount;
      skippedCount += result.skippedCount;
    }
  }
  return { newCount, skippedCount, otherFolderCount, mayBeMissing, anySucceeded };
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function getSessionResyncToastView(summary: SessionResyncSummary) {
  if (!summary.anySucceeded) {
    return {
      type: "error" as const,
      title: "Could not resync sessions",
      description: "No connected computer could be scanned. Check the connection and try again.",
    };
  }
  const notes = [
    summary.skippedCount > 0
      ? `${plural(summary.skippedCount, "session", "sessions")} not imported yet. Resync again to continue.`
      : null,
    summary.mayBeMissing ? "Some sessions may be missing." : null,
    summary.otherFolderCount > 0
      ? `${plural(summary.otherFolderCount, "other folder has", "other folders have")} sessions but no project.`
      : null,
  ].filter((note) => note !== null);
  const incomplete = summary.skippedCount > 0 || summary.mayBeMissing;
  return {
    type: incomplete ? ("warning" as const) : ("success" as const),
    title:
      summary.newCount > 0
        ? `Imported ${plural(summary.newCount, "new session", "new sessions")}`
        : incomplete
          ? "Resync incomplete"
          : "Sessions are up to date",
    description: notes.join(" "),
  };
}
