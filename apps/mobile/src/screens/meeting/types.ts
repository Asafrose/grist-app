import type { RecordingDetail } from "@/lib/data";

export type TabProps = { rec: RecordingDetail; onSeek: (ms: number) => void };
