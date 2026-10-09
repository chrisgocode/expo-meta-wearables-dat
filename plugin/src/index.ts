import {
  type ConfigPlugin,
  withAndroidManifest,
  withEntitlementsPlist,
  withGradleProperties,
  withInfoPlist,
  withPodfileProperties,
  withPodfile,
  withProjectBuildGradle,
  withXcodeProject,
} from "expo/config-plugins";

type EMWDATPluginProps = {
  /** URL scheme for Meta AI app callback (required). Do not include "://". */
  urlScheme: string;
  /** Meta App ID — omit or use "" for Developer Mode (default). Published apps get a dedicated value from the Wearables Developer Center. */
  metaAppId?: string;
  /** Client Token from Wearables Developer Center (optional for Developer Mode). */
  clientToken?: string;
  /** Custom NSBluetoothAlwaysUsageDescription text */
  bluetoothUsageDescription?: string;
  /** Custom NSLocalNetworkUsageDescription text (iOS): the glasses are also reached over Wi-Fi. */
  localNetworkUsageDescription?: string;
  /** @deprecated DAT 1.0 is on Maven Central; no token is needed. Ignored. */
  githubToken?: string;
  /** Opt out of DAT SDK crash reporting (SDK 0.9+). Default: false. */
  crashReportingOptOut?: boolean;
};

const EMBED_PHASE_NAME = "Embed MWDAT Frameworks";
const FRAMEWORKS = [
  "MWDATCamera",
  "MWDATCore",
  "MWDATDisplay",
  "MWDATMockDevice",
  "MWDATInputs",
  "MWDATMotion",
  "MWDATSpeech",
];

function addUniqueStringToArray(plist: Record<string, any>, key: string, value: string): void {
  const arr: string[] = plist[key] ?? [];
  if (!arr.includes(value)) {
    arr.push(value);
  }
  plist[key] = arr;
}

