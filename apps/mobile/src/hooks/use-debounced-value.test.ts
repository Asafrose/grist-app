import { act, renderHook } from "@testing-library/react-native";
import { SEARCH_DEBOUNCE_MS, useDebouncedValue } from "@/hooks/use-debounced-value";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("useDebouncedValue", () => {
  it("returns the initial value immediately and trails changes by the delay", async () => {
    const { result, rerender } = await renderHook(
      (props: { v: string }) => useDebouncedValue(props.v),
      {
        initialProps: { v: "p" },
      },
    );
    expect(result.current).toBe("p");
    await rerender({ v: "pr" });
    expect(result.current).toBe("p");
    await act(() => jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
    expect(result.current).toBe("p");
    await act(() => jest.advanceTimersByTime(1));
    expect(result.current).toBe("pr");
  });

  it("restarts the timer on every change so only the last value lands", async () => {
    const { result, rerender } = await renderHook(
      (props: { v: string }) => useDebouncedValue(props.v, 100),
      {
        initialProps: { v: "" },
      },
    );
    await rerender({ v: "a" });
    await act(() => jest.advanceTimersByTime(60));
    await rerender({ v: "ab" });
    await act(() => jest.advanceTimersByTime(60));
    expect(result.current).toBe("");
    await act(() => jest.advanceTimersByTime(40));
    expect(result.current).toBe("ab");
  });
});
