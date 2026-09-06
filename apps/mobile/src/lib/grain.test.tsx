import { GrainClient } from "@grist/grain-api";
import { renderHook } from "@testing-library/react-native";
import { act } from "react";
import { useAuth } from "@/lib/auth";
import { makeClient, useGrainClient } from "@/lib/grain";

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "x",
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

describe("grain client", () => {
  it("makeClient builds a GrainClient for the token", () => {
    expect(makeClient("pat")).toBeInstanceOf(GrainClient);
  });

  it("useGrainClient is null when signed out and stable while the token is unchanged", async () => {
    useAuth.setState({ status: "signed-out", token: null });
    const { result, rerender } = await renderHook(() => useGrainClient());
    expect(result.current).toBeNull();

    await act(async () => useAuth.setState({ status: "signed-in", token: "pat" }));
    const first = result.current;
    expect(first).toBeInstanceOf(GrainClient);
    await rerender(undefined);
    expect(result.current).toBe(first);

    await act(async () => useAuth.setState({ status: "signed-in", token: "other" }));
    expect(result.current).not.toBe(first);
  });
});
