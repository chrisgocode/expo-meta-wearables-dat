import type {
  DisplayButtonNode,
  DisplayChildNode,
  DisplayRoot,
  SerializedDisplayNode,
} from "./EMWDAT.types";

/**
 * Tap handlers stripped out of one display tree, keyed by generated id.
 *
 * A registry belongs to exactly one `renderDisplay` call. Because every render replaces
 * the whole screen, registries are swapped wholesale rather than merged — a tap arriving
 * for a superseded tree finds no entry and is dropped rather than being misrouted to a
 * same-position node in the newer tree.
 */
export type TapRegistry = Map<string, () => void>;

export interface SerializedDisplayTree {
  root: SerializedDisplayNode;
  handlers: TapRegistry;
}

/** Nodes the SDK accepts a tap handler on. Text/image/icon are not tappable on either platform. */
const TAPPABLE = new Set(["flex", "button"]);

/**
 * Split a display tree into a serialisable payload plus the tap handlers it carried.
 *
 * Ids are positional and stable for a given tree shape (`n0`, `n0.2`, `n0.2.1`), which keeps
 * them readable in logs. They are *not* stable across renders, and callers are told not to
 * hold them.
 */
export function serializeDisplayTree(root: DisplayRoot): SerializedDisplayTree {
  const handlers: TapRegistry = new Map();

  const visit = (node: DisplayRoot | DisplayChildNode, path: string): SerializedDisplayNode => {
    const rest = node as unknown as Record<string, unknown>;
    const out: SerializedDisplayNode = { type: node.type };

    for (const [key, value] of Object.entries(rest)) {
      if (key === "type" || key === "onTap" || key === "children" || key === "buttons") continue;
      if (value !== undefined) out[key] = value;
    }

    if ("onTap" in node && typeof node.onTap === "function") {
      if (!TAPPABLE.has(node.type)) {
        throw new Error(
          `Display node "${node.type}" cannot handle taps. Only flex and button nodes are ` +
            `tappable — wrap it in a flex node with onTap.`
        );
      }
      handlers.set(path, node.onTap);
      out.tapId = path;
    }

    if (node.type === "flex") {
      out.children = node.children.map((child, i) => visit(child, `${path}.${i}`));
    }

    if (node.type === "buttonGroup") {
      out.buttons = node.buttons.map((button: DisplayButtonNode, i) =>
        visit(button, `${path}.${i}`)
      );
    }

    return out;
  };

  return { root: visit(root, "n0"), handlers };
}

/**
 * Reject trees the SDK would reject, with an error naming the node rather than failing
 * silently on hardware the caller cannot see.
 */
export function assertValidDisplayRoot(root: DisplayRoot): void {
  if (root.type !== "flex" && root.type !== "video") {
    throw new Error(
      `Display root must be a flex or video node, received "${(root as { type: string }).type}". ` +
        `Only FlexBox and VideoPlayer are renderable at the root.`
    );
  }
}
