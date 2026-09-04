import {
  addDisplayToSession,
  clearDisplay,
  removeDisplayFromSession,
  renderDisplay,
  EMWDATModule,
} from "../EMWDATModule";

type Listener = (payload: { sessionId: string; tapId: string }) => void;

const listeners: Record<string, Listener[]> = {};

jest.mock("expo", () => {
  const nativeModule = {
    addDisplayToSession: jest.fn(() => Promise.resolve()),
    renderDisplay: jest.fn(() => Promise.resolve()),
    clearDisplay: jest.fn(() => Promise.resolve()),
    removeDisplayFromSession: jest.fn(() => Promise.resolve()),
    getDisplayState: jest.fn(() => Promise.resolve("started")),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  };
  return { NativeModule: class {}, requireNativeModule: () => nativeModule };
});

jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const native = EMWDATModule as any;

/** Capture the tap listener the module installs, so events can be simulated. */
beforeAll(() => {
  native.addListener.mockImplementation((name: string, fn: Listener) => {
    (listeners[name] ??= []).push(fn);
    return { remove: jest.fn() };
  });
});

function emitTap(sessionId: string, tapId: string): void {
  for (const fn of listeners.onDisplayTap ?? []) fn({ sessionId, tapId });
}

describe("display tap routing", () => {
  beforeEach(() => {
    native.renderDisplay.mockClear();
  });

  it("installs exactly one tap listener no matter how many sessions attach", async () => {
    await addDisplayToSession("s1");
    await addDisplayToSession("s2");
    expect(listeners.onDisplayTap?.length).toBe(1);
  });

  it("invokes the handler for the tapped node", async () => {
    const onTap = jest.fn();
    await renderDisplay("s1", {
      type: "flex",
      children: [{ type: "button", label: "Next", onTap }],
    });

    emitTap("s1", "n0.0");
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("sends the serialized tree, not the closures, across the bridge", async () => {
    await renderDisplay("s1", {
      type: "flex",
      children: [{ type: "button", label: "Next", onTap: jest.fn() }],
    });

    const [, payload] = native.renderDisplay.mock.calls.at(-1);
    expect(payload).toEqual({
      type: "flex",
      children: [{ type: "button", label: "Next", tapId: "n0.0" }],
    });
    expect(JSON.stringify(payload)).toContain("tapId");
  });

  it("drops taps for a tree that has been superseded", async () => {
    const stale = jest.fn();
    const fresh = jest.fn();

    await renderDisplay("s1", {
      type: "flex",
      children: [
        { type: "button", label: "a", onTap: stale },
        { type: "button", label: "b", onTap: stale },
      ],
    });
    // Newer tree has only one child, so "n0.1" no longer exists.
    await renderDisplay("s1", {
      type: "flex",
      children: [{ type: "button", label: "a", onTap: fresh }],
    });

    emitTap("s1", "n0.1");
    expect(stale).not.toHaveBeenCalled();
    expect(fresh).not.toHaveBeenCalled();

    emitTap("s1", "n0.0");
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(stale).not.toHaveBeenCalled();
  });

  it("keeps sessions isolated from each other", async () => {
    const one = jest.fn();
    const two = jest.fn();

    await renderDisplay("s1", {
      type: "flex",
      children: [{ type: "button", label: "1", onTap: one }],
    });
    await renderDisplay("s2", {
      type: "flex",
      children: [{ type: "button", label: "2", onTap: two }],
    });

    emitTap("s2", "n0.0");
    expect(two).toHaveBeenCalledTimes(1);
    expect(one).not.toHaveBeenCalled();
  });

  it("ignores taps for unknown sessions", () => {
    expect(() => emitTap("never-rendered", "n0.0")).not.toThrow();
  });

  it("clearDisplay empties the registry but keeps the session addressable", async () => {
    const onTap = jest.fn();
    await renderDisplay("s1", { type: "flex", children: [{ type: "button", label: "x", onTap }] });
    await clearDisplay("s1");

    emitTap("s1", "n0.0");
    expect(onTap).not.toHaveBeenCalled();
  });

  it("removeDisplayFromSession drops the registry entirely", async () => {
    const onTap = jest.fn();
    await renderDisplay("s3", { type: "flex", children: [{ type: "button", label: "x", onTap }] });
    await removeDisplayFromSession("s3");

    emitTap("s3", "n0.0");
    expect(onTap).not.toHaveBeenCalled();
  });

  it("rejects an invalid root before touching the bridge", async () => {
    await expect(renderDisplay("s1", { type: "text", content: "nope" } as any)).rejects.toThrow(
      /must be a flex or video node/
    );
    expect(native.renderDisplay).not.toHaveBeenCalled();
  });
});
