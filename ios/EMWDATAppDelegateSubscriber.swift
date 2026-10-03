import ExpoModulesCore
import MWDATCore

public class EMWDATAppDelegateSubscriber: ExpoAppDelegateSubscriber {
    public func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        // The delegate returns synchronously; DAT callbacks are handled on MainActor.
        Task { @MainActor in
            _ = await WearablesManager.shared.handleUrl(url)
        }
        return true
    }
}
