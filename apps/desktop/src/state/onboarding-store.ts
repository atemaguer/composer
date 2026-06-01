import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// First-run onboarding hints. Each flag flips to `true` once the user has seen
// (and dismissed) the corresponding inline coach-mark, so every tip shows at
// most once. Persisted to localStorage alongside the other desktop preferences.
export type OnboardingFlags = {
  // The "Codex + Claude in parallel" explainer on the new-session page.
  seenCompareExplainer: boolean;
  // The pointer on the two parallel columns ("keep one, or hand off").
  seenParallelCoachmark: boolean;
  // The post-adopt tip teaching mid-thread provider handoff.
  seenHandoffTip: boolean;
};

export type OnboardingStore = OnboardingFlags & {
  dismissCompareExplainer: () => void;
  dismissParallelCoachmark: () => void;
  dismissHandoffTip: () => void;
  resetOnboarding: () => void;
};

const onboardingStorageKey = "composer.onboarding.flags";

const defaultOnboardingFlags: OnboardingFlags = {
  seenCompareExplainer: false,
  seenParallelCoachmark: false,
  seenHandoffTip: false
};

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      ...defaultOnboardingFlags,
      dismissCompareExplainer: () => set({ seenCompareExplainer: true }),
      dismissParallelCoachmark: () => set({ seenParallelCoachmark: true }),
      dismissHandoffTip: () => set({ seenHandoffTip: true }),
      resetOnboarding: () => set(defaultOnboardingFlags)
    }),
    {
      name: onboardingStorageKey,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): OnboardingFlags => ({
        seenCompareExplainer: state.seenCompareExplainer,
        seenParallelCoachmark: state.seenParallelCoachmark,
        seenHandoffTip: state.seenHandoffTip
      })
    }
  )
);
