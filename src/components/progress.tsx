"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function Progress({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [label, setLabel] = useState("Finding your page…");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let delay = 2000;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`/api/generations/${jobId}`, { cache: "no-store" });
        const job = await response.json();
        if (!active) return;
        if (!response.ok) throw new Error(job.error || "Could not find this job.");
        setLabel(job.progressLabel);
        if (job.status === "succeeded") { router.replace(job.previewUrl); return; }
        if (job.status === "failed") { setError(job.errorCode === "UNSAFE_OUTPUT" ? "The generated design did not pass our safety checks." : "Generation failed. Please try again later."); return; }
        delay = Math.min(delay + 500, 5000);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Could not check progress."); return; }
      timer = setTimeout(poll, delay);
    }
    poll();
    return () => { active = false; clearTimeout(timer); };
  }, [jobId, router]);
  return <div className="panel status" aria-live="polite">{!error && <span className="spinner" />}<div><h2 style={{ margin: "0 0 5px", fontFamily: "Georgia,serif", fontSize: 26 }}>{error ? "We couldn't finish this page" : "Making something thoughtful"}</h2><p className="muted" style={{ margin: 0 }}>{error || label}</p>{error && <Link className="secondary" style={{ display: "inline-block", marginTop: 15 }} href="/">Back to start</Link>}</div></div>;
}
