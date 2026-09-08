export const mockSizes = new Map<string, number>();

class Entry {
  uri: string;
  constructor(...parts: unknown[]) {
    this.uri = parts.map((p) => (typeof p === "string" ? p : (p as { uri: string }).uri)).join("/");
  }
}

export class File extends Entry {
  static downloadFileAsync = jest.fn();
  get exists() {
    return mockSizes.has(this.uri);
  }
  get size() {
    return mockSizes.get(this.uri) ?? null;
  }
  create() {}
  delete() {
    mockSizes.delete(this.uri);
  }
}

export class Directory extends Entry {
  get exists() {
    return [...mockSizes.keys()].some((k) => k.startsWith(`${this.uri}/`));
  }
  create() {}
  delete() {
    for (const k of mockSizes.keys()) if (k.startsWith(`${this.uri}/`)) mockSizes.delete(k);
  }
  list() {
    return [...mockSizes.keys()]
      .filter((k) => k.startsWith(`${this.uri}/`))
      .map((k) => new File(k));
  }
}

export const Paths = { document: "file:///docs" };
