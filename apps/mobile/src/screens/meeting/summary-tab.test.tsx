import type { Recording } from "@grist/grain-api";
import detail from "@grist/grain-api/fixtures/recording.json";
import { fireEvent, render, screen } from "@/test/render";
import { getRecording, type RecordingDetail, upsertRecordings } from "@/lib/db";
import { testDb } from "@/test/db";
import { SummaryTab } from "./summary-tab";

jest.mock("react-native-reanimated", () => require("@/test/mocks/reanimated"));

const NOW = "2026-09-06T10:00:00Z";
const base = detail as Recording;

function load(overrides: Partial<Recording> = {}): RecordingDetail {
  const db = testDb();
  upsertRecordings(db, [{ ...base, ...overrides }], NOW);
  return getRecording(db, base.id)!;
}

describe("SummaryTab", () => {
  it("groups action items by assignee with status, company and a seeking row", async () => {
    const onSeek = jest.fn();
    const items = base.ai_action_items!.map((a, i) =>
      i === 1 ? { ...a, status: "completed" as const } : a,
    );
    await render(<SummaryTab rec={load({ ai_action_items: items })} onSeek={onSeek} />);

    expect(screen.getByText("Action items")).toBeOnTheScreen();
    expect(screen.getAllByText("Marcus Kowalski")).toHaveLength(1);
    expect(screen.getAllByText("· Treyresearch").length).toBeGreaterThan(0);
    expect(screen.getByText("Noa Whitfield")).toBeOnTheScreen();
    expect(screen.getByText("MK")).toBeOnTheScreen();

    expect(screen.getByTestId("action-0")).not.toBeChecked();
    expect(screen.getByTestId("action-1")).toBeChecked();
    expect(screen.getAllByText("42:12").length).toBeGreaterThan(0);

    await fireEvent.press(screen.getByTestId("action-2"));
    expect(onSeek).toHaveBeenCalledWith(2_196_508);
  });

  it("renders sections as bullets with bold runs, inline and trailing seek chips", async () => {
    const onSeek = jest.fn();
    const rec = load({
      ai_action_items: [],
      ai_summary: {
        text: [
          "## Summary",
          "- Acme has no SIEM, led by **Marcus**. 1:28",
          "  - Pricing at 17:04 was revisited later 42:12",
          "",
          "## Open questions",
          "- Endpoint visibility during the pilot 10:14",
        ].join("\n"),
      },
    });
    await render(<SummaryTab rec={rec} onSeek={onSeek} />);

    expect(screen.queryByText("Action items")).toBeNull();
    expect(screen.getByText("Summary")).toBeOnTheScreen();
    expect(screen.getByText("Open questions")).toBeOnTheScreen();
    expect(screen.getByText("Marcus")).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId("ts-88000"));
    expect(onSeek).toHaveBeenLastCalledWith(88_000);

    await fireEvent.press(screen.getByText("17:04"));
    expect(onSeek).toHaveBeenLastCalledWith(1_024_000);

    await fireEvent.press(screen.getByTestId("ts-2532000"));
    expect(onSeek).toHaveBeenLastCalledWith(2_532_000);

    await fireEvent.press(screen.getByTestId("ts-614000"));
    expect(onSeek).toHaveBeenLastCalledWith(614_000);
    expect(onSeek).toHaveBeenCalledTimes(4);
  });

  it("renders the fixture summary with a chip for every trailing timestamp", async () => {
    await render(<SummaryTab rec={load()} onSeek={jest.fn()} />);
    expect(screen.getByText("Demo highlights")).toBeOnTheScreen();
    expect(screen.getAllByTestId("ts-2532000").length).toBeGreaterThan(1);
    expect(screen.getAllByTestId("ts-88000").length).toBeGreaterThan(0);
  });

  it("shows an empty state, and says so differently while refreshing", async () => {
    const rec = load({ ai_action_items: [], ai_summary: null });
    const view = await render(<SummaryTab rec={rec} onSeek={jest.fn()} />);
    expect(screen.getByText("No summary yet")).toBeOnTheScreen();

    await view.rerender(<SummaryTab rec={rec} onSeek={jest.fn()} refreshing />);
    expect(screen.getByText("Checking Grain for the summary…")).toBeOnTheScreen();
  });
});
