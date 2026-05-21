import posthog from "posthog-js";

const posthogToken =
  process.env.NEXT_PUBLIC_POSTHOG_TOKEN ??
  "phc_w7EZkoygYs8FgeJifBkiy9tZxMjZorpB4pmEdfrnUH94";
const posthogHost =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

if (posthogToken) {
  posthog.init(posthogToken, {
    api_host: posthogHost,
    defaults: "2026-01-30"
  });
}
