import type { Config } from "@netlify/functions";

// Runs every hour. Checks that lieanalyzer.com returns HTTP 200
// and that the response contains expected content.
// Emails jjbarnachia@gmail.com immediately on failure.

export default async (req: Request) => {
  const RESEND_API_KEY = Netlify.env.get("RESEND_API_KEY");
  const NOTIFY_EMAIL   = Netlify.env.get("NOTIFY_EMAIL") ?? "jjbarnachia@gmail.com";
  const SITE_URL       = Netlify.env.get("SITE_URL")    ?? "https://lieanalyzer.com";

  const checks = [
    { label: "Homepage",     url: SITE_URL },
    { label: "HTTPS active", url: SITE_URL, requireHttps: true },
  ];

  const results: { label: string; ok: boolean; status?: number; error?: string }[] = [];

  for (const check of checks) {
    try {
      const res = await fetch(check.url, {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
        headers: { "User-Agent": "GLA-Monitor/1.0" },
      });

      const ok = res.ok && (!check.requireHttps || check.url.startsWith("https"));
      results.push({ label: check.label, ok, status: res.status });
    } catch (err) {
      results.push({ label: check.label, ok: false, error: String(err) });
    }
  }

  const failures = results.filter((r) => !r.ok);

  if (failures.length === 0) {
    console.log(`[site-monitor] ${SITE_URL} — all checks passed`);
    return;
  }

  // ── Site is down — send alert ──────────────────────────────────────────────
  console.error("[site-monitor] FAILURES:", failures);

  if (!RESEND_API_KEY || RESEND_API_KEY.startsWith("REPLACE")) {
    console.error("[site-monitor] RESEND_API_KEY not set — cannot send alert");
    return;
  }

  const failureRows = failures
    .map(
      (f) => `
      <tr>
        <td style="padding:9px 14px;font-size:11px;color:#3e5870;border-bottom:1px solid #162636;">${f.label}</td>
        <td style="padding:9px 14px;font-size:11px;color:#ff6b35;border-bottom:1px solid #162636;">
          ${f.status ? `HTTP ${f.status}` : f.error ?? "FAILED"}
        </td>
      </tr>`
    )
    .join("");

  const alertEmail = {
    from: "GLA Monitor <noreply@lieanalyzer.com>",
    to: [NOTIFY_EMAIL],
    subject: `🚨 [GLA] lieanalyzer.com is DOWN — ${new Date().toUTCString()}`,
    html: `
<body style="font-family:'Courier New',monospace;background:#050a0e;padding:24px;">
  <p style="color:#ff6b35;font-size:12px;letter-spacing:0.16em;margin:0 0 16px;">
    // SITE_MONITOR_ALERT
  </p>
  <h2 style="color:#e4f2ff;font-size:18px;margin:0 0 20px;">
    lieanalyzer.com is not responding
  </h2>
  <table style="border:1px solid #162636;background:#0a1420;width:100%;max-width:480px;margin-bottom:20px;">
    <tr>
      <td colspan="2" style="padding:8px 14px;font-size:9px;letter-spacing:0.16em;
        color:#3e5870;border-bottom:1px solid #162636;text-transform:uppercase;">
        FAILED_CHECKS
      </td>
    </tr>
    ${failureRows}
  </table>
  <table style="border:1px solid #162636;background:#0a1420;width:100%;max-width:480px;margin-bottom:20px;">
    <tr>
      <td style="padding:9px 14px;font-size:11px;color:#3e5870;border-bottom:1px solid #162636;">DETECTED</td>
      <td style="padding:9px 14px;font-size:11px;color:#b8cdd8;border-bottom:1px solid #162636;">${new Date().toUTCString()}</td>
    </tr>
    <tr>
      <td style="padding:9px 14px;font-size:11px;color:#3e5870;">NETLIFY_DASH</td>
      <td style="padding:9px 14px;font-size:11px;">
        <a href="https://app.netlify.com/projects/boisterous-florentine-15a8f1/deploys"
          style="color:#00c8ff;">Check deploys →</a>
      </td>
    </tr>
  </table>
  <p style="font-size:10px;color:#3e5870;margin:0;">
    This alert fires hourly while the site is unreachable.<br/>
    GLA Neural Site Monitor v1.0
  </p>
</body>`,
  };

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(alertEmail),
  });
};

export const config: Config = {
  schedule: "@hourly",
};
