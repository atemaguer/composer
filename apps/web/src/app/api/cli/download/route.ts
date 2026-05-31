import { NextResponse } from "next/server";
import { cliBaseUrl, fetchCliManifest } from "@/lib/cli-release";

export const dynamic = "force-dynamic";

// GET /api/cli/download → 302 to the current CLI tarball in the release bucket.
export async function GET() {
  try {
    const manifest = await fetchCliManifest();
    return NextResponse.redirect(manifest.tarball, {
      status: 302,
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    // Fall back to the rolling "latest" object even if the manifest is missing.
    return NextResponse.redirect(`${cliBaseUrl()}/composer-cli-latest.tgz`, {
      status: 302,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
