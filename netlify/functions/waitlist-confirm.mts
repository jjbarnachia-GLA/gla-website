import type { Context, Config } from "@netlify/functions";

// GLA Waitlist Confirmation
// Handles Netlify webhook POST — content-type can be either:
//   application/x-www-form-urlencoded  (Netlify form webhook default)
//   application/json                    (direct API calls / n8n)

const PRESS_DOMAINS = [
  "golf","golfdigest","golfweek","golfchannel","pgatour",
  "espn","sports","nbc","cbs","abc","fox","cnn",
  "techcrunch","wired","verge","forbes","wsj","nyt",
  "bloomberg","businessinsider","venturebeat",
  "press","media","news","magazine","journal",
];

function isPressDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return PRESS_DOMAINS.some((kw) => domain.includes(kw));
}

async function sendEmail(apiKey: string, payload: object): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

// Parse Netlify webhook payload — handles both urlencoded and JSON
async function parsePayload(req: Request): Promise<Record<string, any>> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try { return await req.json(); } catch { return {}; }
  }

  // Netlify sends form webhooks as urlencoded or JSON depending on version
  // Always try urlencoded first, then fall back to JSON
  try {
    const text = await req.text();
    // Try JSON parse first on the raw text
    try { return JSON.parse(text); } catch { /* not JSON */ }
    // Parse as urlencoded
    const params = new URLSearchParams(text);
    const result: Record<string, any> = {};
    params.forEach((v, k) => { result[k] = v; });
    // Netlify wraps form data in a `data` object in webhook payload
    // Try to reconstruct nested data object
    if (result["data[email]"]) {
      result.data = { email: result["data[email]"] };
    }
    return result;
  } catch {
    return {};
  }
}

