const xcode = require("xcode");

const withEMWDAT = require("../../plugin/src").default;

function project() {
  const result = xcode.project("App.xcodeproj/project.pbxproj");
  result.hash = {
    project: {
      archiveVersion: 1,
      objectVersion: 54,
      rootObject: "PROJECT",
      objects: {
        PBXProject: { PROJECT: { isa: "PBXProject", targets: [{ value: "APP", comment: "App" }] } },
        PBXNativeTarget: { APP: { isa: "PBXNativeTarget", name: "App", buildPhases: [] } },
        PBXShellScriptBuildPhase: {},
        XCBuildConfiguration: {
          DEBUG: {
            isa: "XCBuildConfiguration",
            buildSettings: { PRODUCT_BUNDLE_IDENTIFIER: "test.app" },
          },
        },
      },
    },
  };
  return result;
}

async function apply(platform, mod, modResults) {
  const config = withEMWDAT({ name: "App", slug: "app" }, { urlScheme: "app" });
  return (
    await config.mods[platform][mod]({
      ...config,
      modResults,
      modRequest: { platform, modName: mod },
    })
  ).modResults;
}

it("incremental prebuild upgrades an existing framework phase once and embeds the new capabilities", async () => {
  const app = project();
  app.addBuildPhase([], "PBXShellScriptBuildPhase", "Embed MWDAT Frameworks", "APP", {
    shellPath: "/bin/sh",
    shellScript: 'FRAMEWORKS=("MWDATCore" "MWDATCamera")',
    inputPaths: [],
    outputPaths: [],
  });
  const first = await apply("ios", "xcodeproj", app);
  const serialized = first.writeSync();
  const second = await apply("ios", "xcodeproj", first);
  expect(second.writeSync()).toBe(serialized);
  const phases = Object.entries(second.hash.project.objects.PBXShellScriptBuildPhase).filter(
    ([key]) => !key.endsWith("_comment")
  );
  expect(phases).toHaveLength(1);
  const phase = phases[0][1];
  const script = JSON.parse(phase.shellScript);
  for (const framework of ["MWDATInputs", "MWDATMotion", "MWDATSpeech"]) {
    expect(script).toContain(`"${framework}"`);
    expect(phase.inputPaths).toContain(`"\${BUILT_PRODUCTS_DIR}/${framework}.framework"`);
    expect(phase.outputPaths).toContain(
      `"\${BUILT_PRODUCTS_DIR}/\${FRAMEWORKS_FOLDER_PATH}/${framework}.framework"`
    );
  }
  expect(
    second.hash.project.objects.XCBuildConfiguration.DEBUG.buildSettings.IPHONEOS_DEPLOYMENT_TARGET
  ).toBe("17.2");
});

it("prebuild removes the old credentialed DAT Maven repository and preserves other repositories", async () => {
  const contents = `allprojects {
    repositories {
      google()
      mavenCentral()
      maven {
        url = uri("https://maven.pkg.github.com/facebook/meta-wearables-dat-android")
        credentials {
          username = System.getenv("GITHUB_ACTOR") ?: ""
          password = System.getenv("GITHUB_TOKEN") ?: "obsolete-token"
        }
      }
      maven { url = uri("https://example.com/repo") }
    }
  }`;
  const first = await apply("android", "projectBuildGradle", { contents, language: "groovy" });
  expect(first.contents).not.toContain("obsolete-token");
  expect(first.contents).not.toContain("maven.pkg.github.com");
  expect(first.contents).toContain("mavenCentral()");
  expect(first.contents).toContain('maven { url = uri("https://example.com/repo") }');
  const second = await apply("android", "projectBuildGradle", first);
  expect(second.contents).toBe(first.contents);
});

it("prebuild enables collision-free SPM project generation after React Native preparation only once", async () => {
  const contents =
    "platform :ios, '17.2'\nprepare_react_native_project!\n\ntarget 'App' do\n  use_expo_modules!\nend\n";
  const first = await apply("ios", "podfile", { contents, language: "ruby" });
  expect(first.contents).toContain(
    "prepare_react_native_project!\n# EMWDAT: prevent CocoaPods UUID collisions when adding SPM products.\ninstall! 'cocoapods', installation_method.last.merge(:deterministic_uuids => true)"
  );
  expect(first.contents).toContain("target 'App' do\n  use_expo_modules!\nend");
  const second = await apply("ios", "podfile", first);
  expect(second.contents).toBe(first.contents);
});

it("gives an iOS app what Meta's DAT 1.0 sample declares: entitlements, local network and background modes", async () => {
  const entitlements = await apply("ios", "entitlements", {
    "keychain-access-groups": ["$(AppIdentifierPrefix)shared"],
  });
  expect(entitlements["com.apple.developer.networking.HotspotConfiguration"]).toBe(true);
  expect(entitlements["com.apple.developer.networking.wifi-info"]).toBe(true);
  expect(entitlements["keychain-access-groups"]).toEqual([
    "$(AppIdentifierPrefix)shared",
    "$(AppIdentifierPrefix)$(CFBundleIdentifier)",
  ]);

  const plist = await apply("ios", "infoPlist", { NSLocalNetworkUsageDescription: "mine" });
  expect(plist.NSLocalNetworkUsageDescription).toBe("mine");
  expect(plist.NSBonjourServices).toEqual(["_bonjour._tcp"]);
  expect(plist.NSBluetoothPeripheralUsageDescription).toBeTruthy();
  expect(plist.UIBackgroundModes).toEqual(
    expect.arrayContaining([
      "processing",
      "bluetooth-central",
      "audio",
      "bluetooth-peripheral",
      "external-accessory",
    ])
  );
});
