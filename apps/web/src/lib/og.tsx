import { ImageResponse } from "next/og";

import { siteConfig } from "./site";

export const ogSize = { width: 1200, height: 630 };
export const ogAlt = siteConfig.ogImageAlt;
export const ogContentType = "image/png";

// Shared renderer used by both opengraph-image and twitter-image routes.
export function renderOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background:
            "linear-gradient(150deg, #0b0b0c 0%, #141415 55%, #1d1d1f 100%)",
          color: "#e4e4e7",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div
            style={{
              display: "flex",
              width: "46px",
              height: "46px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #d97757 0%, #a3a3a3 100%)",
            }}
          />
          <div
            style={{ fontSize: "30px", fontWeight: 600, letterSpacing: "-0.02em" }}
          >
            Composer
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <div
            style={{
              fontSize: "76px",
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              maxWidth: "900px",
            }}
          >
            Seamless Claude and Codex handoff.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "12px 22px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(217,119,87,0.16)",
                color: "#e9a98c",
                fontSize: "26px",
                fontWeight: 600,
              }}
            >
              Claude
            </div>
            <div style={{ display: "flex", fontSize: "34px", color: "#71717a" }}>
              →
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "12px 22px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                color: "#e4e4e7",
                fontSize: "26px",
                fontWeight: 600,
              }}
            >
              Codex
            </div>
            <div
              style={{
                display: "flex",
                fontSize: "24px",
                color: "#a1a1aa",
                marginLeft: "8px",
              }}
            >
              one continuous thread
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: "24px",
            color: "#71717a",
            letterSpacing: "0.02em",
          }}
        >
          getcomposer.dev
        </div>
      </div>
    ),
    { ...ogSize },
  );
}
