"use client";
import { useEffect, useState } from "react";

type PageInfo = { status: string; latestVersion: number; activeVersion: number | null; revisionCount: number; revisionsAllowed: number; expiresAt?: string; slug: string; screenshotAvailable: boolean };

export function PreviewEditor({ pageId }: { pageId: string }) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [page, setPage] = useState<PageInfo | null>(null);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [publicUrl, setPublicUrl] = useState("");

  async function refresh() {
    const response = await fetch(`/api/pages/${pageId}/preview-url`, { cache: "no-store" });
    if (!response.ok) throw new Error("Preview unavailable. This browser may no longer own the page.");
    const data = await response.json();
    setPreviewUrl(data.previewUrl); setPage(data.page);
  }
  useEffect(() => { refresh().catch((error) => setMessage(error.message)); }, [pageId]);

  async function action(kind: "revise" | "publish" | "unpublish") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/pages/${pageId}/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kind === "revise" ? { instruction } : {}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Please try again.");
      if (kind === "revise") { window.location.assign(`/create?jobId=${data.jobId}`); return; }
      if (kind === "publish") { setPublicUrl(data.publicUrl); setMessage("Your page is live!"); }
      if (kind === "unpublish") { setPublicUrl(""); setMessage("Your page is unpublished."); }
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(false); }
  }
  const link = publicUrl || (page?.status === "published" ? `${windowOrigin()}/p/${page.slug}` : "");
  async function share() {
    if (!link) return;
    if (navigator.share) { try { await navigator.share({ title: "A note for you", url: link }); return; } catch { /* copy instead */ } }
    await navigator.clipboard.writeText(link); setMessage("Link copied.");
  }
  return <div className="preview-layout"><div><iframe title="Safe preview of your generated page" className="preview-frame" sandbox="" src={previewUrl || undefined} /><p className="muted" style={{ fontSize: 12 }}>This preview is isolated. Generated scripts and forms cannot run.</p></div><aside className="side-stack">{page?.screenshotAvailable && <div className="panel"><h3>Design snapshot</h3><img src={`/api/pages/${pageId}/screenshot`} alt="Generated page snapshot" style={{ width: "100%", borderRadius: 10 }} /></div>}<div className="panel"><h3>Make it yours</h3><p>{page && page.revisionCount >= page.revisionsAllowed ? "This page has used its revisions." : "Need a small change? Revise it as much as you like while we're in beta."}</p><div className="revision"><textarea aria-label="Revision instruction" placeholder="Make it warmer, use purple, or change the closing line..." minLength={10} maxLength={500} value={instruction} onChange={(event) => setInstruction(event.target.value)} /></div><button className="secondary" style={{ marginTop: 10 }} disabled={busy || !page || page.revisionCount >= page.revisionsAllowed || instruction.length < 10} onClick={() => action("revise")}>Revise page</button></div><div className="panel"><h3>Ready to share?</h3><p>Publishing creates a link that works on another device. It expires after seven days.</p><button className="primary" disabled={busy || !page} onClick={() => action("publish")}>{page?.status === "published" ? "Publish latest version" : "Publish page"}</button>{link && <><span className="share-url">{link}</span><div className="actions"><button className="secondary" onClick={share}>Copy or share</button><button className="secondary" disabled={busy} onClick={() => action("unpublish")}>Unpublish</button></div>{page?.expiresAt && <p>Expires {new Date(page.expiresAt).toLocaleDateString()}.</p>}</>}{message && <p role="status">{message}</p>}</div></aside></div>;
}

function windowOrigin(): string {
  if (typeof window === "undefined") return "";
  return process.env.NEXT_PUBLIC_PAGE_ORIGIN || window.location.origin;
}
