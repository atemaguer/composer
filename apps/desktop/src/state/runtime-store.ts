import { create } from "zustand";

export type AgentServerInfo = {
  httpUrl: string;
  wsUrl: string;
  cwd?: string;
  workspaceName?: string;
};

type RuntimeStore = {
  agentServer: AgentServerInfo | null;
  setAgentServer: (agentServer: AgentServerInfo | null) => void;
};

export const useRuntimeStore = create<RuntimeStore>((set) => ({
  agentServer: null,
  setAgentServer: (agentServer) => set({ agentServer })
}));
