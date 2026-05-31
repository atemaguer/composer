import { NextResponse } from "next/server";
import { fetchCliManifest, renderHomebrewFormula } from "@/lib/cli-release";

export const dynamic = "force-dynamic";

// Served at /homebrew/composer.rb (see next.config rewrites):
//   brew install https://getcomposer.dev/homebrew/composer.rb
export async function GET() {
  try {
    const manifest = await fetchCliManifest();
    return new NextResponse(renderHomebrewFormula(manifest), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=60"
      }
    });
  } catch {
    return new NextResponse("# Composer Homebrew formula is unavailable.\n", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }
}
