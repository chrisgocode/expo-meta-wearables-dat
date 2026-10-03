import {
  addInputsToSession,
  addListener,
  addSpeechToSession,
  configure,
  createSession,
  enableMockDeviceKit,
  getDevice,
  getPendingVoiceInvocations,
  mockDeviceDon,
  mockDevicePowerOn,
  mockDeviceSimulate,
  mockDeviceUnfold,
  pairMockDevice,
  respondToVoiceInvocation,
  startSession,
  startVoiceInvocations,
  stopSession,
  stopVoiceInvocations,
  unpairMockDevice,
} from "@chrisgocode/expo-meta-wearables-dat";

/** Runnable native integration check; uses the SDK's mock services, not JS mocks. */
export async function runDATSmokeCheck(): Promise<void> {
  const subscriptions: ({ remove(): void } | null)[] = [];
  let deviceId: string | undefined;
  let sessionId: string | undefined;
  let sessionStarted = false;
  let inputsActive = false;
  let speechStarted = false;
  let inputDelivered = false;
  let speechDelivered = false;
  let batteryDelivered = false;
  let voiceDelivered = false;
  const wait = async (ready: () => boolean | Promise<boolean>, label: string) => {
    const deadline = Date.now() + 10000;
    while (!(await ready())) {
      if (Date.now() > deadline) throw new Error(`DAT smoke check timed out: ${label}`);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  };
  const expectRejected = async (operation: () => Promise<unknown>) => {
    try {
      await operation();
    } catch {
      return;
    }
    throw new Error("DAT accepted a duplicate capability or voice response");
  };
  try {
    await configure();
    await enableMockDeviceKit();
    deviceId = await pairMockDevice();
    subscriptions.push(
      addListener("onDeviceSessionStateChange", (event) => {
        if (event.sessionId === sessionId && event.state === "started") sessionStarted = true;
      }),
      addListener("onExperimentalCapabilityStateChange", (event) => {
        if (event.sessionId !== sessionId) return;
        if (event.capability === "inputs" && event.state === "active") inputsActive = true;
        if (event.capability === "speech" && event.state === "started") speechStarted = true;
      }),
      addListener("onInputEvent", (event) => {
        if (event.sessionId === sessionId && event.type === "select" && event.source === "captouch")
          inputDelivered = true;
      }),
      addListener("onTranscription", (event) => {
        if (
          event.sessionId === sessionId &&
          event.text === "DAT one point zero" &&
          event.isFinal &&
          event.confidence === 1
        )
          speechDelivered = true;
      }),
      addListener("onDeviceStateChange", (event) => {
        if (event.deviceId === deviceId && event.batteryLevel === 73) batteryDelivered = true;
      }),
      addListener("onVoiceInvocation", (event) => {
        if (event.type === "launchApp") voiceDelivered = true;
      })
    );
    await mockDevicePowerOn(deviceId);
    await mockDeviceUnfold(deviceId);
    await mockDeviceDon(deviceId);
    await wait(
      async () => (await getDevice(deviceId!))?.linkState === "connected",
      "device connection"
    );
    sessionId = await createSession(deviceId);
    await startSession(sessionId);
    await wait(() => sessionStarted, "session start");
    await addInputsToSession(sessionId);
    await addSpeechToSession(sessionId);
    await wait(() => inputsActive && speechStarted, "capabilities ready");
    await expectRejected(() => addInputsToSession(sessionId!));
    await mockDeviceSimulate(deviceId, {
      type: "input",
      event: { type: "select", source: "captouch", timestampMs: Date.now() },
    });
    await mockDeviceSimulate(deviceId, {
      type: "transcription",
      text: "DAT one point zero",
      confidence: 1,
    });
    await mockDeviceSimulate(deviceId, { type: "battery", level: 73 });
    await wait(
      () => inputDelivered && speechDelivered && batteryDelivered,
      "input, speech and battery events"
    );
    await startVoiceInvocations(deviceId);
    await wait(async () => {
      try {
        await mockDeviceSimulate(deviceId!, { type: "launchApp" });
        return true;
      } catch (error) {
        if (String(error).includes("listening first")) return false;
        throw error;
      }
    }, "voice connection");
    await wait(
      async () => voiceDelivered && (await getPendingVoiceInvocations()).length === 1,
      "voice event and pending recovery"
    );
    const [invocation] = await getPendingVoiceInvocations();
    if (!(await respondToVoiceInvocation(invocation.invocationId, true, "Smoke check passed"))) {
      throw new Error("Voice response was not delivered");
    }
    await expectRejected(() => respondToVoiceInvocation(invocation.invocationId, true));
    if ((await getPendingVoiceInvocations()).length !== 0)
      throw new Error("Answered voice request remains pending");
    console.log("DAT_SMOKE_CHECK_PASSED");
  } finally {
    await stopVoiceInvocations();
    if (sessionId) await stopSession(sessionId);
    subscriptions.forEach((subscription) => subscription?.remove());
    if (deviceId) await unpairMockDevice(deviceId);
  }
}
