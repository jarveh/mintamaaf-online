import { Header } from "@/components/header";
import { Progress } from "@/components/progress";

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ jobId?: string }> }) {
  const { jobId } = await searchParams;
  return <div className="interior"><Header /><main className="shell interior-main"><span className="eyebrow">Your page is taking shape</span><h1>Good things take a moment.</h1><p className="muted">You can keep this tab open, or return to this URL to check progress.</p>{jobId ? <Progress jobId={jobId} /> : <p>Start on the home page to create your note.</p>}</main></div>;
}
