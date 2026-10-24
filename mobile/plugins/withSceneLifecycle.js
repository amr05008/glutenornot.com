// iOS 27 refuses to launch an app built with the iOS 27 SDK unless it uses the
// UIScene life cycle: UIKit traps in _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption
// before the first frame. 1.5.1 build 2 (the first Xcode 27 archive) was rejected
// under 2.1(a) for exactly this on 2026-10-19. Expo SDK 54's template still makes
// its window in didFinishLaunching, so this plugin moves it into a SceneDelegate.
// Remove it with the SDK upgrade: SDK 57 has `ios.enableSceneSupport`
// (expo-build-properties) and SDK 58's template adopts scenes itself.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const STARTUP_BLOCK =
  /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n\s*withModuleName: "main",\n\s*in: window,\n\s*launchOptions: launchOptions\)\n#endif\n/;

const SCENE_DELEGATE_ANCHOR = '\nclass ReactNativeDelegate: ExpoReactNativeFactoryDelegate';

const SCENE_DELEGATE = `
// Owns the window under the UIScene life cycle (plugins/withSceneLifecycle.js),
// after Expo SDK 57's ExpoAppSceneDelegate. UIKit now sends life-cycle events and
// links here instead of the AppDelegate, so they are forwarded to it: that is
// where Expo's subscribers and RCTLinkingManager listen.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var appDelegate: AppDelegate? {
    UIApplication.shared.delegate as? AppDelegate
  }

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
      let appDelegate = appDelegate,
      let factory = appDelegate.reactNativeFactory else {
      return
    }

    // The scene can reconnect in a process that already runs React Native: an
    // iPad window closed and reopened, or a scene iOS discarded in the
    // background. Starting React Native again would start expo-updates'
    // AppController a second time, which traps, so the running root moves over.
    // Known edge, untested: a sheet presented from the old root at disconnect
    // may not survive the move. iOS won't drop a single-scene app's scene on
    // demand, so this path can't be forced on a simulator or a device.
    let runningRootViewController = appDelegate.window?.rootViewController
    appDelegate.window?.rootViewController = nil

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window

    if let rootViewController = runningRootViewController {
      window.rootViewController = rootViewController
      window.makeKeyAndVisible()
    } else {
      // Linking.getInitialURL() reads the launch link from these options.
      var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]
      if let urlContext = connectionOptions.urlContexts.first {
        launchOptions[.url] = urlContext.url
      }
      factory.startReactNative(
        withModuleName: "main",
        in: window,
        launchOptions: launchOptions)
    }

    if !connectionOptions.urlContexts.isEmpty {
      self.scene(scene, openURLContexts: connectionOptions.urlContexts)
    }
    connectionOptions.userActivities.forEach { self.scene(scene, continue: $0) }
  }

  func sceneDidDisconnect(_ scene: UIScene) {
    window = nil
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    appDelegate?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    appDelegate?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    appDelegate?.applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    appDelegate?.applicationDidEnterBackground(UIApplication.shared)
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = appDelegate else {
      return
    }
    for context in URLContexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
      if let sourceApplication = context.options.sourceApplication {
        options[.sourceApplication] = sourceApplication
      }
      if let annotation = context.options.annotation {
        options[.annotation] = annotation
      }
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: options)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = appDelegate?.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

function patchAppDelegate(contents) {
  const hasStartupBlock = STARTUP_BLOCK.test(contents);
  if (contents.includes('class SceneDelegate: UIResponder, UIWindowSceneDelegate')) {
    if (hasStartupBlock) {
      throw new Error('withSceneLifecycle: AppDelegate has a SceneDelegate but still makes its own window.');
    }
    return contents;
  }
  // Throw rather than skip: a template we don't recognize would ship an app
  // that can't launch on iOS 27, and prebuild is the place to find that out.
  if (!hasStartupBlock) {
    throw new Error('withSceneLifecycle: could not find the AppDelegate startup block (window + startReactNative).');
  }
  if (!contents.includes(SCENE_DELEGATE_ANCHOR)) {
    throw new Error('withSceneLifecycle: could not find ReactNativeDelegate to insert SceneDelegate before.');
  }
  return contents
    .replace(STARTUP_BLOCK, '    // SceneDelegate makes the window and starts React Native.\n')
    .replace(SCENE_DELEGATE_ANCHOR, `${SCENE_DELEGATE}${SCENE_DELEGATE_ANCHOR}`);
}

function addSceneManifest(plist) {
  return {
    ...plist,
    UIApplicationSceneManifest: {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    },
  };
}

function withSceneLifecycle(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults = addSceneManifest(cfg.modResults);
    return cfg;
  });
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error(`withSceneLifecycle: expected a Swift AppDelegate, got ${cfg.modResults.language}.`);
    }
    cfg.modResults.contents = patchAppDelegate(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = withSceneLifecycle;
module.exports.patchAppDelegate = patchAppDelegate;
module.exports.addSceneManifest = addSceneManifest;
