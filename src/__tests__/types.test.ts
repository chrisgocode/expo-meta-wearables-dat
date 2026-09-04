import type {
  CameraState,
  DeviceSessionErrorCode,
  DeviceType,
  GlassesModel,
  StreamConfiguration,
  StreamError,
  StreamState,
  ThermalLevel,
  VideoCodec,
  StreamSessionError,
  StreamSessionConfig,
  CaptureError,
} from "../EMWDAT.types";

describe("v0.5 type changes", () => {
  it("VideoCodec accepts 'hvc1' and 'raw'", () => {
    const raw: VideoCodec = "raw";
    const hvc1: VideoCodec = "hvc1";
    expect(raw).toBe("raw");
    expect(hvc1).toBe("hvc1");
  });

  it("StreamSessionError includes thermalCritical", () => {
    const error: StreamSessionError = { type: "thermalCritical" };
    expect(error.type).toBe("thermalCritical");
  });

  it("StreamSessionConfig accepts hvc1 codec", () => {
    const config: StreamSessionConfig = {
      videoCodec: "hvc1",
      resolution: "high",
      frameRate: 30,
    };
    expect(config.videoCodec).toBe("hvc1");
  });

  it("CaptureError type values", () => {
    const errors: CaptureError[] = [
      "deviceDisconnected",
      "notStreaming",
      "captureInProgress",
      "captureFailed",
    ];
    expect(errors).toHaveLength(4);
  });
});

describe("v0.9 type changes", () => {
  it("CameraState covers the consolidated camera lifecycle", () => {
    const states: CameraState[] = ["starting", "started", "stopping", "stopped"];
    expect(states).toHaveLength(4);
  });

  it("StreamState covers both platforms", () => {
    const states: StreamState[] = [
      "stopping",
      "stopped",
      "closed",
      "waitingForDevice",
      "starting",
      "started",
      "streaming",
      "paused",
    ];
    expect(states).toHaveLength(8);
  });

  it("StreamError includes photoCaptureFailed (iOS replacement for CaptureError)", () => {
    const error: StreamError = { type: "photoCaptureFailed" };
    expect(error.type).toBe("photoCaptureFailed");
  });

  it("StreamError includes the Android-only cases", () => {
    const errors: StreamError[] = [
      { type: "criticalStreamError" },
      { type: "thermalHot" },
      { type: "batteryLow" },
      { type: "peakPowerLimit" },
    ];
    expect(errors).toHaveLength(4);
  });

  it("DeviceType includes metaGlasses", () => {
    const type: DeviceType = "metaGlasses";
    expect(type).toBe("metaGlasses");
  });

  it("DeviceSessionErrorCode includes the health and DAM cases", () => {
    const codes: DeviceSessionErrorCode[] = [
      "thermalCritical",
      "thermalEmergency",
      "peakPowerShutdown",
      "batteryCritical",
      "datAppOnTheGlassesUpdateRequired",
      "dwaUnavailable",
    ];
    expect(codes).toHaveLength(6);
  });

  it("GlassesModel covers every MockDeviceKit model", () => {
    const models: GlassesModel[] = [
      "rayBanMeta",
      "oakleyMetaHSTN",
      "oakleyMetaVanguard",
      "rayBanMetaOptics",
      "metaGlasses",
    ];
    expect(models).toHaveLength(5);
  });

  it("ThermalLevel matches the SDK enum", () => {
    const levels: ThermalLevel[] = [
      "unknown",
      "none",
      "light",
      "moderate",
      "severe",
      "critical",
      "emergency",
      "shutdown",
    ];
    expect(levels).toHaveLength(8);
  });

  it("StreamConfiguration no longer carries skipAppLaunch (removed in 0.9)", () => {
    const config: StreamConfiguration = {
      videoCodec: "hvc1",
      resolution: "medium",
      frameRate: 24,
      compressVideo: true,
    };
    expect(Object.keys(config)).not.toContain("skipAppLaunch");
  });
});
