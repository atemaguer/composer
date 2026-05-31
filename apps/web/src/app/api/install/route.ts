import { NextResponse } from "next/server";
import { fetchCliManifest, renderInstallScript } from "@/lib/cli-release";

export const dynamic = "force-dynamic";

// Served at /install.sh and /install (see next.config rewrites):
//   curl -fsSL https://getcomposer.dev/install.sh | bash
export async function GET() {
  try {
    const manifest = await fetchCliManifest();
    return new NextResponse(renderInstallScript(manifest), {
      status: 200,
      headers: {
        "Content-Type": "text/x-shellscript; charset=utf-8",
        "Cache-Control": "public, max-age=60"
      }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Composer CLI is unavailable.";
    return new NextResponse(
      `#!/usr/bin/env bash\necho "Composer CLI installer is temporarily unavailable: ${message.replace(/"/gu, "'")}" >&2\nexit 1\n`,
      {
        status: 503,
        headers: {
          "Content-Type": "text/x-shellscript; charset=utf-8",
          "Cache-Control": "no-store"
        }
      }
    );
  }
}
