export const mockKeychain = new Map<string, string>();

export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = "afterFirstUnlockThisDeviceOnly";

export const getItemAsync = jest.fn(async (key: string) => mockKeychain.get(key) ?? null);

export const setItemAsync = jest.fn(async (key: string, value: string) => {
  mockKeychain.set(key, value);
});

export const deleteItemAsync = jest.fn(async (key: string) => {
  mockKeychain.delete(key);
});
