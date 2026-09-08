import { DEMO_MEDIA_URL, isDemoToken } from "@/lib/demo";
import { makeClient } from "@/lib/grain";
import { queryClient, reportAuthFailure } from "@/lib/query";

export const MEDIA_URL_STALE_MS = 45 * 60_000;
export const MEDIA_URL_GC_MS = 60 * 60_000;

export const mediaUrlKey = (id: string, token: string) => ["media-url", token, id] as const;

export function mediaUrl(id: string, token: string): Promise<string> {
  if (isDemoToken(token)) return Promise.resolve(DEMO_MEDIA_URL);
  return queryClient
    .fetchQuery({
      queryKey: mediaUrlKey(id, token),
      queryFn: () => makeClient(token).recordings.resolveMediaUrl(id),
      staleTime: MEDIA_URL_STALE_MS,
      gcTime: MEDIA_URL_GC_MS,
    })
    .catch((e: unknown) => {
      reportAuthFailure(e);
      throw e;
    });
}

export function invalidateMediaUrl(id: string): void {
  void queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === "media-url" && query.queryKey[2] === id,
  });
}

export function clearMediaUrls(): void {
  queryClient.removeQueries({ queryKey: ["media-url"] });
}
