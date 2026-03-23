import type { Config } from "@netlify/functions";

// Runs daily at 08:00 UTC. Fetches waitlist submissions from Netlify Forms API
// and emails a digest to jjbarnachia@gmail.com.
// Shows: total count, new signups in last 24h, latest 10 emails.

export default async (req: Request) => {
  const RESEND_API_KEY    = Netlify.env.get("RESEND_API_KEY");
  const NOTIFY_EMAIL      = Netlify.env.get("NOTIFY_EMAIL")   ?? "jjbarnachia@gmail.com";
  const NETLIFY_API_TOKEN = Netlify.env.get("NETLIFY_API_TOKEN");
  const FORM_ID           = Netlify.env.get("WAITLIST_FORM_ID");

  if (!RESEND_API_KEY || RESEND_API_KEY.startsWith("REPLACE")) {
    console.error("[waitlist-digest] RESEND_API_KEY not configured");
    return;
  }

  if (!NETLIFY_API_TOKEN || !FORM_ID) {
    console.warn("[waitlist-digest] NETLIFY_API_TOKEN or WAITLIST_FORM_ID not set — skipping form fetch");
    // Still send a reminder email to set these up
    await sendDigest(RESEND_API_KEY, NOTIFY_EMAIL, [], 0, 0);
    return;
  }

  // Fetch all submissions from Netlify Forms API
  let submissions: any[] = [];
  try {
    const res = await fetch(
      `https://api.netlify.com/api/v1/forms/${FORM_ID}/submissions?per_page=100`,
      {
        headers: {
          "Authorization": `Bearer ${NETLIFY_API_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (res.ok) {
      submissions = await res.json();
    } else {
      console.error("[waitlist-digest] Netlify API error:", res.status);
    }
  } catch (err) {
    console.error("[waitlist-digest] Fetch error:", err);
  }

  const total = submissions.length;
  const oneDayAgo = Date.now() - 86_400_000;
  const recent = submissions.filter(
    (s) => new Date(s.created_at).getTime() > oneDayAgo
  );

  await sendDigest(RESEND_API_KEY, NOTIFY_EMAIL, submissions.slice(0, 10), total, recent.length);
};

async function sendDigest(
  apiKey: string,
  to: string,
  latest: any[],
  total: number,
  newToday: number
) {
  const runDate = new Date().toUTCString();

  const latestRows = latest.length > 0
    ? latest.map((s, i) => `
      <tr>
        <td style="padding:8px 12px;font-size:11px;color:#3e5870;border-bottom:1px solid #162636;">${i + 1}</td>
        <td style="padding:8px 12px;font-size:11px;color:#00c8ff;border-bottom:1px solid #162636;">
          ${s?.data?.email ?? s?.email ?? "—"}
        </td>
        <td style="padding:8px 12px;font-size:10px;color:#3e5870;border-bottom:1px solid #162636;">
          ${s?.created_at ? new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
        </td>
      </tr>`).join("")
    : `<tr><td colspan="3" style="padding:14px 12px;font-size:11px;color:#3e5870;text-align:center;">
        No submissions yet — share the link!
      </td></tr>`;

  const html = `
<body style="font-family:'Courier New',monospace;background:#050a0e;padding:24px;">
  <p style="color:#00c8ff;font-size:12px;letter-spacing:0.16em;margin:0 0 16px;">// WAITLIST_DIGEST</p>
  <h2 style="color:#e4f2ff;font-size:18px;margin:0 0 6px;">GLA Beta Waitlist — Daily Report</h2>
  <p style="color:#3e5870;font-size:11px;margin:0 0 24px;">${runDate}</p>

  <table style="border:1px solid #162636;background:#0a1420;width:100%;max-width:480px;
    margin-bottom:24px;border-collapse:collapse;">
    <tr>
      <td style="padding:9px 14px;font-size:11px;color:#3e5870;border-bottom:1px solid #162636;width:50%;">TOTAL SIGNUPS</td>
      <td style="padding:9px 14px;font-size:18px;font-weight:700;color:#00c8ff;border-bottom:1px solid #162636;">${total}</td>
    </tr>
    <tr>
      <td style="padding:9px 14px;font-size:11px;color:#3e5870;border-bottom:1px solid #162636;">NEW LAST 24H</td>
      <td style="padding:9px 14px;font-size:18px;font-weight:700;color:${newToday > 0 ? "#00ff9d" : "#3e5870"};border-bottom:1px solid #162636;">
        ${newToday > 0 ? "+" : ""}${newToday}
      </td>
    </tr>
    <tr>
      <td style="padding:9px 14px;font-size:11px;color:#3e5870;">CAPACITY REMAINING</td>
      <td style="padding:9px 14px;font-size:11px;color:#b8cdd8;">${Math.max(0, 500 - total)} of 500</td>
    </tr>
  </table>

  <p style="color:#3e5870;font-size:11px;letter-spacing:0.12em;margin:0 0 8px;">// LATEST_SIGNUPS</p>
  <table style="border:1px solid #162636;background:#0a1420;width:100%;max-width:480px;border-collapse:collapse;">
    <tr style="background:#0d1520;">
      <th style="padding:8px 12px;font-size:9px;letter-spacing:0.14em;color:#3e5870;text-align:left;border-bottom:1px solid #162636;">#</th>
      <th style="padding:8px 12px;font-size:9px;letter-spacing:0.14em;color:#3e5870;text-align:left;border-bottom:1px solid #162636;">EMAIL</th>
      <th style="padding:8px 12px;font-size:9px;letter-spacing:0.14em;color:#3e5870;text-align:left;border-bottom:1px solid #162636;">SIGNED UP</th>
    </tr>
    ${latestRows}
  </table>

  <p style="margin:20px 0 0;">
    <a href="https://app.netlify.com/projects/boisterous-florentine-15a8f1/forms"
      style="color:#00c8ff;font-size:11px;">View all submissions in Netlify →</a>
  </p>
  <p style="font-size:10px;color:#3e5870;margin:8px 0 0;">
    GLA Neural Waitlist Digest v1.0 — runs daily at 08:00 UTC
  </p>
</body>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "GLA Waitlist <noreply@lieanalyzer.com>",
      to: [to],
      subject: `[GLA] Waitlist digest — ${total} total, +${newToday} today`,
      html,
    }),
  });

  console.log(`[waitlist-digest] Digest sent. Total: ${total}, New: ${newToday}`);
}

export const config: Config = {
  schedule: "0 8 * * *", // 08:00 UTC daily
};
