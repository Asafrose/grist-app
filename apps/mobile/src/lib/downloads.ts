import { File } from "expo-file-system";
import { create } from "zustand";
import { auth } from "@/lib/auth";
import { DEMO_MEDIA_URL, isDemoToken } from "@/lib/demo";
import { makeClient } from "@/lib/grain";
import { settings } from "@/lib/settings";
import { downloadsDirectory } from "@/lib/storage";

export type DownloadStatus = "idle" | "downloading" | "done" | "error";

export type DownloadEntry = {
  status: DownloadStatus;
  progress: number;
  uri: string | null;
  bytes: number;
  error: string | null;
};

type DownloadsState = { byId: Record<string, DownloadEntry>; version: number };

export const IDLE_DOWNLOAD: DownloadEntry = {
  status: "idle",
  progress: 0,
  uri: null,
  bytes: 0,
  error: null,
};

export const CAP_EXCEEDED = "Over the download cap set in Settings";

export const downloadsStore = create<DownloadsState>(() => ({ byId: {}, version: 0 }));

export const useDownload = (id: string): DownloadEntry =>
  downloadsStore((s) => s.byId[id] ?? IDLE_DOWNLOAD);
export const useDownloadsVersion = () => downloadsStore((s) => s.version);

const inflight = new Map<string, AbortController>();

function set(id: string, entry: DownloadEntry, bumpVersion = false) {
  downloadsStore.setState((s) => ({
    byId: { ...s.byId, [id]: entry },
    version: bumpVersion ? s.version + 1 : s.version,
  }));
}

function forget(id: string) {
  downloadsStore.setState((s) => {
    const { [id]: _dropped, ...rest } = s.byId;
    return { byId: rest, version: s.version + 1 };
  });
}

export function extensionFor(mediaType: string): string {
  return mediaType === "audio" ? "m4a" : "mp4";
}

function fileFor(id: string, mediaType: string): File {
  return new File(downloadsDirectory(), `${id}.${extensionFor(mediaType)}`);
}

function idOf(file: File): string {
  const name = file.uri.split("/").pop() ?? "";
  return name.replace(/\.[^.]+$/, "");
}

function listFiles(): File[] {
  const dir = downloadsDirectory();
  return dir.exists ? dir.list().filter((e): e is File => e instanceof File) : [];
}

function usedBytes(exceptId: string): number {
  return listFiles().reduce((n, f) => (idOf(f) === exceptId ? n : n + (f.size ?? 0)), 0);
}

function safeDelete(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {
    // a cancelled task can still hold the partial file; the next start overwrites it
  }
}

async function mediaUrl(id: string): Promise<string> {
  const token = auth.token();
  if (!token) throw new Error("Not signed in");
  return isDemoToken(token) ? DEMO_MEDIA_URL : makeClient(token).recordings.resolveMediaUrl(id);
}

async function start(id: string, mediaType = "video"): Promise<void> {
  const current = downloadsStore.getState().byId[id];
  if (current?.status === "downloading" || current?.status === "done") return;
  if (isDemoToken(auth.token())) {
    set(id, { status: "done", progress: 1, uri: DEMO_MEDIA_URL, bytes: 0, error: null }, true);
    return;
  }
  const controller = new AbortController();
  inflight.set(id, controller);
  set(id, { ...IDLE_DOWNLOAD, status: "downloading" });
  const dest = fileFor(id, mediaType);
  const cap = settings.get().downloadCapBytes;
  const used = usedBytes(id);
  let capHit = false;
  try {
    const url = await mediaUrl(id);
    if (controller.signal.aborted) return;
    downloadsDirectory().create({ intermediates: true, idempotent: true });
    const file = await File.downloadFileAsync(url, dest, {
      idempotent: true,
      signal: controller.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        if (controller.signal.aborted) return;
        if (used + Math.max(bytesWritten, totalBytes) > cap) {
          capHit = true;
          controller.abort();
          return;
        }
        const progress = totalBytes > 0 ? Math.min(1, bytesWritten / totalBytes) : 0;
        set(id, { status: "downloading", progress, uri: null, bytes: bytesWritten, error: null });
      },
    });
    if (controller.signal.aborted) return;
    set(
      id,
      { status: "done", progress: 1, uri: file.uri, bytes: file.size ?? 0, error: null },
      true,
    );
  } catch (e) {
    safeDelete(dest);
    if (capHit) {
      set(id, { ...IDLE_DOWNLOAD, status: "error", error: CAP_EXCEEDED });
    } else if (!controller.signal.aborted) {
      set(id, {
        ...IDLE_DOWNLOAD,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  } finally {
    if (inflight.get(id) === controller) inflight.delete(id);
  }
}

function cancel(id: string): void {
  const controller = inflight.get(id);
  if (!controller) return;
  inflight.delete(id);
  controller.abort();
  forget(id);
}

function remove(id: string): void {
  cancel(id);
  for (const f of listFiles()) if (idOf(f) === id) safeDelete(f);
  forget(id);
}

function localUri(id: string): string | null {
  const entry = downloadsStore.getState().byId[id];
  return entry?.status === "done" ? entry.uri : null;
}

function clear(): void {
  for (const id of Array.from(inflight.keys())) cancel(id);
  try {
    const dir = downloadsDirectory();
    if (dir.exists) dir.delete();
  } catch {
    // a task in flight can hold a file open; the next clear handles it
  }
  downloadsStore.setState((s) => ({ byId: {}, version: s.version + 1 }));
}

export function hydrateDownloads(): void {
  const byId: Record<string, DownloadEntry> = {};
  try {
    for (const f of listFiles()) {
      byId[idOf(f)] = { status: "done", progress: 1, uri: f.uri, bytes: f.size ?? 0, error: null };
    }
  } catch {
    // no downloads directory yet
  }
  downloadsStore.setState((s) => ({ byId, version: s.version + 1 }));
}

hydrateDownloads();

export const downloads = { start, cancel, remove, localUri, clear, hydrate: hydrateDownloads };
