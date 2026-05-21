import { PostHogErrorBoundary, PostHogProvider } from "@posthog/react";
import posthog from "posthog-js";
import { useEffect, useRef, type PropsWithChildren } from "react";

const posthogToken =
  import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN ??
  "phc_w7EZkoygYs8FgeJifBkiy9tZxMjZorpB4pmEdfrnUH94";
const posthogHost =
  import.meta.env.VITE_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

const posthogClient = posthog as typeof posthog & { __loaded?: boolean };

export const composerPostHog = posthog;

if (posthogToken && !posthogClient.__loaded) {
  posthog.init(posthogToken, {
    api_host: posthogHost,
    defaults: "2026-01-30"
  });
}

export function ComposerPostHogProvider({ children }: PropsWithChildren) {
  const identifiedRef = useRef(false);

  useEffect(() => {
    if (!posthogToken || identifiedRef.current) {
      return;
    }

    identifiedRef.current = true;

    void identifyComposerUser().catch(() => undefined);
  }, []);

  if (!posthogToken) {
    return children;
  }

  return (
    <PostHogProvider client={posthog}>
      <PostHogErrorBoundary>{children}</PostHogErrorBoundary>
    </PostHogProvider>
  );
}

async function identifyComposerUser() {
  const identity =
    (await window.composer?.getTelemetryIdentity?.()) ?? fallbackTelemetryIdentity();
  const distinctId = `composer:${identity.installationId}`;

  posthog.register({
    app: "composer",
    app_version: identity.appVersion,
    composer_installation_id: identity.installationId,
    platform: identity.platform
  });

  posthog.identify(distinctId, {
    app: "composer",
    app_version: identity.appVersion,
    composer_installation_id: identity.installationId,
    platform: identity.platform
  });
  posthog.reloadFeatureFlags();
}

function fallbackTelemetryIdentity() {
  const storageKey = "composer.telemetry.installationId";
  let installationId = window.localStorage.getItem(storageKey);

  if (!installationId) {
    installationId = crypto.randomUUID();
    window.localStorage.setItem(storageKey, installationId);
  }

  return {
    installationId,
    appVersion: __APP_VERSION__,
    platform: window.composer?.platform ?? "web"
  };
}
