"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const examples = [
  "I forgot our anniversary. Make a warm, playful page for Sarah with flowers and a sincere apology.",
  "I snapped at my best friend. Make a funny but genuine note that says I value our friendship.",
  "I missed a family dinner. Create a simple, heartfelt page in Bahasa Melayu to say I'm sorry.",
];

export function GenerateForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [senderName, setSenderName] = useState("");
  const [tone, setTone] = useState("heartfelt");
  const [language, setLanguage] = useState("en");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setMessage(""); setBusy(true);
    try {
      const response = await fetch("/api/generations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, recipientName, senderName, tone, language, idempotencyKey: crypto.randomUUID() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Please try again later.");
      router.push(`/create?jobId=${result.jobId}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again later."); setBusy(false); }
  }

  return <><form id="create" className="prompt-card" onSubmit={submit}><textarea aria-label="Your apology idea" placeholder="Tell us what happened and what you'd like to say..." value={prompt} onChange={(event) => setPrompt(event.target.value)} minLength={20} maxLength={1200} required /><div className="form-grid"><div className="field"><label htmlFor="recipient">To (optional)</label><input id="recipient" placeholder="Their name" maxLength={80} value={recipientName} onChange={(event) => setRecipientName(event.target.value)} /></div><div className="field"><label htmlFor="sender">From (optional)</label><input id="sender" placeholder="Your name" maxLength={80} value={senderName} onChange={(event) => setSenderName(event.target.value)} /></div><div className="field"><label htmlFor="tone">Tone</label><select id="tone" value={tone} onChange={(event) => setTone(event.target.value)}><option value="heartfelt">Heartfelt</option><option value="cute">Cute</option><option value="funny">Funny</option><option value="minimalist">Minimalist</option></select></div><div className="field"><label htmlFor="language">Language</label><select id="language" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="en">English</option><option value="ms">Bahasa Melayu</option></select></div></div><div className="form-bottom"><span className="form-hint">One free creation per day · links last 7 days</span><button className="primary" disabled={busy}>{busy ? "Starting…" : "Create my page →"}</button></div>{message && <div className="error" role="alert">{message}</div>}</form><div id="examples" className="example-row" style={{ justifyContent: "center" }}>{examples.map((example, index) => <button key={index} className="example" type="button" onClick={() => { setPrompt(example); document.getElementById("create")?.scrollIntoView({ behavior: "smooth" }); }}>{["Forgot a special day", "A friendship apology", "Family note in Malay"][index]}</button>)}</div></>;
}
