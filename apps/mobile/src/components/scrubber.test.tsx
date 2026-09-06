import { fireEvent, render, screen } from "@/test/render";
import { Scrubber, scrubRatio } from "@/components/scrubber";

const touch = (locationX: number) => ({ nativeEvent: { locationX } });

describe("scrubRatio", () => {
  it("clamps to the track and tolerates an unmeasured width", () => {
    expect(scrubRatio(150, 300)).toBe(0.5);
    expect(scrubRatio(-20, 300)).toBe(0);
    expect(scrubRatio(400, 300)).toBe(1);
    expect(scrubRatio(10, 0)).toBe(0);
  });
});

describe("Scrubber", () => {
  it("shows elapsed and remaining time", async () => {
    await render(
      <Scrubber
        testID="scrub"
        position={1002}
        duration={2641}
        onSeek={jest.fn()}
        trackColor="#000"
        fillColor="#fff"
        labelColor="#ccc"
      />,
    );
    expect(screen.getByText("16:42")).toBeOnTheScreen();
    expect(screen.getByText("-27:19")).toBeOnTheScreen();
  });

  it("previews while dragging and seeks only on release", async () => {
    const onSeek = jest.fn();
    await render(
      <Scrubber
        testID="scrub"
        position={0}
        duration={200}
        onSeek={onSeek}
        trackColor="#000"
        fillColor="#fff"
        labelColor="#ccc"
      />,
    );
    const track = screen.getByTestId("scrub");
    await fireEvent(track, "layout", { nativeEvent: { layout: { width: 400 } } });
    await fireEvent(track, "responderGrant", touch(100));
    expect(screen.getByText("0:50")).toBeOnTheScreen();
    expect(onSeek).not.toHaveBeenCalled();
    await fireEvent(track, "responderMove", touch(300));
    expect(screen.getByText("2:30")).toBeOnTheScreen();
    expect(screen.getByText("-0:50")).toBeOnTheScreen();
    await fireEvent(track, "responderRelease", touch(300));
    expect(onSeek).toHaveBeenCalledWith(150);
    expect(screen.getByText("0:00")).toBeOnTheScreen();
  });

  it("drops the preview when the gesture is cancelled", async () => {
    const onSeek = jest.fn();
    await render(
      <Scrubber
        testID="scrub"
        position={10}
        duration={100}
        onSeek={onSeek}
        trackColor="#000"
        fillColor="#fff"
        labelColor="#ccc"
      />,
    );
    const track = screen.getByTestId("scrub");
    await fireEvent(track, "layout", { nativeEvent: { layout: { width: 100 } } });
    await fireEvent(track, "responderGrant", touch(90));
    expect(screen.getByText("1:30")).toBeOnTheScreen();
    await fireEvent(track, "responderTerminate", touch(90));
    expect(screen.getByText("0:10")).toBeOnTheScreen();
    expect(onSeek).not.toHaveBeenCalled();
  });
});
