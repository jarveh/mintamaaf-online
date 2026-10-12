export type Tone = "heartfelt" | "cute" | "funny" | "minimalist";
export type Language = "en" | "ms";
export type PageStatus = "draft" | "published" | "unpublished" | "blocked";
export type JobStatus = "queued" | "running" | "succeeded" | "failed";
/** Guided: the app art-directs a one-page note. Freestyle: the creator's prompt is the design brief. */
export type GenerationMode = "guided" | "freestyle";

export interface PageRecord {
  id: string;
  slug: string;
  ownerHash: string;
  prompt: string;
  mode: GenerationMode;
  /** Legacy optional fields from the earlier To/From/Tone/Language form. */
  recipientName?: string;
  senderName?: string;
  tone?: Tone;
  language?: Language;
  /** Optional reference image the creator attached; uploaded to Stitch as design input. */
  attachmentPath?: string;
  attachmentMime?: string;
  status: PageStatus;
  latestVersion: number;
  activeVersion: number | null;
  revisionCount: number;
  createdAt: string;
  publishedAt?: string;
  expiresAt?: string;
}

export interface VersionRecord {
  pageId: string;
  version: number;
  htmlPath: string;
  screenshotPath?: string;
  provider: string;
  projectId?: string;
  screenId?: string;
  createdAt: string;
}

export interface JobRecord {
  id: string;
  pageId: string;
  kind: "create" | "revise";
  status: JobStatus;
  progressLabel: string;
  instruction?: string;
  errorCode?: string;
  attempts?: number;
  createdAt: string;
  finishedAt?: string;
}

export interface DesignResult {
  provider: string;
  projectId?: string;
  screenId?: string;
  html: string;
  screenshot?: Uint8Array;
}

export interface DesignGenerator {
  generate(input: { prompt: string; imagePath?: string; mode?: GenerationMode }): Promise<DesignResult>;
  revise(input: { projectId?: string; screenId?: string; prompt: string; instruction: string; imagePath?: string; mode?: GenerationMode }): Promise<DesignResult>;
}
