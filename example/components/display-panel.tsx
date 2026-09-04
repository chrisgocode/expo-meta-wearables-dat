import {
  addDisplayToSession,
  clearDisplay,
  removeDisplayFromSession,
  renderDisplay,
} from "@chrisgocode/expo-meta-wearables-dat";
import type { DisplayRoot, DisplayState } from "@chrisgocode/expo-meta-wearables-dat";
import { useCallback, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { Btn, Section, StatusRow } from "./ui";

interface DisplayPanelProps {
  sessionId: string | null;
  displayState: DisplayState | null;
  onEvent: (message: string) => void;
}

/** A tiny stand-in for a guided task list, rendered on the glasses one step at a time. */
const STEPS = ["Fill the kettle", "Grind 18g of beans", "Bloom for 30 seconds", "Pour to 300g"];

/**
 * Demonstrates the display capability: a task card with tappable controls.
 *
 * The tree is a pure function of `step` — the SDK replaces the whole screen on every send,
 * so re-rendering means calling `renderDisplay` again rather than mutating anything.
 */
export function DisplayPanel({ sessionId, displayState, onEvent }: DisplayPanelProps) {
  const [attached, setAttached] = useState(false);
  const [step, setStep] = useState(0);

  const safe = (fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
    } catch (err) {
      Alert.alert("Display Error", err instanceof Error ? err.message : String(err));
    }
  };

  const buildTree = useCallback(
    (index: number): DisplayRoot => ({
      type: "flex",
      direction: "column",
      spacing: 12,
      padding: { top: 24, bottom: 24, leading: 24, trailing: 24 },
      children: [
        { type: "text", content: `Step ${index + 1} of ${STEPS.length}`, style: "meta" },
        { type: "text", content: STEPS[index], style: "heading" },
        {
          type: "buttonGroup",
          alignment: "center",
          buttons: [
            {
              type: "button",
              label: "Back",
              style: "outline",
              iconName: "arrowLeft",
              onTap: () => void show(Math.max(0, index - 1)),
            },
            {
              type: "button",
              label: "Next",
              style: "primary",
              iconName: "arrowRight",
              onTap: () => void show(Math.min(STEPS.length - 1, index + 1)),
            },
          ],
        },
      ],
    }),
    // `show` is stable enough for the example; it only reads sessionId.

    [sessionId]
  );

  const show = useCallback(
    async (index: number) => {
      if (!sessionId) return;
      setStep(index);
      await renderDisplay(sessionId, buildTree(index));
      onEvent(`Display: rendered step ${index + 1}`);
    },
    [sessionId, buildTree, onEvent]
  );

  return (
    <Section title="Display">
      <StatusRow label="State" value={displayState ?? "—"} />
      <StatusRow label="Attached" value={attached ? "yes" : "no"} />

      <View style={styles.preview}>
        <Text style={styles.previewMeta}>
          Step {step + 1} of {STEPS.length}
        </Text>
        <Text style={styles.previewHeading}>{STEPS[step]}</Text>
      </View>

      <Btn
        label="Attach display"
        disabled={!sessionId || attached}
        onPress={safe(async () => {
          if (!sessionId) return;
          await addDisplayToSession(sessionId);
          setAttached(true);
          onEvent("Display: attached");
          await show(0);
        })}
      />
      <Btn label="Render current step" disabled={!attached} onPress={safe(() => show(step))} />
      <Btn
        label="Clear"
        disabled={!attached}
        onPress={safe(async () => {
          if (!sessionId) return;
          await clearDisplay(sessionId);
          onEvent("Display: cleared");
        })}
      />
      <Btn
        label="Detach display"
        disabled={!attached}
        onPress={safe(async () => {
          if (!sessionId) return;
          await removeDisplayFromSession(sessionId);
          setAttached(false);
          onEvent("Display: detached");
        })}
      />

      <Text style={styles.note}>
        Taps on the glasses call the closures in this tree. The back gesture (two-finger temple tap)
        ends the display session — watch State go to stopped.
      </Text>
    </Section>
  );
}

const styles = StyleSheet.create({
  preview: {
    backgroundColor: "#000",
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
    gap: 4,
  },
  previewMeta: { color: "#8e8e93", fontSize: 12 },
  previewHeading: { color: "#fff", fontSize: 18, fontWeight: "600" },
  note: { color: "#8e8e93", fontSize: 11, marginTop: 8, lineHeight: 16 },
});
