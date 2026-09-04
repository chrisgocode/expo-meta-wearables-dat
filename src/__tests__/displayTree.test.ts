import type { DisplayFlexNode, DisplayRoot } from "../EMWDAT.types";
import { assertValidDisplayRoot, serializeDisplayTree } from "../displayTree";

describe("serializeDisplayTree", () => {
  it("serializes a leaf-only tree and keeps declared props", () => {
    const { root, handlers } = serializeDisplayTree({
      type: "flex",
      direction: "column",
      spacing: 12,
      children: [{ type: "text", content: "Boil the kettle", style: "heading" }],
    });

    expect(handlers.size).toBe(0);
    expect(root).toEqual({
      type: "flex",
      direction: "column",
      spacing: 12,
      children: [{ type: "text", content: "Boil the kettle", style: "heading" }],
    });
  });

  it("omits undefined props rather than sending nulls across the bridge", () => {
    const { root } = serializeDisplayTree({
      type: "flex",
      direction: undefined,
      children: [],
    });

    expect(Object.keys(root)).toEqual(["type", "children"]);
  });

  it("strips onTap into the registry and replaces it with a tapId", () => {
    const onTap = jest.fn();
    const { root, handlers } = serializeDisplayTree({
      type: "flex",
      children: [{ type: "button", label: "Next", onTap }],
    });

    const button = root.children?.[0];
    expect(button?.tapId).toBe("n0.0");
    expect("onTap" in (button ?? {})).toBe(false);
    expect(handlers.get("n0.0")).toBe(onTap);
  });

  it("assigns positional ids that distinguish siblings and depth", () => {
    const { handlers } = serializeDisplayTree({
      type: "flex",
      onTap: jest.fn(),
      children: [
        { type: "text", content: "a" },
        {
          type: "flex",
          onTap: jest.fn(),
          children: [{ type: "button", label: "b", onTap: jest.fn() }],
        },
      ],
    });

    expect([...handlers.keys()].sort()).toEqual(["n0", "n0.1", "n0.1.0"]);
  });

  it("routes each id to its own handler", () => {
    const first = jest.fn();
    const second = jest.fn();
    const { handlers } = serializeDisplayTree({
      type: "flex",
      children: [
        { type: "button", label: "1", onTap: first },
        { type: "button", label: "2", onTap: second },
      ],
    });

    handlers.get("n0.1")?.();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("serializes buttonGroup buttons and registers their handlers", () => {
    const onTap = jest.fn();
    const { root, handlers } = serializeDisplayTree({
      type: "flex",
      children: [
        {
          type: "buttonGroup",
          alignment: "center",
          buttons: [{ type: "button", label: "Skip", onTap }],
        },
      ],
    });

    const group = root.children?.[0];
    expect(group?.type).toBe("buttonGroup");
    expect(group?.buttons?.[0]).toMatchObject({ type: "button", label: "Skip", tapId: "n0.0.0" });
    expect(handlers.get("n0.0.0")).toBe(onTap);
  });

  it("rejects taps on nodes the SDK cannot make tappable", () => {
    const tree = {
      type: "flex",
      children: [{ type: "text", content: "tap me", onTap: jest.fn() }],
    } as unknown as DisplayFlexNode;

    expect(() => serializeDisplayTree(tree)).toThrow(/Only flex and button nodes are tappable/);
  });

  it("serializes a video root", () => {
    const { root, handlers } = serializeDisplayTree({
      type: "video",
      uri: "https://example.com/clip.mp4",
      codec: "mp4",
    });

    expect(root).toEqual({ type: "video", uri: "https://example.com/clip.mp4", codec: "mp4" });
    expect(handlers.size).toBe(0);
  });

  it("produces a fresh registry per call so superseded trees cannot be tapped", () => {
    const stale = jest.fn();
    const fresh = jest.fn();

    const first = serializeDisplayTree({
      type: "flex",
      children: [{ type: "button", label: "old", onTap: stale }],
    });
    const second = serializeDisplayTree({
      type: "flex",
      children: [{ type: "button", label: "new", onTap: fresh }],
    });

    expect(first.handlers).not.toBe(second.handlers);
    expect(second.handlers.get("n0.0")).toBe(fresh);
    expect(first.handlers.get("n0.0")).toBe(stale);
  });
});

describe("assertValidDisplayRoot", () => {
  it.each(["flex", "video"] as const)("accepts %s at the root", (type) => {
    const root = (type === "flex" ? { type, children: [] } : { type, uri: "x" }) as DisplayRoot;
    expect(() => assertValidDisplayRoot(root)).not.toThrow();
  });

  it.each(["text", "button", "image", "icon", "buttonGroup"])("rejects %s at the root", (type) => {
    expect(() => assertValidDisplayRoot({ type } as unknown as DisplayRoot)).toThrow(
      /must be a flex or video node/
    );
  });
});
