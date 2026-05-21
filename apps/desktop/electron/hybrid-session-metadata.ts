import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type DelegateProvider = "codex" | "claude";
export type HybridSessionMode = "planner-review" | "parallel-initial" | "handoff";

export type HybridDelegateSessionMetadata = {
  parentSessionId: string;
  provider: DelegateProvider;
  providerSessionId: string;
  mode: HybridSessionMode;
  updatedAt: string;
};

type HybridSessionMetadataStore = {
  delegates: HybridDelegateSessionMetadata[];
};

const STORE_PATH = path.join(
  os.homedir(),
  ".composer",
  "hybrid-session-metadata.json"
);

export function readHybridSessionMetadata(): HybridSessionMetadataStore {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as unknown;
    const record = parsed && typeof parsed === "object"
      ? parsed as Record<string, unknown>
      : {};
    const delegates = Array.isArray(record.delegates)
      ? record.delegates
          .map(parseDelegate)
          .filter((delegate): delegate is HybridDelegateSessionMetadata =>
            Boolean(delegate)
          )
      : [];

    return { delegates };
  } catch {
    return { delegates: [] };
  }
}

export function upsertHybridDelegateSessions(
  delegates: Array<Omit<HybridDelegateSessionMetadata, "updatedAt">>
) {
  if (delegates.length === 0) {
    return;
  }

  const store = readHybridSessionMetadata();
  const updatedAt = new Date().toISOString();
  const nextDelegates = new Map(
    store.delegates.map((delegate) => [
      delegateKey(delegate.provider, delegate.providerSessionId),
      delegate
    ])
  );

  for (const delegate of delegates) {
    nextDelegates.set(delegateKey(delegate.provider, delegate.providerSessionId), {
      ...delegate,
      updatedAt
    });
  }

  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(
    STORE_PATH,
    `${JSON.stringify({ delegates: [...nextDelegates.values()] }, null, 2)}\n`
  );
}

function parseDelegate(value: unknown): HybridDelegateSessionMetadata | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const provider = record.provider;
  const mode = record.mode;

  if (
    provider !== "codex" &&
    provider !== "claude"
  ) {
    return null;
  }

  if (
    mode !== "planner-review" &&
    mode !== "parallel-initial" &&
    mode !== "handoff"
  ) {
    return null;
  }

  if (
    typeof record.parentSessionId !== "string" ||
    typeof record.providerSessionId !== "string" ||
    typeof record.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    parentSessionId: record.parentSessionId,
    provider,
    providerSessionId: record.providerSessionId,
    mode,
    updatedAt: record.updatedAt
  };
}

function delegateKey(provider: DelegateProvider, providerSessionId: string) {
  return `${provider}:${providerSessionId}`;
}
