import { DeviceEventEmitter } from "react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { Scrubber, scrubRatio } from "@/components/scrubber";
import { act, fireEvent, render, screen } from "@/test/render";

const props = {
  testID: "scrub",
  trackColor: "#000",
  fillColor: "#fff",
  labelColor: "#ccc",
};

const layout = (width: number) =>
  fireEvent(screen.getByTestId("scrub"), "layout", { nativeEvent: { layout: { width } } });

// fireGestureHandler always completes the gesture, so mid-drag states are emitted directly.
const emit = (x: number, transition?: { state: State; oldState: State }) =>
  act(async () => {
    const handlerTag = getByGestureTestId("scrub-pan").handlerTag;
    DeviceEventEmitter.emit(transition ? "onGestureHandlerStateChange" : "onGestureHandlerEvent", {
      handlerTag,
      x,
      ...transition,
    });
  });

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
    await render(<Scrubber {...props} position={1002} duration={2641} onSeek={jest.fn()} />);
    expect(screen.getByText("16:42")).toBeOnTheScreen();
    expect(screen.getByText("-27:19")).toBeOnTheScreen();
  });

  it("previews while dragging without seeking", async () => {
    const onSeek = jest.fn();
    await render(<Scrubber {...props} position={0} duration={200} onSeek={onSeek} />);
    await layout(400);

    await emit(100, { state: State.BEGAN, oldState: State.UNDETERMINED });
    expect(screen.getByText("0:50")).toBeOnTheScreen();

    await emit(100, { state: State.ACTIVE, oldState: State.BEGAN });
    await emit(300);
    expect(screen.getByText("2:30")).toBeOnTheScreen();
    expect(screen.getByText("-0:50")).toBeOnTheScreen();
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("keeps following the finger while the parent re-renders", async () => {
    const onSeek = jest.fn();
    const { rerender } = await render(
      <Scrubber {...props} position={0} duration={200} onSeek={() => onSeek()} />,
    );
    await layout(400);

    await emit(40, { state: State.BEGAN, oldState: State.UNDETERMINED });
    await emit(40, { state: State.ACTIVE, oldState: State.BEGAN });
    expect(screen.getByText("0:20")).toBeOnTheScreen();

    // A playback tick re-renders the parent with a fresh inline onSeek.
    await act(async () => {
      rerender(<Scrubber {...props} position={4} duration={200} onSeek={() => onSeek()} />);
    });
    await emit(200);
    expect(screen.getByText("1:40")).toBeOnTheScreen();

    await act(async () => {
      rerender(<Scrubber {...props} position={6} duration={200} onSeek={() => onSeek()} />);
    });
    await emit(320);
    expect(screen.getByText("2:40")).toBeOnTheScreen();
    expect(screen.getByText("-0:40")).toBeOnTheScreen();
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("reports the previewed time to onScrub and clears it when the drag ends", async () => {
    const onScrub = jest.fn();
    await render(
      <Scrubber {...props} position={0} duration={200} onSeek={jest.fn()} onScrub={onScrub} />,
    );
    await layout(400);
    onScrub.mockClear();

    await emit(100, { state: State.BEGAN, oldState: State.UNDETERMINED });
    expect(onScrub).toHaveBeenLastCalledWith(50);

    await emit(100, { state: State.ACTIVE, oldState: State.BEGAN });
    await emit(300);
    expect(onScrub).toHaveBeenLastCalledWith(150);

    await act(async () => {
      fireGestureHandler(getByGestureTestId("scrub-pan"), [
        { state: State.BEGAN, x: 300 },
        { state: State.ACTIVE, x: 300 },
        { state: State.END, x: 300 },
      ]);
    });
    expect(onScrub).toHaveBeenLastCalledWith(null);
  });

  it("seeks on release", async () => {
    const onSeek = jest.fn();
    await render(<Scrubber {...props} position={0} duration={200} onSeek={onSeek} />);
    await layout(400);

    await act(async () => {
      fireGestureHandler(getByGestureTestId("scrub-pan"), [
        { state: State.BEGAN, x: 100 },
        { state: State.ACTIVE, x: 100 },
        { x: 300 },
        { state: State.END, x: 300 },
      ]);
    });
    expect(onSeek).toHaveBeenCalledWith(150);
    expect(screen.getByText("0:00")).toBeOnTheScreen();
  });

  it("drops the preview when the gesture is cancelled", async () => {
    const onSeek = jest.fn();
    await render(<Scrubber {...props} position={10} duration={100} onSeek={onSeek} />);
    await layout(100);

    await act(async () => {
      fireGestureHandler(getByGestureTestId("scrub-pan"), [
        { state: State.BEGAN, x: 90 },
        { state: State.ACTIVE, x: 90 },
        { state: State.CANCELLED, x: 90 },
      ]);
    });
    expect(screen.getByText("0:10")).toBeOnTheScreen();
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("seeks on a tap", async () => {
    const onSeek = jest.fn();
    await render(<Scrubber {...props} position={0} duration={100} onSeek={onSeek} />);
    await layout(200);

    await act(async () => {
      fireGestureHandler(getByGestureTestId("scrub-tap"), [
        { state: State.BEGAN, x: 50 },
        { state: State.ACTIVE, x: 50 },
        { state: State.END, x: 50 },
      ]);
    });
    expect(onSeek).toHaveBeenCalledWith(25);
  });
});
