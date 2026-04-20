import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function renderCompletionPage(code: string | null, error: string | null): Response {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>NoticoMax - Sign In</title>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           background: #0a0a0a; color: #fafafa; display: flex;
           align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .box { text-align: center; padding: 2rem; }
    .code { display: none; font-family: monospace; background: #1a1a1a;
            padding: 1rem; border-radius: 8px; margin-top: 1rem;
            word-break: break-all; user-select: all; }
  </style>
</head>
<body>
  <div class="box">
    ${error ? `<h1>Sign In Failed</h1><p>${error}</p>` : `<h1>Signing you in…</h1><p>You can close this window.</p>`}
    <div class="code" id="code" data-code="${code ?? ""}" data-error="${error ?? ""}">${code ?? ""}</div>
  </div>
  <script>
    // If opened via window.open, postMessage back to the opener
    if (window.opener) {
      window.opener.postMessage(${JSON.stringify({ type: "apple-signin", code, error })}, "*");
      setTimeout(() => window.close(), 200);
    }
  </script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// Handles Apple's redirect in query mode.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  return renderCompletionPage(code, error);
}

// Handles Apple's redirect in form_post mode (default for web flow).
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const code = (formData.get("code") as string) || null;
  const error = (formData.get("error") as string) || null;
  return renderCompletionPage(code, error);
}
