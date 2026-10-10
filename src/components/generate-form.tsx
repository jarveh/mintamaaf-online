"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const examples = [
  "I forgot our anniversary. Make a warm, playful page for Sarah with flowers and a sincere apology.",
  "I snapped at my best friend. Make a funny but genuine note that says I value our friendship.",
  "Aku terlepas janji jumpa kawan. Buat satu page maaf yang ikhlas dan comel dalam Bahasa Melayu.",
];

const exampleLabels = ["Forgot a special day", "A friendship apology", "Family note in Malay"];

const MAX_IMAGE_BYTES = 5_000_000;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function GenerateForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function pickImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) { setMessage("Images are limited to 5 MB."); return; }
    if (!IMAGE_TYPES.includes(file.type)) { setMessage("Attach a PNG, JPG, or WebP image."); return; }
    setMessage("");
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
  }
  function clearImage() {
    setImage(null);
    setImagePreview("");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setMessage(""); setBusy(true);
    try {
      const form = new FormData();
      form.set("prompt", prompt);
      form.set("idempotencyKey", crypto.randomUUID());
      if (image) form.set("attachment", image);
      const response = await fetch("/api/generations", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Please try again later.");
      router.push(`/create?jobId=${result.jobId}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again later."); setBusy(false); }
  }

  return (
    <>
      <form id="create" className="prompt-card" onSubmit={submit}>
        <textarea aria-label="Your apology idea" placeholder="Tell us what happened and what you'd like to say — names, the story, the feeling, any style you have in mind..." value={prompt} onChange={(event) => setPrompt(event.target.value)} minLength={20} maxLength={1200} required />
        <div className="attach-row">
          <input ref={fileInput} id="attachment" type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickImage} />
          {image ? (
            <span className="attach-chip">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="" width={30} height={30} />
              <span>{image.name.length > 26 ? `${image.name.slice(0, 26)}…` : image.name}</span>
              <button type="button" aria-label="Remove attached image" onClick={clearImage}>×</button>
            </span>
          ) : (
            <button type="button" className="attach-button" onClick={() => fileInput.current?.click()}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.4" /><circle cx="5.6" cy="6.4" r="1.3" fill="currentColor" /><path d="M2 12l3.4-3.2a1.4 1.4 0 0 1 1.9 0L11 12.4M9.5 11l1.8-1.7a1.4 1.4 0 0 1 1.9 0l1.3 1.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Attach an image
            </button>
          )}
          <span className="attach-hint">optional — inspires the design, never required</span>
        </div>
        <div className="form-bottom">
          <span className="form-hint">Unlimited creations while in beta · links last 7 days</span>
          <button className="primary" disabled={busy}>{busy ? "Starting…" : "Create my page →"}</button>
        </div>
        {message && <div className="error" role="alert">{message}</div>}
      </form>
      <div id="examples" className="example-row" style={{ justifyContent: "center" }}>
        {examples.map((example, index) => <button key={index} className="example" type="button" onClick={() => { setPrompt(example); document.getElementById("create")?.scrollIntoView({ behavior: "smooth" }); }}>{exampleLabels[index]}</button>)}
      </div>
    </>
  );
}
