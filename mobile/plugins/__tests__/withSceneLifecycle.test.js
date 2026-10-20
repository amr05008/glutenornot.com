const fs = require('fs');
const path = require('path');
const { patchAppDelegate, addSceneManifest } = require('../withSceneLifecycle');

// The AppDelegate.swift that Expo SDK 54's `prebuild` generates for this app.
const TEMPLATE = fs.readFileSync(path.join(__dirname, 'fixtures', 'AppDelegate.sdk54.swift'), 'utf8');

describe('patchAppDelegate', () => {
  const patched = patchAppDelegate(TEMPLATE);

  it('no longer makes a window in didFinishLaunching', () => {
    expect(TEMPLATE).toContain('UIWindow(frame: UIScreen.main.bounds)');
    expect(patched).not.toContain('UIWindow(frame:');
  });

  it('starts React Native once, from a scene-owned window', () => {
    expect(patched.match(/startReactNative\(/g)).toHaveLength(1);
    expect(patched).toContain('class SceneDelegate: UIResponder, UIWindowSceneDelegate');
    expect(patched).toContain('UIWindow(windowScene: windowScene)');
    expect(patched.indexOf('startReactNative(')).toBeGreaterThan(patched.indexOf('class SceneDelegate'));
  });

  it('keeps the AppDelegate window set for code that still reads it', () => {
    expect(patched).toContain('appDelegate.window = window');
  });

  it('hands a launch link to React Native and forwards links to the AppDelegate', () => {
    expect(patched).toContain('launchOptions[.url] = urlContext.url');
    expect(patched).toContain('openURLContexts');
    expect(patched).toContain('appDelegate.application(UIApplication.shared, open: context.url, options: options)');
    expect(patched).toContain('appDelegate?.application(UIApplication.shared, continue: userActivity');
    expect(patched).toContain('connectionOptions.userActivities.forEach');
  });

  it('forwards scene life-cycle events, which UIKit no longer sends the AppDelegate', () => {
    for (const [sceneEvent, appEvent] of [
      ['sceneDidBecomeActive', 'applicationDidBecomeActive'],
      ['sceneWillResignActive', 'applicationWillResignActive'],
      ['sceneWillEnterForeground', 'applicationWillEnterForeground'],
      ['sceneDidEnterBackground', 'applicationDidEnterBackground'],
    ]) {
      expect(patched).toMatch(new RegExp(`func ${sceneEvent}\\(_ scene: UIScene\\) \\{\\n\\s*appDelegate\\?\\.${appEvent}\\(UIApplication\\.shared\\)`));
    }
    expect(patched).toMatch(/func sceneDidDisconnect\(_ scene: UIScene\) \{\n\s*window = nil/);
  });

  it('is idempotent', () => {
    expect(patchAppDelegate(patched)).toBe(patched);
  });

  it('fails the prebuild when the template changes shape', () => {
    const drifted = TEMPLATE.replace('window = UIWindow(frame: UIScreen.main.bounds)', 'window = makeWindow()');
    expect(() => patchAppDelegate(drifted)).toThrow(/startup block/);
    expect(() => patchAppDelegate(TEMPLATE.replace('class ReactNativeDelegate', 'class Other'))).toThrow(
      /ReactNativeDelegate/,
    );
  });
});

describe('addSceneManifest', () => {
  it('declares one non-multiple scene backed by SceneDelegate', () => {
    const plist = addSceneManifest({ CFBundleName: 'GlutenOrNot' });
    expect(plist.CFBundleName).toBe('GlutenOrNot');
    expect(plist.UIApplicationSceneManifest).toEqual({
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    });
  });
});
