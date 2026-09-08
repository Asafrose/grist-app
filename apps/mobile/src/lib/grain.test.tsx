import { GrainApiError, GrainClient } from "@grist/grain-api";
import { renderHook } from "@testing-library/react-native";
import { act } from "react";
import { authStore } from "@/lib/auth";
import { isTokenRejected, makeClient, tokenErrorMessage, useGrainClient } from "@/lib/grain";

describe("grain client", () => {
  it("makeClient builds a GrainClient for the token", () => {
    expect(makeClient("pat")).toBeInstanceOf(GrainClient);
  });

  it("useGrainClient is null when signed out and stable while the token is unchanged", async () => {
    authStore.setState({ status: "signed-out", token: null });
    const { result, rerender } = await renderHook(() => useGrainClient());
    expect(result.current).toBeNull();

    await act(async () => authStore.setState({ status: "signed-in", token: "pat" }));
    const first = result.current;
    expect(first).toBeInstanceOf(GrainClient);
    await rerender(undefined);
    expect(result.current).toBe(first);

    await act(async () => authStore.setState({ status: "signed-in", token: "other" }));
    expect(result.current).not.toBe(first);
  });

  it("tokenErrorMessage distinguishes rejected tokens, server errors and network failures", () => {
    expect(tokenErrorMessage(new GrainApiError("no", 401))).toBe(
      "Grain didn't accept that token. Check it and try again.",
    );
    expect(tokenErrorMessage(new GrainApiError("no", 403))).toBe(
      "Grain didn't accept that token. Check it and try again.",
    );
    expect(tokenErrorMessage(new GrainApiError("slow down", 429, "rate_limited", 3))).toBe(
      "Too many requests to Grain. Try again in 3s.",
    );
    expect(tokenErrorMessage(new GrainApiError("slow down", 429))).toBe(
      "Too many requests to Grain. Try again in a moment.",
    );
    expect(tokenErrorMessage(new GrainApiError("boom", 500))).toBe(
      "Grain returned an error (500). Try again in a moment.",
    );
    expect(tokenErrorMessage(new TypeError("Network request failed"))).toBe(
      "Couldn't reach Grain. Check your connection and try again.",
    );
  });

  it("isTokenRejected is true only for auth failures", () => {
    expect(isTokenRejected(new GrainApiError("no", 401))).toBe(true);
    expect(isTokenRejected(new GrainApiError("slow down", 429))).toBe(false);
    expect(isTokenRejected(new TypeError("Network request failed"))).toBe(false);
  });
});
