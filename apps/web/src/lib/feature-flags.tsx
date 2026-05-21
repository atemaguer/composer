"use client";

import {
  PostHogFeature,
  useActiveFeatureFlags,
  useFeatureFlagEnabled,
  useFeatureFlagPayload,
  useFeatureFlagResult,
  useFeatureFlagVariantKey
} from "@posthog/react";
import posthog from "posthog-js";
import type { FeatureFlagResult, JsonType } from "posthog-js";
import type { ReactNode } from "react";

export type ComposerFeatureFlag = string;
export type FeatureFlagVariant = string | boolean;

type FeatureFlagGateProps = {
  flag: ComposerFeatureFlag;
  children: ReactNode | ((payload: JsonType) => ReactNode);
  fallback?: ReactNode;
  match?: FeatureFlagVariant;
};

export function useComposerFeatureFlag(
  flag: ComposerFeatureFlag,
  fallback = false
) {
  return useFeatureFlagEnabled(flag) ?? fallback;
}

export function useComposerFeatureFlagVariant(
  flag: ComposerFeatureFlag,
  fallback: FeatureFlagVariant = false
) {
  return useFeatureFlagVariantKey(flag) ?? fallback;
}

export function useComposerFeatureFlagPayload<T = JsonType>(
  flag: ComposerFeatureFlag,
  fallback?: T
) {
  return (useFeatureFlagPayload(flag) as T | undefined) ?? fallback;
}

export function useComposerFeatureFlagResult(
  flag: ComposerFeatureFlag
): FeatureFlagResult | undefined {
  return useFeatureFlagResult(flag);
}

export function useComposerActiveFeatureFlags() {
  return useActiveFeatureFlags();
}

export function ComposerFeatureFlagGate({
  flag,
  children,
  fallback = null,
  match = true
}: FeatureFlagGateProps) {
  return (
    <PostHogFeature flag={flag} match={match} fallback={fallback}>
      {children}
    </PostHogFeature>
  );
}

export function getComposerFeatureFlag(
  flag: ComposerFeatureFlag,
  fallback: FeatureFlagVariant = false
) {
  return posthog.getFeatureFlag(flag) ?? fallback;
}

export function reloadComposerFeatureFlags() {
  posthog.reloadFeatureFlags();
}
