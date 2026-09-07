import React from 'react';
import { Alert, AppState, Linking } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

// Only the native methods are mocked. Expo's real hook must cache the initial
// denial until the screen explicitly refreshes it; a mutable permission object
// returned on every render would hide the Settings-return regression.
const mockGetPermission = jest.fn();
const mockRequestPermission = jest.fn();
jest.mock('expo-camera', () => {
  const { createPermissionHook } = jest.requireActual('expo-modules-core');
  const { View } = require('react-native');
  return {
    CameraView: () => <View testID="camera-view" />,
    useCameraPermissions: createPermissionHook({
      getMethod: () => mockGetPermission(),
      requestMethod: () => mockRequestPermission(),
    }),
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: jest.fn(),
}));
jest.mock('../../services/api', () => {
  const actual = jest.requireActual('../../services/api');
  return { ...actual, analyzeImage: jest.fn(), lookupBarcode: jest.fn(), sendFailureBeacon: jest.fn() };
});
jest.mock('../../services/errorReporting', () => ({ reportError: jest.fn() }));
jest.mock('../../services/storage', () => ({
  incrementLifetimeScanCount: jest.fn(),
  addRecentScan: jest.fn(),
}));
jest.mock('../../services/recovery', () => ({
  newRecoveryFlowId: jest.fn(),
  sendRecoveryEvent: jest.fn(),
}));

import CameraScreen from '../index';
import { reportError } from '../../services/errorReporting';

const DENIED = { status: 'denied', granted: false, canAskAgain: false, expires: 'never' };
const GRANTED = { ...DENIED, status: 'granted', granted: true, canAskAgain: true };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPermission.mockReset().mockResolvedValue(DENIED);
  mockRequestPermission.mockReset();
  (AppState as { currentState: string }).currentState = 'active';
  jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation();
});

afterEach(() => jest.restoreAllMocks());

function changeAppState(state: string) {
  const listener = (AppState.addEventListener as jest.Mock).mock.calls.at(-1)![1];
  return act(async () => { listener(state); });
}

async function openSettings() {
  const screen = render(<CameraScreen />);
  await waitFor(() => expect(screen.getByLabelText('Open Settings')).toBeTruthy());
  await act(async () => { fireEvent.press(screen.getByLabelText('Open Settings')); });
  return screen;
}

describe('camera permission lifecycle (real Expo permission hook)', () => {
  it('refreshes on foreground and mounts the camera after granting in Settings, without a restart', async () => {
    const screen = await openSettings();
    await changeAppState('background');
    mockGetPermission.mockResolvedValue(GRANTED);
    // Native status changing cannot mutate the hook's cached denial on its own.
    expect(screen.queryByTestId('camera-view')).toBeNull();
    await changeAppState('active');
    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());
    expect(screen.queryByLabelText('Open Settings')).toBeNull();
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it('keeps Settings and the library option when returning without granting', async () => {
    const screen = await openSettings();
    await changeAppState('background');
    await changeAppState('active');
    expect(mockGetPermission).toHaveBeenCalledTimes(2); // mount + resume
    expect(screen.getByLabelText('Open Settings')).toBeTruthy();
    expect(screen.getByLabelText('Choose a photo instead')).toBeTruthy();
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it('refreshes after inactive too, but ignores duplicate active events', async () => {
    const screen = await openSettings();
    await changeAppState('active');
    expect(mockGetPermission).toHaveBeenCalledTimes(1);
    await changeAppState('inactive');
    mockGetPermission.mockResolvedValue(GRANTED);
    await changeAppState('active');
    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());
    expect(mockGetPermission).toHaveBeenCalledTimes(2);
  });

  it('reports a failed refresh without losing the library fallback', async () => {
    const screen = await openSettings();
    await changeAppState('background');
    const failure = new Error('permission query failed');
    mockGetPermission.mockRejectedValueOnce(failure);
    await changeAppState('active');
    expect(reportError).toHaveBeenCalledWith(failure, { context: 'camera_permission_refresh' });
    expect(screen.getByLabelText('Choose a photo instead')).toBeTruthy();
  });

  it('reports a failed Settings launch and shows actionable, fixed copy', async () => {
    const failure = new Error('SENTINEL_NATIVE_SETTINGS_ERROR');
    (Linking.openSettings as jest.Mock).mockRejectedValueOnce(failure);
    const screen = await openSettings();
    expect(reportError).toHaveBeenCalledWith(failure, { context: 'camera_settings' });
    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't open Settings",
      'Open Settings on your device, find GlutenOrNot, and allow camera access. You can also choose a photo from your library.'
    );
    expect(screen.getByLabelText('Choose a photo instead')).toBeTruthy();
  });
});