const withEMWDAT: ConfigPlugin<EMWDATPluginProps> = (config, props) => {
  let urlScheme = props.urlScheme;

  // Strip "://" suffix if present (common mistake)
  if (urlScheme.includes("://")) {
    console.warn(
      `[EMWDAT] urlScheme "${urlScheme}" contains "://". Stripping protocol suffix — only the scheme name is needed (e.g. "myapp", not "myapp://").`
    );
    urlScheme = urlScheme.replace(/:\/\/.*$/, "");
  }

  const metaAppId = props.metaAppId ?? "";
  const bluetoothDescription =
    props.bluetoothUsageDescription ?? "This app uses Bluetooth to connect to Meta Wearables.";

  // =========================================================================
  // iOS Configuration
  // =========================================================================

  // Set iOS deployment target to 17.2 (required by Meta Wearables DAT SDK 0.9+)
  config = withPodfileProperties(config, (config) => {
    config.modResults["ios.deploymentTarget"] = "17.2";
    return config;
  });

  // CocoaPods' sequential allocator can reuse the project UUID after target UUID
  // stabilization when RN adds our SPM products. Deterministic UUIDs avoid this.
  config = withPodfile(config, (config) => {
    const setting =
      "install! 'cocoapods', installation_method.last.merge(:deterministic_uuids => true)";
    if (!config.modResults.contents.includes(setting)) {
      config.modResults.contents = config.modResults.contents.replace(
        /^prepare_react_native_project![ \t]*$/m,
        `prepare_react_native_project!\n# EMWDAT: prevent CocoaPods UUID collisions when adding SPM products.\n${setting}`
      );
    }
    return config;
  });

  // Set deployment target + embed MWDAT dynamic frameworks in the Xcode project
  config = withXcodeProject(config, (config) => {
    const project = config.modResults;

    // Set deployment target on all app-level build configurations
    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const buildSettings = configurations[key].buildSettings;
      if (buildSettings?.PRODUCT_BUNDLE_IDENTIFIER) {
        buildSettings.IPHONEOS_DEPLOYMENT_TARGET = "17.2";
      }
    }

    // Embed the MWDAT dynamic frameworks.
    // The SPM products are linked via spm_dependency in the podspec but CocoaPods
    // doesn't embed them — we add a shell script build phase to copy + sign them.
    const target = project.getFirstTarget().uuid;
    const shellScript = `
FRAMEWORKS=(${FRAMEWORKS.map((fw) => `"${fw}"`).join(" ")})
for fw in "\${FRAMEWORKS[@]}"; do
  SRC="\${BUILT_PRODUCTS_DIR}/\${fw}.framework"
  DST="\${BUILT_PRODUCTS_DIR}/\${FRAMEWORKS_FOLDER_PATH}/\${fw}.framework"
  if [ -d "\${SRC}" ]; then
    mkdir -p "$(dirname "\${DST}")"
    cp -R "\${SRC}" "\${DST}"
    if [ -n "\${EXPANDED_CODE_SIGN_IDENTITY}" ]; then
      codesign --force --sign "\${EXPANDED_CODE_SIGN_IDENTITY}" --preserve-metadata=identifier,entitlements "\${DST}"
    fi
  fi
done
`.trim();

    // Idempotent: `expo prebuild` without `--clean` re-runs this mod against the existing
    // project. Adding the phase again yields "Multiple commands produce ...framework".
    const shellScriptPhases = project.hash?.project?.objects?.PBXShellScriptBuildPhase ?? {};
    const existingPhase = Object.entries(shellScriptPhases).find(
      ([key, phase]: [string, any]) =>
        !key.endsWith("_comment") &&
        typeof phase === "object" &&
        String(phase?.name ?? "").replace(/"/g, "") === EMBED_PHASE_NAME
    );
    const inputPaths = FRAMEWORKS.map((fw) => `"\${BUILT_PRODUCTS_DIR}/${fw}.framework"`);
    const outputPaths = FRAMEWORKS.map(
      (fw) => `"\${BUILT_PRODUCTS_DIR}/\${FRAMEWORKS_FOLDER_PATH}/${fw}.framework"`
    );
    if (existingPhase) {
      const phase = existingPhase[1] as Record<string, any>;
      phase.shellScript = JSON.stringify(shellScript);
      phase.inputPaths = inputPaths;
      phase.outputPaths = outputPaths;
      return config;
    }

    project.addBuildPhase([], "PBXShellScriptBuildPhase", EMBED_PHASE_NAME, target, {
      shellPath: "/bin/sh",
      shellScript,
      inputPaths,
      outputPaths,
    });

    return config;
  });

  config = withInfoPlist(config, (config) => {
    const plist = config.modResults;

    // URL scheme for Meta AI app callback — add to CFBundleURLTypes
    const urlTypes: { CFBundleURLSchemes: string[] }[] = plist.CFBundleURLTypes ?? [];
    const existingSchemes = urlTypes.flatMap((t) => t.CFBundleURLSchemes ?? []);
    if (!existingSchemes.includes(urlScheme)) {
      urlTypes.push({ CFBundleURLSchemes: [urlScheme] });
    }
    plist.CFBundleURLTypes = urlTypes;

    // LSApplicationQueriesSchemes — needed to discover Meta AI app
    addUniqueStringToArray(plist, "LSApplicationQueriesSchemes", "fb-viewapp");

    // UISupportedExternalAccessoryProtocols — wearables communication
    addUniqueStringToArray(plist, "UISupportedExternalAccessoryProtocols", "com.meta.ar.wearable");

    // UIBackgroundModes — the set Meta's DAT 1.0 sample (samples/CameraAccess) declares, plus external-accessory
    for (const mode of [
      "processing",
      "bluetooth-central",
      "audio",
      "bluetooth-peripheral",
      "external-accessory",
    ]) {
      addUniqueStringToArray(plist, "UIBackgroundModes", mode);
    }

    // Bluetooth and local network: required by the sample's "Device Access Toolkit Apps" section.
    plist.NSBluetoothAlwaysUsageDescription = bluetoothDescription;
    plist.NSBluetoothPeripheralUsageDescription ??= bluetoothDescription;
    plist.NSLocalNetworkUsageDescription ??=
      props.localNetworkUsageDescription ??
      "This lets your phone find and connect to your glasses over Wi-Fi.";
    addUniqueStringToArray(plist, "NSBonjourServices", "_bonjour._tcp");

    // MWDAT configuration dictionary
    const mwdatConfig: Record<string, string> = {
      AppLinkURLScheme: `${urlScheme}://`,
      MetaAppID: metaAppId,
      TeamID: "$(DEVELOPMENT_TEAM)",
    };
    if (props.clientToken) {
      mwdatConfig.ClientToken = props.clientToken;
    }
    plist.MWDAT = props.crashReportingOptOut
      ? // SDK 0.9+: MWDAT > CrashReporting > OptOut
        { ...mwdatConfig, CrashReporting: { OptOut: true } }
      : mwdatConfig;

    return config;
  });

  // Entitlements of Meta's DAT 1.0 sample. Without the Wi-Fi ones a registered app with a granted
  // permission still gets `noEligibleDevice` when it creates a session (meta-wearables-dat-ios#239).
  config = withEntitlementsPlist(config, (config) => {
    const entitlements = config.modResults;
    entitlements["com.apple.developer.networking.HotspotConfiguration"] = true;
    entitlements["com.apple.developer.networking.wifi-info"] = true;
    const groups = (entitlements["keychain-access-groups"] as string[] | undefined) ?? [];
    const own = "$(AppIdentifierPrefix)$(CFBundleIdentifier)";
    if (!groups.includes(own)) groups.push(own);
    entitlements["keychain-access-groups"] = groups;
    return config;
  });

  // =========================================================================
  // Android Configuration
  // =========================================================================

  // DAT 1.0 is published to Maven Central, already included by Expo.
  // Remove the repository injected by earlier versions during incremental prebuild.
  config = withProjectBuildGradle(config, (config) => {
    config.modResults.contents = config.modResults.contents.replace(
      /\s*maven\s*\{\s*url\s*=\s*uri\("https:\/\/maven\.pkg\.github\.com\/facebook\/meta-wearables-dat-android"\)[\s\S]*?credentials\s*\{[^}]*\}\s*\}/g,
      ""
    );
    return config;
  });

  // Ensure minSdkVersion meets Meta Wearables DAT SDK requirement (31).
  // Only raises — never lowers an already-higher value.
  config = withGradleProperties(config, (config) => {
    const MIN_SDK_REQUIRED = 31;
    const existing = config.modResults.find(
      (p) => p.type === "property" && p.key === "android.minSdkVersion"
    );
    const current = existing ? parseInt((existing as { value: string }).value, 10) : 0;

    if (current < MIN_SDK_REQUIRED) {
      config.modResults = config.modResults.filter(
        (p) => !(p.type === "property" && p.key === "android.minSdkVersion")
      );
      config.modResults.push({
        type: "property",
        key: "android.minSdkVersion",
        value: String(MIN_SDK_REQUIRED),
      });
    }

    return config;
  });

  // Add Bluetooth permissions, meta-data, and deep link intent-filter to AndroidManifest
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;

    // Add Bluetooth permissions required by the Meta Wearables DAT SDK
    const permissions = manifest.manifest["uses-permission"] ?? [];
    const addPermission = (name: string) => {
      if (!permissions.some((p: any) => p.$?.["android:name"] === name)) {
        permissions.push({ $: { "android:name": name } });
      }
    };
    addPermission("android.permission.INTERNET");
    addPermission("android.permission.BLUETOOTH");
    addPermission("android.permission.BLUETOOTH_CONNECT");
    manifest.manifest["uses-permission"] = permissions;

    const application = manifest.manifest.application?.[0];
    if (!application) return config;

    // Add APPLICATION_ID meta-data
    const metaData = application["meta-data"] ?? [];
    const appIdKey = "com.meta.wearable.mwdat.APPLICATION_ID";
    if (!metaData.some((m: any) => m.$?.["android:name"] === appIdKey)) {
      metaData.push({
        $: {
          "android:name": appIdKey,
          "android:value": metaAppId || "0",
        },
      });
    }

    // Add CLIENT_TOKEN meta-data if provided
    if (props.clientToken) {
      const clientTokenKey = "com.meta.wearable.mwdat.CLIENT_TOKEN";
      if (!metaData.some((m: any) => m.$?.["android:name"] === clientTokenKey)) {
        metaData.push({
          $: {
            "android:name": clientTokenKey,
            "android:value": props.clientToken,
          },
        });
      }
    }

    // Crash-reporting opt-out (SDK 0.9+)
    if (props.crashReportingOptOut) {
      const optOutKey = "com.meta.wearable.mwdat.CRASH_REPORTING_OPT_OUT";
      if (!metaData.some((m: any) => m.$?.["android:name"] === optOutKey)) {
        metaData.push({
          $: {
            "android:name": optOutKey,
            "android:value": "true",
          },
        });
      }
    }

    application["meta-data"] = metaData;

    // Add deep link intent-filter to main activity
    const mainActivity = application.activity?.find(
      (a: any) =>
        a.$?.["android:name"] === ".MainActivity" ||
        a.$?.["android:name"]?.endsWith(".MainActivity")
    );

    if (mainActivity) {
      const intentFilters = mainActivity["intent-filter"] ?? [];
      const hasScheme = intentFilters.some((f: any) =>
        f.data?.some((d: any) => d.$?.["android:scheme"] === urlScheme)
      );

      if (!hasScheme) {
        intentFilters.push({
          action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
          category: [
            { $: { "android:name": "android.intent.category.DEFAULT" } },
            { $: { "android:name": "android.intent.category.BROWSABLE" } },
          ],
          data: [{ $: { "android:scheme": urlScheme } }],
        });
      }

      mainActivity["intent-filter"] = intentFilters;
    }

    return config;
  });

  return config;
};

export default withEMWDAT;
