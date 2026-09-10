import { readFileSync } from "node:fs";
import { DefaultTheme, ThemeProvider } from "expo-router/react-navigation";
import type { ReactElement } from "react";
import { Platform } from "react-native";
import { HeaderBack, headerBackOptions } from "@/components/header-back";
import { fireEvent, render, screen, waitFor } from "@/test/render";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({ router: { back: () => mockBack() } }));

const inHeader = (ui: ReactElement) => <ThemeProvider value={DefaultTheme}>{ui}</ThemeProvider>;

beforeEach(() => {
  mockBack.mockClear();
});

test("shows the label beside the chevron on iOS", async () => {
  jest.replaceProperty(Platform, "OS", "ios");

  await render(inHeader(<HeaderBack canGoBack label="Meetings" />));

  expect(screen.getByTestId("header-back")).toBeVisible();
  expect(screen.getByLabelText("Back to Meetings")).toBeVisible();
  expect(screen.getAllByText("Meetings").length).toBeGreaterThan(0);
});

test("shows the chevron alone on Android, still addressable by id and label", async () => {
  jest.replaceProperty(Platform, "OS", "android");

  await render(inHeader(<HeaderBack canGoBack label="Meetings" />));

  expect(screen.getByTestId("header-back")).toBeVisible();
  expect(screen.getByLabelText("Back to Meetings")).toBeVisible();
  expect(screen.queryByText("Meetings")).toBeNull();
});

test("renders nothing when there is nothing to go back to", async () => {
  await render(inHeader(<HeaderBack canGoBack={false} label="Meetings" />));

  expect(screen.queryByTestId("header-back")).toBeNull();
});

test("pops the stack when tapped", async () => {
  await render(inHeader(<HeaderBack canGoBack label="Settings" tintColor="#ff0000" />));

  fireEvent.press(screen.getByTestId("header-back"));

  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
});

test("headerLeft option carries the label through", async () => {
  const { headerLeft } = headerBackOptions("Settings");

  await render(inHeader(headerLeft({ canGoBack: true })));

  expect(screen.getByLabelText("Back to Settings")).toBeVisible();
});

test("both header screens wire the shared back button", () => {
  const layout = readFileSync(`${__dirname}/../app/_layout.tsx`, "utf8");

  expect(layout).toContain('headerBackOptions("Meetings")');
  expect(layout).toContain('headerBackOptions("Settings")');
});
