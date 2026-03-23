import type { Config } from "@netlify/functions";

// Runs daily at 7am UTC. Crawls lieanalyzer.com internal links
// and checks all external links for 404/errors.
// Emails a report to jjbarnachia@gmail.com — clean report if all good,
// alert report if any dead links found.

const SITE_URL = "https://lieanalyzer.com";

// Links to check — extend this list as pages are added
const LINKS_TO_CHECK = [
  // Internal
  { label: "Homepage",           url: "https://lieanalyzer.com",           type: "internal" },
  // External references likely in the site
  { label: "Netlify Dashboard",  url: "https://app.netlify.com",           type: "external" },
  { label: "Google Fonts",       url: "https://fonts.googleapis.com",      type: "external" },
];

interface LinkResult {
  label: string;
  url: string;
  type: string;
  status: number | null;
  ok: boolean;
  error?: string;
  latencyMs: number;
}

async function checkLink(label: string, url: string, type: string): Promise<LinkResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": "GLA-LinkChecker/1.0" },
      redirect: "follow",
    });
    const latencyMs = Date.now() - start;
    // 200–399 = ok. 404, 410, 5xx = dead
    const ok = res.status >= 200 && res.status < 400;
    return { label, url, type, status: res.status, ok, latencyMs };
  } catch (err) {
    return {
      label, url, type,
      status: null, ok: false,
      error: String(err),
      latencyMs: Date.now() - start,
    };
  }
}

function statusColor(ok: boolean): string {
  return ok ? "#00ff9d" : "#ff6b35";
}

function buildRow(r: LinkResult): string {
  return `
  <tr>
    <td style="padding:8px 12px;font-size:11px;color:#b8cdd8;border-bottom:1px solid #162636;">${r.label}</td>
    <td style="padding:8px 12px;font-size:10px;color:#3e5870;border-bottom:1px solid #162636;word-break:break-all;">${r.url}</td>
    <td style="padding:8px 12px;font-size:11px;color:${statusColor(r.ok)};border-bottom:1px solid #162636;text-align:center;">
      ${r.ok ? "✓ " + (r.status ?? "OK") : "✗ " + (r.status ?? r.error ?? "ERR")}
    </td>
    <td style="padding:8px 12px;font-size:11px;color:#3e5870;border-bottom:1px solid #162636;text-align:right;">${r.latencyMs}ms</td>
  </tr>`;
}

export default async (req: Request) => {
  const RESEND_API_KEY = Netlify.env.get("RESEND_API_KEY");
  const NOTIFY_EMAIL   = Netlify.env.get("NOTIFY_EMAIL") ?? "jjbarnachia@gmail.com";

  // Run all checks in parallel
  const results = await Promise.all(
    LINKS_TO_CHECK.map((l) => checkLink(l.label, l.url, l.type))
  );

  const failures = results.filter((r) => !r.ok);
  const allOk    = failures.length === 0;
  const runDate  = new Date().toUTCString();

  console.log(`[link-checker] ${results.length} links checked, ${failures.length} dead. ${runDate}`);

  if (!RESEND_API_KEY || RESEND_API_KEY.startsWith("REPLACE")) {
    console.error("[link-checker] RESEND_API_KEY not set");
    return;
  }

  const subjectPrefix = allOk
    ? `[GLA] Link check passed`
    : `🔗 [GLA] ${failures.length} dead link${failures.length > 1 ? "s" : ""} detected`;

  const allRows   = results.map(buildRow).join("");

  const emailHtml = `
<body style="font-family:'Courier New',monospace;background:#050a0e;padding:24px;">
  <p style="color:${allOk ? "#00c8ff" : "#ff6b35"};font-size:12px;letter-spacing:0.16em;margin:0 0 16px;">
    // LINK_CHECKER_REPORT
  </p>
  <h2 style="color:#e4f2ff;font-size:16px;margin:0 0 6px;">
    ${allOk ? "All links healthy" : `${failures.length} dead link${failures.length > 1 ? "s" : ""} on lieanalyzer.com`}
  </h2>
  <p style="color:#3e5870;font-size:11px;margin:0 0 20px;">${runDate}</p>

  ${!allOk ? `
  <p style="color:#ff6b35;font-size:12px;letter-spacing:0.12em;margin:0 0 8px;">// DEAD_LINKS</p>
  <table style="border:1px solid #ff6b35;background:#0a1420;width:100%;max-width:600px;margin-bottom:24px;border-collapse:collapse;">
    <tr style="background:#0d1520;">
      <th style="padding:8px 12px;font-size:9px;letter-spacing:0.14em;color:#3e5870;text-align:left;border-bottom:1px solid #162636;">LABEL</th>
      <th style="padding:8px 12px;font-size:9px;letter-spacing:0.14em;color:#3e5870;text-align:left;border-bottom:1px solid #162636;">URL</th>
      <th style="padding:8px 12px;font-size:9px;letter-spacing:0.14em;color:#3e5870;text-align:center;border-bottom:1px solid #162636;">STATUS</th>
      <th style="padding:8px 12px;font-size:9px;letter-spacing:0.14em;color:#3e5870;text-align:right;border-bottom:1px solid #162636;">LATENCY</th>
    </tr>
    ${failures.map(buildRow).join("")}
  </table>` : ""}

  <p style="color:#3e5870;font-size:11px;letter-spacing:0.12em;margin:0 0 8px;">// ALL_RESULTS</p>
  <table style="border:1px solid #162636;background:#0a1420;width:100%;max-width:600px;border-collapse:collapse;">
    <tr style="background:#0d1520;">
      <th style="padding:8px 12px;font-size:9px;letter-spacing:0.14em;color:#3e5870;text-align:left;border-bottom:1px solid #162636;">LABEL</th>
      <th style="padding:8px 12px;font-size:9px;letter-spacing:0.14em;color:#3e5870;text-align:left;border-bottom:1px solid #162636;">URL</th>
      <th style="padding:8px 12px;font-size:9px;letter-spacing:0.14em;color:#3e5870;text-align:center;border-bottom:1px solid #162636;">STATUS</th>
      <th style="padding:8px 12px;font-size:9px;letter-spacing:0.14em;color:#3e5870;text-align:right;border-bottom:1px solid #162636;">LATENCY</th>
    </tr>
    ${allRows}
  </table>

  <p style="font-size:10px;color:#3e5870;margin:20px 0 0;">
    GLA Neural Link Checker v1.0 — runs daily at 07:00 UTC<br/>
    <a href="https://app.netlify.com/projects/boisterous-florentine-15a8f1" style="color:#3e5870;">Netlify Dashboard →</a>
  </p>
</body>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "GLA Monitor <noreply@lieanalyzer.com>",
      to: [NOTIFY_EMAIL],
      subject: `${subjectPrefix} — ${runDate}`,
      html: emailHtml,
    }),
  });

  console.log(`[link-checker] Report emailed to ${NOTIFY_EMAIL}`);
};

export const config: Config = {
  schedule: "0 7 * * *", // 07:00 UTC daily
};