export default async (req: Request, context: Context) => {
  // Netlify webhooks use POST — also accept GET for health check
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, service: "waitlist-confirm" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await parsePayload(req);

  // Netlify webhook payload structure:
  // { data: { email, name, ... }, form_name, site_url, ... }
  const email = (
    body?.data?.email ??
    body?.email ??
    body?.["data[email]"] ??
    ""
  ).trim().toLowerCase();

  const name   = body?.data?.name  ?? body?.name  ?? "";
  const source = body?.data?.source ?? body?.site_url ?? "lieanalyzer.com";
  const ts     = new Date().toUTCString();

  if (!email || !email.includes("@")) {
    console.error("[waitlist-confirm] No valid email found in payload:", JSON.stringify(body));
    // Return 200 so Netlify doesn't disable the webhook — log the issue instead
    return new Response(JSON.stringify({ ok: false, reason: "no valid email" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const RESEND_API_KEY = Netlify.env.get("RESEND_API_KEY");
  const NOTIFY_EMAIL   = Netlify.env.get("NOTIFY_EMAIL")  ?? "gla.dataclaw@gmail.com";
  const FOUNDER_EMAIL  = Netlify.env.get("FOUNDER_EMAIL") ?? "jjbarnachia@gmail.com";

  if (!RESEND_API_KEY || RESEND_API_KEY.startsWith("REPLACE")) {
    console.error("[waitlist-confirm] RESEND_API_KEY not configured");
    return new Response(JSON.stringify({ ok: false, reason: "email service not configured" }), {
      status: 200, // 200 to prevent webhook disable
      headers: { "Content-Type": "application/json" },
    });
  }

  const pressAlert = isPressDomain(email);
  const greeting   = name ? `${name},` : "Golfer,";

  // ── 1. Confirmation → user ────────────────────────────────────────────────
  const userEmail = {
    from: "GLA Neural <onboarding@resend.dev>",
    to: [email],
    subject: "You're on the GLA beta waitlist.",
    html: `<!DOCTYPE html><html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#050a0e;font-family:'Courier New',monospace;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#050a0e;padding:40px 20px;">
<tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <tr><td style="border-bottom:1px solid #162636;padding-bottom:18px;">
    <span style="font-size:13px;font-weight:700;letter-spacing:0.22em;color:#00c8ff;">
      GLA<span style="color:#3e5870;">_NEURAL</span></span>
  </td></tr>

  <tr><td style="padding-top:26px;">
    <p style="margin:0 0 6px;font-size:9px;letter-spacing:0.22em;color:#3e5870;text-transform:uppercase;">
      // ACCESS_REQUEST_RECEIVED</p>
    <h1 style="margin:0 0 22px;font-size:26px;font-weight:900;color:#e4f2ff;line-height:1.1;letter-spacing:0.04em;">
      YOU'RE ON THE LIST.</h1>
  </td></tr>

  <tr><td style="padding-bottom:24px;border-bottom:1px solid #162636;">
    <p style="margin:0 0 12px;font-size:13px;line-height:1.9;color:#b8cdd8;">
      ${greeting} Your request for beta access has been logged. Validation Phase 1 is
      limited to <strong style="color:#e4f2ff;">500 users</strong> — you'll receive an
      access notification as soon as your slot is confirmed.</p>
    <p style="margin:0 0 12px;font-size:13px;line-height:1.9;color:#b8cdd8;">
      Every lie image you capture improves the model's 12-class detection accuracy.
      You're not just testing GLA — <strong style="color:#00c8ff;">you're training it.</strong></p>
    <p style="margin:0;font-size:13px;line-height:1.9;color:#b8cdd8;">
      Questions? <a href="mailto:support@lieanalyzer.com" style="color:#00c8ff;">support@lieanalyzer.com</a></p>
  </td></tr>

  <tr><td style="padding:18px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #162636;background:#0a1420;">
      <tr><td colspan="2" style="padding:9px 14px;font-size:9px;letter-spacing:0.18em;
        color:#3e5870;border-bottom:1px solid #162636;text-transform:uppercase;">REQUEST_LOG</td></tr>
      <tr>
        <td style="padding:8px 14px;font-size:11px;color:#3e5870;border-bottom:1px solid #162636;width:40%;">STATUS</td>
        <td style="padding:8px 14px;font-size:11px;color:#00ff9d;border-bottom:1px solid #162636;">QUEUED</td>
      </tr>
      <tr>
        <td style="padding:8px 14px;font-size:11px;color:#3e5870;border-bottom:1px solid #162636;">PHASE</td>
        <td style="padding:8px 14px;font-size:11px;color:#b8cdd8;border-bottom:1px solid #162636;">Validation Phase 1 — 500 users</td>
      </tr>
      <tr>
        <td style="padding:8px 14px;font-size:11px;color:#3e5870;border-bottom:1px solid #162636;">MODEL</td>
        <td style="padding:8px 14px;font-size:11px;color:#b8cdd8;border-bottom:1px solid #162636;">MobileNetV3Small · 12-class · 90.8% accuracy</td>
      </tr>
      <tr>
        <td style="padding:8px 14px;font-size:11px;color:#3e5870;">EMAIL</td>
        <td style="padding:8px 14px;font-size:11px;color:#00c8ff;">${email}</td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding-top:8px;border-top:1px solid #162636;">
    <p style="margin:12px 0 0;font-size:10px;color:#3e5870;line-height:1.6;">
      © 2025 Golf Lie Analyzer ·
      <a href="https://lieanalyzer.com" style="color:#3e5870;">lieanalyzer.com</a><br/>
      Image data is anonymous and never sold ·
      <a href="mailto:support@lieanalyzer.com" style="color:#3e5870;">support@lieanalyzer.com</a>
    </p>
  </td></tr>

</table></td></tr></table>
</body></html>`,
  };

  // ── 2. Ops alert → gla.dataclaw@gmail.com ────────────────────────────────
  const opsAlert = {
    from: "GLA Waitlist <onboarding@resend.dev>",
    to: [NOTIFY_EMAIL],
    subject: `[GLA] New beta signup: ${email}`,
    html: `<body style="font-family:'Courier New',monospace;background:#050a0e;padding:24px;">
<p style="color:#00c8ff;font-size:12px;letter-spacing:0.16em;margin:0 0 14px;">// WAITLIST_SUBMISSION</p>
<table style="border:1px solid #162636;background:#0a1420;width:100%;max-width:480px;border-collapse:collapse;">
  <tr>
    <td style="padding:8px 14px;font-size:11px;color:#3e5870;border-bottom:1px solid #162636;width:35%;">EMAIL</td>
    <td style="padding:8px 14px;font-size:11px;color:#00c8ff;border-bottom:1px solid #162636;">${email}</td>
  </tr>
  ${name ? `<tr>
    <td style="padding:8px 14px;font-size:11px;color:#3e5870;border-bottom:1px solid #162636;">NAME</td>
    <td style="padding:8px 14px;font-size:11px;color:#b8cdd8;border-bottom:1px solid #162636;">${name}</td>
  </tr>` : ""}
  <tr>
    <td style="padding:8px 14px;font-size:11px;color:#3e5870;border-bottom:1px solid #162636;">SOURCE</td>
    <td style="padding:8px 14px;font-size:11px;color:#b8cdd8;border-bottom:1px solid #162636;">${source}</td>
  </tr>
  <tr>
    <td style="padding:8px 14px;font-size:11px;color:#3e5870;border-bottom:1px solid #162636;">TIMESTAMP</td>
    <td style="padding:8px 14px;font-size:11px;color:#b8cdd8;border-bottom:1px solid #162636;">${ts}</td>
  </tr>
  <tr>
    <td style="padding:8px 14px;font-size:11px;color:#3e5870;border-bottom:1px solid #162636;">PRESS_FLAG</td>
    <td style="padding:8px 14px;font-size:11px;color:${pressAlert ? "#ff6b35" : "#3e5870"};border-bottom:1px solid #162636;">
      ${pressAlert ? "⚠ YES — possible press/media" : "NO"}</td>
  </tr>
  <tr>
    <td style="padding:8px 14px;font-size:11px;color:#3e5870;">DASHBOARD</td>
    <td style="padding:8px 14px;font-size:11px;">
      <a href="https://app.netlify.com/projects/boisterous-florentine-15a8f1/forms"
        style="color:#00c8ff;">View all submissions →</a></td>
  </tr>
</table>
</body>`,
  };

  // ── 3. Press alert → founder (only if press domain detected) ─────────────
  const pressPayload = pressAlert ? {
    from: "GLA Waitlist <onboarding@resend.dev>",
    to: [FOUNDER_EMAIL],
    subject: `🚨 [GLA] Possible press signup: ${email}`,
    html: `<body style="font-family:'Courier New',monospace;background:#050a0e;padding:24px;">
<p style="color:#ff6b35;font-size:12px;letter-spacing:0.16em;margin:0 0 14px;">// PRESS_DETECTION_ALERT</p>
<p style="color:#e4f2ff;font-size:14px;margin:0 0 16px;">A signup from a possible press or media domain was detected.</p>
<table style="border:1px solid #ff6b35;background:#0a1420;width:100%;max-width:480px;border-collapse:collapse;">
  <tr>
    <td style="padding:8px 14px;font-size:11px;color:#3e5870;border-bottom:1px solid #162636;width:35%;">EMAIL</td>
    <td style="padding:8px 14px;font-size:11px;color:#ff6b35;border-bottom:1px solid #162636;">${email}</td>
  </tr>
  <tr>
    <td style="padding:8px 14px;font-size:11px;color:#3e5870;border-bottom:1px solid #162636;">TIMESTAMP</td>
    <td style="padding:8px 14px;font-size:11px;color:#b8cdd8;border-bottom:1px solid #162636;">${ts}</td>
  </tr>
  <tr>
    <td style="padding:8px 14px;font-size:11px;color:#3e5870;">ACTION</td>
    <td style="padding:8px 14px;font-size:11px;color:#b8cdd8;">
      Follow up via <a href="mailto:hello@lieanalyzer.com" style="color:#00c8ff;">hello@lieanalyzer.com</a></td>
  </tr>
</table>
</body>`,
  } : null;

  // ── Send all ──────────────────────────────────────────────────────────────
  try {
    await Promise.all([
      sendEmail(RESEND_API_KEY, userEmail),
      sendEmail(RESEND_API_KEY, opsAlert),
      ...(pressPayload ? [sendEmail(RESEND_API_KEY, pressPayload)] : []),
    ]);
    console.log(`[waitlist-confirm] OK — ${email} | press=${pressAlert}`);
    return new Response(JSON.stringify({ ok: true, press: pressAlert }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[waitlist-confirm] Resend failed:", err);
    // Return 200 so Netlify doesn't disable webhook — error is logged
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config: Config = {
  path: "/api/waitlist-confirm",
};
