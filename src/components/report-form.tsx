"use client";
import { useState } from "react";
export function ReportForm() {
  const [url, setUrl] = useState(""); const [reason, setReason] = useState("phishing"); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const parsed = new URL(url); const slug = parsed.pathname.match(/^\/p\/([A-Za-z0-9_-]{16})$/)?.[1];
      if (!slug) throw new Error("Enter a valid published page URL.");
      const response = await fetch(`/api/pages/${slug}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
      if (!response.ok) throw new Error("Report could not be sent. Please try later.");
      setMessage("Thank you. Your report has been recorded.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(false); }
  }
  return <form className="panel" onSubmit={submit}><div className="field"><label htmlFor="report-url">Page link</label><input id="report-url" type="url" required placeholder="https://pages.mintamaaf.online/p/..." value={url} onChange={(event) => setUrl(event.target.value)} /></div><div className="field" style={{ marginTop: 16 }}><label htmlFor="report-reason">Reason</label><select id="report-reason" value={reason} onChange={(event) => setReason(event.target.value)}><option value="phishing">Phishing or credential request</option><option value="harassment">Harassment or threats</option><option value="impersonation">Impersonation</option><option value="other">Other harm</option></select></div><button className="primary" style={{ marginTop: 20 }} disabled={busy}>Send report</button>{message && <p role="status">{message}</p>}</form>;
}
