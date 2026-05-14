import { NextResponse, type NextRequest } from "next/server";

type DownloadPlatform = "mac" | "windows" | "linux";

const DEFAULT_DOWNLOAD_BASE_URL =
  "https://storage.googleapis.com/composer-desktop-updates-bfloat/composer/desktop/stable";

const MANIFEST_BY_PLATFORM: Record<DownloadPlatform, string> = {
  mac: "latest-mac.yml",
  windows: "latest.yml",
  linux: "latest-linux.yml",
};

const PREFERRED_EXTENSIONS: Record<DownloadPlatform, string[]> = {
  mac: [".dmg", ".zip"],
  windows: [".exe"],
  linux: [".AppImage", ".deb", ".snap"],
};

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const platform = resolvePlatform(request);
  const baseUrl = getDownloadBaseUrl();
  const manifestUrl = `${baseUrl}/${MANIFEST_BY_PLATFORM[platform]}`;

  try {
    const manifest = await fetchManifest(manifestUrl);
    const artifactPath = resolveArtifactPath(manifest, platform);
    const downloadUrl = new URL(artifactPath, `${baseUrl}/`);

    return NextResponse.redirect(downloadUrl, {
      status: 302,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "download_unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Composer download is temporarily unavailable.",
      },
      { status: 502 },
    );
  }
}

function getDownloadBaseUrl() {
  return (
    process.env.COMPOSER_DOWNLOAD_BASE_URL?.replace(/\/+$/, "") ??
    DEFAULT_DOWNLOAD_BASE_URL
  );
}

function resolvePlatform(request: NextRequest): DownloadPlatform {
  const requestedPlatform = request.nextUrl.searchParams.get("platform");

  if (isDownloadPlatform(requestedPlatform)) {
    return requestedPlatform;
  }

  const userAgent = request.headers.get("user-agent")?.toLowerCase() ?? "";
  const clientPlatform =
    request.headers.get("sec-ch-ua-platform")?.toLowerCase() ?? "";
  const platformHint = `${clientPlatform} ${userAgent}`;

  if (platformHint.includes("windows")) {
    return "windows";
  }

  if (
    platformHint.includes("linux") ||
    platformHint.includes("x11") ||
    platformHint.includes("ubuntu")
  ) {
    return "linux";
  }

  return "mac";
}

function isDownloadPlatform(value: string | null): value is DownloadPlatform {
  return value === "mac" || value === "windows" || value === "linux";
}

async function fetchManifest(manifestUrl: string) {
  const response = await fetch(manifestUrl, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Unable to load ${manifestUrl}`);
  }

  return response.text();
}

function resolveArtifactPath(manifest: string, platform: DownloadPlatform) {
  const artifactPaths = Array.from(
    manifest.matchAll(/^\s*(?:-\s*)?url:\s*(.+?)\s*$/gm),
    (match) => normalizeManifestValue(match[1]),
  ).filter(Boolean);

  for (const extension of PREFERRED_EXTENSIONS[platform]) {
    const artifactPath = artifactPaths.find((path) => path.endsWith(extension));
    if (artifactPath) {
      return artifactPath;
    }
  }

  const manifestPath = manifest.match(/^\s*path:\s*(.+?)\s*$/m)?.[1];
  const fallbackPath = manifestPath ? normalizeManifestValue(manifestPath) : null;

  if (fallbackPath) {
    return fallbackPath;
  }

  throw new Error("No downloadable Composer artifact was found.");
}

function normalizeManifestValue(value: string) {
  return value.trim().replace(/^["']|["']$/g, "");
}
