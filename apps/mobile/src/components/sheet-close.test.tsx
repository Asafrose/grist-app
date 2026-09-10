import { Platform } from "react-native";
import { SheetClose } from "@/components/sheet-close";
import { fireEvent, render, screen } from "@/test/render";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: mockCanGoBack }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(true);
});

test("renders nothing on iOS", async () => {
  jest.replaceProperty(Platform, "OS", "ios");

  await render(<SheetClose testID="filters-close" />);

  expect(screen.queryByTestId("filters-close")).toBeNull();
  expect(screen.queryByLabelText("Close")).toBeNull();
});

test("renders a labelled control with a 44pt touch target on Android", async () => {
  jest.replaceProperty(Platform, "OS", "android");

  await render(<SheetClose testID="filters-close" />);

  const button = screen.getByTestId("filters-close");
  expect(button).toBeVisible();
  expect(screen.getByLabelText("Close")).toBe(button);
  expect(button.props.hitSlop).toBe(12);
});

test("pops the sheet when tapped", async () => {
  jest.replaceProperty(Platform, "OS", "android");

  await render(<SheetClose testID="actions-close" />);
  await fireEvent.press(screen.getByTestId("actions-close"));

  expect(mockBack).toHaveBeenCalledTimes(1);
});

test("falls back to the library when there is nothing to pop", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  mockCanGoBack.mockReturnValue(false);

  await render(<SheetClose testID="view-picker-close" />);
  await fireEvent.press(screen.getByTestId("view-picker-close"));

  expect(mockReplace).toHaveBeenCalledWith("/");
  expect(mockBack).not.toHaveBeenCalled();
});
