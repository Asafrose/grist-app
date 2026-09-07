import { Directory, File, Paths } from "expo-file-system";
import { getThumbnailAsync } from "expo-video-thumbnails";
import { useEffect } from "react";
import { create, useStore } from "zustand";
import { auth } from "@/lib/auth";
import { mediaUrl } from "@/lib/media-url";

export type ThumbnailSubject = { id: string; mediaType: string; durationMs: number };

type ThumbnailsState = { byId: Record<string, string | null> };

export const thumbnailsStore = create<ThumbnailsState>(() => ({ byId: {} }));

export const THUMBNAIL_CONCURRENCY = 6;
export const THUMBNAIL_MIN_OFFSET_MS = 30_000;
export const THUMBNAIL_MAX_OFFSET_MS = 5 * 60_000;
export const THUMBNAIL_RETRY_MS = 60_000;

const dir = () => new Directory(Paths.cache, "thumbnails");
const fileFor = (id: string) => new File(dir(), `${id}.jpg`);

export function frameTime(durationMs: number): number {
  if (durationMs <= THUMBNAIL_MIN_OFFSET_MS) return Math.floor(durationMs / 2);
  return Math.min(
    THUMBNAIL_MAX_OFFSET_MS,
    Math.max(THUMBNAIL_MIN_OFFSET_MS, Math.floor(durationMs / 4)),
  );
}

const queue: ThumbnailSubject[] = [];
const queued = new Set<string>();
let active = 0;

function set(id: string, uri: string | null) {
  thumbnailsStore.setState((s) => ({ byId: { ...s.byId, [id]: uri } }));
}

function forget(id: string) {
  thumbnailsStore.setState((s) => {
    const { [id]: _dropped, ...rest } = s.byId;
    return { byId: rest };
  });
}

function failed(id: string) {
  set(id, null);
  setTimeout(() => forget(id), THUMBNAIL_RETRY_MS);
}

async function urlFor(id: string): Promise<string> {
  const token = auth.token();
  if (!token) throw new Error("Not signed in");
  return mediaUrl(id, token);
}

async function generate(subject: ThumbnailSubject): Promise<void> {
  const url = await urlFor(subject.id);
  const result = await getThumbnailAsync(url, {
    time: frameTime(subject.durationMs),
    quality: 0.6,
  });
  const target = dir();
  target.create({ intermediates: true, idempotent: true });
  const dest = fileFor(subject.id);
  if (dest.exists) dest.delete();
  new File(result.uri).move(dest);
  set(subject.id, dest.uri);
}

async function drain(): Promise<void> {
  while (active < THUMBNAIL_CONCURRENCY && queue.length) {
    const next = queue.shift()!;
    active++;
    void generate(next)
      .catch(() => failed(next.id))
      .finally(() => {
        queued.delete(next.id);
        active--;
        void drain();
        if (!queue.length && !active) for (const wake of idleWaiters.splice(0)) wake();
      });
  }
}

function request(subject: ThumbnailSubject): void {
  const { byId } = thumbnailsStore.getState();
  if (subject.id in byId || queued.has(subject.id)) return;
  if (subject.mediaType !== "video") {
    set(subject.id, null);
    return;
  }
  const cached = fileFor(subject.id);
  if (cached.exists) {
    set(subject.id, cached.uri);
    return;
  }
  queued.add(subject.id);
  queue.push(subject);
  void drain();
}

function clear(): void {
  queue.length = 0;
  queued.clear();
  try {
    const target = dir();
    if (target.exists) target.delete();
  } catch {
    // a generation in flight can hold a file open; the next clear or overwrite handles it
  }
  thumbnailsStore.setState({ byId: {} });
}

const idleWaiters: (() => void)[] = [];

function whenIdle(): Promise<void> {
  if (!queue.length && !active) return Promise.resolve();
  return new Promise((resolve) => idleWaiters.push(resolve));
}

export const thumbnails = { request, clear, whenIdle, pending: () => queue.length + active };

export function useThumbnail({ id, mediaType, durationMs }: ThumbnailSubject) {
  const uri = useStore(thumbnailsStore, (s) => s.byId[id]);
  useEffect(() => {
    request({ id, mediaType, durationMs });
  }, [id, mediaType, durationMs]);
  return uri;
}
