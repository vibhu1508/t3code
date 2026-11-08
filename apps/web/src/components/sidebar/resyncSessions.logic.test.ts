import { EnvironmentId, ProjectId, type AgentSessionProjectCandidate } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { getSessionResyncToastView, runSessionResync } from "./resyncSessions.logic";

const first = EnvironmentId.make("first");
const second = EnvironmentId.make("second");
const project = ProjectId.make("project");

const candidate = (overrides: Partial<AgentSessionProjectCandidate>) =>
  ({
    path: "/work/app",
    title: "app",
    sources: ["claudeAgent"],
    threadCount: 2,
    lastActiveAt: null,
    alreadyImported: false,
    ...overrides,
  }) satisfies AgentSessionProjectCandidate;

const scanResult = (
  candidates: ReadonlyArray<AgentSessionProjectCandidate>,
  truncated = false,
) => ({
  candidates,
  scannedAt: "2026-11-05T00:00:00.000Z" as never,
  truncated,
});

describe("runSessionResync", () => {
  it("imports only existing projects and keeps going after a computer fails", async () => {
    const imported: Array<unknown> = [];
    const summary = await runSessionResync({
      environmentIds: [first, second],
      scan: async (environmentId) =>
        environmentId === first
          ? null
          : scanResult([
              candidate({ projectId: project, alreadyImported: true }),
              candidate({ path: "/work/other", title: "other" }),
              candidate({ path: "/work/empty", title: "empty", threadCount: 0 }),
            ]),
      importProject: async (environmentId, input) => {
        imported.push({ environmentId, input });
        return { importedCount: 5, newCount: 2, skippedCount: 1 };
      },
    });

    expect(imported).toEqual([
      { environmentId: second, input: { projectId: project, expectedWorkspaceRoot: "/work/app" } },
    ]);
    expect(summary).toEqual({
      newCount: 2,
      skippedCount: 1,
      otherFolderCount: 1,
      mayBeMissing: true,
      anySucceeded: true,
    });
  });

  it("counts an older server's imports when it does not report new sessions", async () => {
    const summary = await runSessionResync({
      environmentIds: [first],
      scan: async () => scanResult([candidate({ projectId: project })]),
      importProject: async () => ({ importedCount: 3, skippedCount: 0 }),
    });

    expect(summary.newCount).toBe(3);
  });
});

describe("getSessionResyncToastView", () => {
  const summary = {
    newCount: 0,
    skippedCount: 0,
    otherFolderCount: 0,
    mayBeMissing: false,
    anySucceeded: true,
  };

  it.each([
    [summary, "success", "Sessions are up to date"],
    [{ ...summary, newCount: 1 }, "success", "Imported 1 new session"],
    [{ ...summary, newCount: 2, skippedCount: 1 }, "warning", "Imported 2 new sessions"],
    [{ ...summary, mayBeMissing: true }, "warning", "Resync incomplete"],
    [{ ...summary, anySucceeded: false }, "error", "Could not resync sessions"],
  ])("reports %j", (input, type, title) => {
    expect(getSessionResyncToastView(input)).toMatchObject({ type, title });
  });
});
