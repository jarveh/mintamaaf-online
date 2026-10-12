import type { Metadata } from "next";
import { Header } from "@/components/header";
import { PreviewEditor } from "@/components/preview-editor";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div className="interior"><Header /><main className="shell interior-main"><span className="eyebrow">Your creation</span><h1>A little note, made with care.</h1><p className="muted">Take a look, make one change if you like, then publish when it feels right.</p><PreviewEditor pageId={id} /></main></div>;
}
