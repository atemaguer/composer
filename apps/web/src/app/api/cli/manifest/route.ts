import { NextResponse } from "next/server";
import { fetchCliManifest } from "@/lib/cli-release";

export const dynamic = "force-dynamic";

// GET /api/cli/manifest → the published release manifest (version, tarball, sha256).
export async function GET() {
  try {
    const manifest = await fetchCliManifest();
    return NextResponse.json(manifest, {
      headers: {
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "manifest_unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Composer CLI manifest is unavailable."
      },
      { status: 502 }
    );
  }
}
