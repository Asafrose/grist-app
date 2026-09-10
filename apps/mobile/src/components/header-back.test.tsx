import { readFileSync } from "node:fs";
import { DefaultTheme, ThemeProvider } from "expo-router/react-navigation";
import type { ReactElement } from "react";
import { Platform } from "react-native";
import { HeaderBack, headerBackOptions } from "@/components/header-back";
import { fireEvent, render, screen, waitFor } from "@/test/render";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    canGoBack: () => mockCanGoBack(),
    replace: (href: string) => mockReplace(href),
  },
}));

const inHeader = (ui: ReactElement) => <ThemeProvider value={DefaultTheme}>{ui}</ThemeProvider>;

beforeEach(() => {
  mockBack.mockClear();
  mockReplace.mockClear();
  mockCanGoBack.mockClear();
  mockCanGoBack.mockReturnValue(true);
});

test("shows the label beside the chevron on iOS", async () => {
  jest.replaceProperty(Platform, "OS", "ios");

  await render(inHeader(<HeaderBack canGoBack fallbackHref="/" label="Meetings" />));

  expect(screen.getByTestId("header-back")).toBeVisible();
  expect(screen.getByLabelText("Back to Meetings")).toBeVisible();
  expect(screen.getAllByText("Meetings").length).toBeGreaterThan(0);
});

test("shows the label beside the chevron on Android too", async () => {
  jest.replaceProperty(Platform, "OS", "android");

  await render(inHeader(<HeaderBack canGoBack fallbackHref="/" label="Meetings" />));

  expect(screen.getByTestId("header-back")).toBeVisible();
  expect(screen.getByLabelText("Back to Meetings")).toBeVisible();
  expect(screen.getAllByText("Meetings").length).toBeGreaterThan(0);
});

test("keeps a 44x44 touch target", async () => {
  jest.replaceProperty(Platform, "OS", "android");

  await render(inHeader(<HeaderBack canGoBack fallbackHref="/" label="Meetings" />));

  expect(screen.getByTestId("header-back")).toHaveStyle({
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
  });
});

test("renders nothing when there is nothing to go back to", async () => {
  await render(inHeader(<HeaderBack canGoBack={false} fallbackHref="/" label="Meetings" />));

  expect(screen.queryByTestId("header-back")).toBeNull();
});

test("pops the stack when tapped", async () => {
  await render(
    inHeader(
      <HeaderBack canGoBack fallbackHref="/settings" label="Settings" tintColor="#ff0000" />,
    ),
  );

  fireEvent.press(screen.getByTestId("header-back"));

  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  expect(mockReplace).not.toHaveBeenCalled();
});

test("falls back to the given route when the stack cannot pop", async () => {
  mockCanGoBack.mockReturnValue(false);

  await render(inHeader(<HeaderBack canGoBack fallbackHref="/settings" label="Settings" />));

  fireEvent.press(screen.getByTestId("header-back"));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/settings"));
  expect(mockBack).not.toHaveBeenCalled();
});

test("headerLeft option carries the label and the fallback through", async () => {
  mockCanGoBack.mockReturnValue(false);
  const { headerLeft } = headerBackOptions("Settings", "/settings");

  await render(inHeader(headerLeft({ canGoBack: true })));

  expect(screen.getByLabelText("Back to Settings")).toBeVisible();

  fireEvent.press(screen.getByTestId("header-back"));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/settings"));
});

test("both header screens wire the shared back button to their own tab", () => {
  const layout = readFileSync(`${__dirname}/../app/_layout.tsx`, "utf8");

  expect(layout).toContain('headerBackOptions("Meetings", "/")');
  expect(layout).toContain('headerBackOptions("Settings", "/settings")');
});
