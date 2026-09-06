import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

// --- Mocks ---

const mockTakePictureAsync = jest.fn();
// Tests can suppress the automatic onCameraReady (cameraReadyControl.auto =
// false) and fire it by hand (cameraReadyControl.fire()) to probe the
// pre-ready frame of a freshly (re)mounted camera.
const cameraReadyControl: { auto: boolean; fire: () => void } = {
  auto: true,
  fire: () => {},
};
// Tests can flip this to render the screen with camera permission denied.
const permissionControl = { granted: true };
jest.mock('expo-camera', () => {
  const { forwardRef, useEffect, useImperativeHandle } = require('react');
  const { View } = require('react-native');
  return {
    CameraView: forwardRef(({ onCameraReady, ...props }: any, ref: any) => {
      useEffect(() => {
        cameraReadyControl.fire = () => onCameraReady?.();
        if (cameraReadyControl.auto) onCameraReady?.();
      }, []);
      useImperativeHandle(ref, () => ({
        takePictureAsync: mockTakePictureAsync,
      }));
      return <View testID="camera-view" {...props} />;
    }),
    useCameraPermissions: () => [{ granted: permissionControl.granted }, jest.fn()],
  };
});

jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    useSafeAreaInsets: () => inset,
  };
});

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn().mockResolvedValue({
    base64: 'mock-base64-image-data',
    uri: 'file://mock-manipulated.jpg',
  }),
  SaveFormat: { JPEG: 'jpeg' },
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

const mockPush = jest.fn();
// Focus control: the camera screen stays mounted under Results/Recents, and
// must not scan from under them. Tests blur/refocus it by hand.
const focusControl = {
  focused: true,
  effect: null as null | (() => void | (() => void)),
  cleanup: null as null | void | (() => void),
  blur() {
    if (typeof this.cleanup === 'function') this.cleanup();
    this.cleanup = null;
    this.focused = false;
  },
  focus() {
    this.focused = true;
    this.cleanup = this.effect?.();
  },
};
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(() => {
        focusControl.effect = effect;
        if (focusControl.focused) focusControl.cleanup = effect();
        return () => {
          if (typeof focusControl.cleanup === 'function') focusControl.cleanup();
          focusControl.cleanup = null;
        };
      }, [effect]);
    },
  };
});

let mockFlowSeq = 0;
jest.mock('../../services/recovery', () => ({
  newRecoveryFlowId: jest.fn(() => `flow-${++mockFlowSeq}`),
  sendRecoveryEvent: jest.fn(() => true),
}));

// Keep APIError real, only mock the async functions
jest.mock('../../services/api', () => {
  const actual = jest.requireActual('../../services/api');
  return {
    ...actual,
    analyzeImage: jest.fn(),
    lookupBarcode: jest.fn(),
    sendFailureBeacon: jest.fn(),
  };
});

jest.mock('../../services/errorReporting', () => ({
  reportError: jest.fn(),
}));
jest.mock('../../services/storage', () => ({
  incrementLifetimeScanCount: jest.fn().mockResolvedValue(1),
  addRecentScan: jest.fn().mockResolvedValue(undefined),
}));

import { AppState } from 'react-native';
import CameraScreen from '../index';
import { analyzeImage, lookupBarcode, sendFailureBeacon, APIError } from '../../services/api';
import { addRecentScan, incrementLifetimeScanCount } from '../../services/storage';
import { sendRecoveryEvent } from '../../services/recovery';
import * as ImagePicker from 'expo-image-picker';

const mockAnalyzeImage = analyzeImage as jest.MockedFunction<typeof analyzeImage>;
const mockLookupBarcode = lookupBarcode as jest.MockedFunction<typeof lookupBarcode>;
const mockSendRecoveryEvent = sendRecoveryEvent as jest.Mock;
const mockLaunchLibrary = ImagePicker.launchImageLibraryAsync as jest.MockedFunction<
  typeof ImagePicker.launchImageLibraryAsync
>;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation();
  jest.spyOn(console, 'warn').mockImplementation();
  mockTakePictureAsync.mockResolvedValue({ uri: 'file://test-photo.jpg' });
  cameraReadyControl.auto = true;
  permissionControl.granted = true;
  focusControl.focused = true;
  focusControl.effect = null;
  focusControl.cleanup = null;
  mockFlowSeq = 0;
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('CameraScreen recents integration', () => {
  const SAFE_RESULT = {
    mode: 'label',
    verdict: 'safe',
    flagged_ingredients: [],
    allergen_warnings: [],
    explanation: 'All clear.',
    confidence: 'high',
  };

  it('saves a successful scan to recent history', async () => {
    mockAnalyzeImage.mockResolvedValueOnce(SAFE_RESULT as any);

    const { getByLabelText } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
    expect(addRecentScan).toHaveBeenCalledWith(SAFE_RESULT);
  });

  it('has a Recents button that opens the history screen', async () => {
    const { getByLabelText } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('View recent scans'));
    });

    expect(mockPush).toHaveBeenCalledWith('/recents');
  });
});

describe('CameraScreen torch toggle', () => {
  it('never pre-sets enableTorch on a freshly remounted camera — waits for onCameraReady', async () => {
    // expo-camera has historically fumbled enableTorch applied at mount time
    // on iOS. The torch must reach the camera as a false→true transition on a
    // live camera (the manual-toggle path), never as a mount-time prop.
    mockAnalyzeImage.mockRejectedValueOnce(
      new APIError("Couldn't read the text.", 'ocr_failed')
    );

    const { getByLabelText, getByText, getByTestId } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });
    await waitFor(() => expect(getByText("Couldn't read that")).toBeTruthy());

    // The retry remounts the camera; this one never auto-reports ready
    cameraReadyControl.auto = false;
    await act(async () => {
      fireEvent.press(getByLabelText('Turn on flashlight & retry'));
    });

    // Torch requested, but the camera hasn't called back yet → prop must be off
    expect(getByTestId('camera-view').props.enableTorch).toBe(false);

    // Camera reports ready → still off: on-device testing (1.4.0 TestFlight)
    // showed a transition right at onCameraReady is silently dropped while the
    // native session settles — only a later transition lights the LED.
    await act(async () => {
      cameraReadyControl.fire();
    });
    expect(getByTestId('camera-view').props.enableTorch).toBe(false);

    // After the settle period the torch flips on — same timing profile as a
    // human reaching for the toggle, the path that provably works.
    await act(async () => {
      jest.advanceTimersByTime(750);
    });
    expect(getByTestId('camera-view').props.enableTorch).toBe(true);
  });

  // Pre-release review 2026-07-27 #8: the 2s camera-ready fallback stamps the
  // settle clock when the FALLBACK fires, not when the native session is
  // actually ready. If onCameraReady is merely slow (>2s), the torch was
  // applied against an unsettled session and silently dropped — the exact bug
  // the 1.4.0 settle fix targeted. The late real ready must re-apply the torch
  // as a fresh false→true transition after a full settle window.
  it('re-applies the torch when the real camera-ready arrives after the 2s fallback', async () => {
    mockAnalyzeImage.mockRejectedValueOnce(
      new APIError("Couldn't read the text.", 'ocr_failed')
    );
    const { getByLabelText, getByText, getByTestId } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });
    await waitFor(() => expect(getByText("Couldn't read that")).toBeTruthy());

    // Retry with flashlight; the remounted camera is slow — onCameraReady
    // does not fire before the 2s fallback forces readiness
    cameraReadyControl.auto = false;
    await act(async () => {
      fireEvent.press(getByLabelText('Turn on flashlight & retry'));
    });
    await act(async () => {
      jest.advanceTimersByTime(2000); // fallback forces cameraReady
    });
    await act(async () => {
      jest.advanceTimersByTime(750); // settle window measured from the fallback
    });

    // The real ready arrives now — everything applied so far may have been
    // dropped by the unsettled session, so the torch must go through a fresh
    // false→true transition timed from THIS instant
    await act(async () => {
      cameraReadyControl.fire();
    });
    expect(getByTestId('camera-view').props.enableTorch).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(750);
    });
    expect(getByTestId('camera-view').props.enableTorch).toBe(true);
  });

  it('starts with the torch off and toggles it from the overlay button', async () => {
    const { getByLabelText, getByTestId } = render(<CameraScreen />);

    expect(getByTestId('camera-view').props.enableTorch).toBe(false);

    // Let the camera session settle past the window — a manual toggle on a
    // long-running camera must apply immediately, with no settle lag.
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.press(getByLabelText('Turn on flashlight'));
    });
    expect(getByTestId('camera-view').props.enableTorch).toBe(true);

    await act(async () => {
      fireEvent.press(getByLabelText('Turn off flashlight'));
    });
    expect(getByTestId('camera-view').props.enableTorch).toBe(false);
  });
});

describe('CameraScreen error flow', () => {
  it('shows the "Couldn\'t read" state screen after a failed OCR scan', async () => {
    mockAnalyzeImage.mockRejectedValueOnce(
      new APIError("Couldn't read the text. Try getting the ingredients or menu in focus.", 'ocr_failed')
    );

    const { getByLabelText, getByText } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });

    await waitFor(() => {
      expect(getByText("Couldn't read that")).toBeTruthy();
    });
  });

  it('uses the state screen (not Alert) for OCR errors', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockAnalyzeImage.mockRejectedValueOnce(
      new APIError("Couldn't read the text.", 'ocr_failed')
    );

    const { getByLabelText, getByText } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });

    await waitFor(() => {
      expect(getByText("Couldn't read that")).toBeTruthy();
    });

    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('"Turn on flashlight & retry" returns to the camera with the torch on', async () => {
    mockAnalyzeImage.mockRejectedValueOnce(
      new APIError("Couldn't read the text.", 'ocr_failed')
    );

    const { getByLabelText, getByText, getByTestId, queryByText } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });

    await waitFor(() => {
      expect(getByText("Couldn't read that")).toBeTruthy();
    });

    // Primary action pre-enables the torch for the retry (dim light is the
    // likeliest cause of an unreadable label)
    await act(async () => {
      fireEvent.press(getByLabelText('Turn on flashlight & retry'));
    });

    // Couldn't-read screen gone, capture controls back
    expect(queryByText("Couldn't read that")).toBeNull();
    expect(getByLabelText('Capture photo of ingredients')).toBeTruthy();

    // Torch reaches the camera after the settle window (see settle test)
    await act(async () => {
      jest.advanceTimersByTime(750);
    });
    expect(getByTestId('camera-view').props.enableTorch).toBe(true);
  });

  it('falls back to "Try again" as primary when the torch is already on', async () => {
    mockAnalyzeImage.mockRejectedValueOnce(
      new APIError("Couldn't read the text.", 'ocr_failed')
    );

    const { getByLabelText, getByText, queryByLabelText } = render(<CameraScreen />);

    // Torch on before scanning
    await act(async () => {
      fireEvent.press(getByLabelText('Turn on flashlight'));
    });

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });

    await waitFor(() => {
      expect(getByText("Couldn't read that")).toBeTruthy();
    });

    // Suggesting the flashlight would be nonsense — it's already on
    expect(queryByLabelText('Turn on flashlight & retry')).toBeNull();
    expect(getByLabelText('Try again')).toBeTruthy();
  });

  it('shows the Offline state screen on a network error', async () => {
    mockAnalyzeImage.mockRejectedValueOnce(
      new APIError('Network error. Please check your connection.', 'network')
    );

    const { getByLabelText, getByText } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });

    await waitFor(() => {
      expect(getByText("You're offline")).toBeTruthy();
    });
  });

  it('keeps the torch state across retakes within a session', async () => {
    mockAnalyzeImage.mockRejectedValue(
      new APIError("Couldn't read the text.", 'ocr_failed')
    );

    const { getByLabelText, getByText, getByTestId } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });
    await waitFor(() => expect(getByText("Couldn't read that")).toBeTruthy());
    await act(async () => {
      fireEvent.press(getByLabelText('Turn on flashlight & retry'));
    });

    // Second failed capture — torch must still be on when the camera returns
    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });
    await waitFor(() => expect(getByText("Couldn't read that")).toBeTruthy());
    await act(async () => {
      fireEvent.press(getByLabelText('Try again'));
    });

    await act(async () => {
      jest.advanceTimersByTime(750);
    });
    expect(getByTestId('camera-view').props.enableTorch).toBe(true);
  });

  // Pre-release review 2026-07-27 #7: the couldn't-read screen is shared by
  // camera captures and photo-library picks, but "Turn on flashlight & retry"
  // is a no-op for a blurry screenshot from the library — and it left the torch
  // on afterwards. Library-sourced failures get a plain "Try again" that never
  // touches the torch.
  describe('couldn\'t-read screen for photo-library picks', () => {
    beforeEach(() => {
      mockLaunchLibrary.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file://picked.jpg' }],
      } as any);
      mockAnalyzeImage.mockRejectedValue(
        new APIError("Couldn't read the text.", 'ocr_failed')
      );
    });

    it('offers a plain "Try again" instead of the flashlight retry', async () => {
      const { getByLabelText, getByText, queryByLabelText } = render(<CameraScreen />);

      await act(async () => {
        fireEvent.press(getByLabelText('Upload photo from library'));
      });
      await waitFor(() => expect(getByText("Couldn't read that")).toBeTruthy());

      expect(queryByLabelText('Turn on flashlight & retry')).toBeNull();
      expect(getByLabelText('Try again')).toBeTruthy();
    });

    it('"Try again" does not turn the torch on', async () => {
      const { getByLabelText, getByText, getByTestId } = render(<CameraScreen />);

      await act(async () => {
        fireEvent.press(getByLabelText('Upload photo from library'));
      });
      await waitFor(() => expect(getByText("Couldn't read that")).toBeTruthy());

      await act(async () => {
        fireEvent.press(getByLabelText('Try again'));
      });
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(getByTestId('camera-view').props.enableTorch).toBe(false);
    });

    it('a later camera-capture failure still offers the flashlight retry', async () => {
      const { getByLabelText, getByText } = render(<CameraScreen />);

      // First: a failed library pick
      await act(async () => {
        fireEvent.press(getByLabelText('Upload photo from library'));
      });
      await waitFor(() => expect(getByText("Couldn't read that")).toBeTruthy());
      await act(async () => {
        fireEvent.press(getByLabelText('Try again'));
      });

      // Then: a failed camera capture — dim light is plausible again
      await act(async () => {
        fireEvent.press(getByLabelText('Capture photo of ingredients'));
      });
      await waitFor(() => expect(getByText("Couldn't read that")).toBeTruthy());
      expect(getByLabelText('Turn on flashlight & retry')).toBeTruthy();
    });
  });

  // Pre-release review 2026-07-27 #3: the permission gate rendered before the
  // isAnalyzing/systemState branches, so a user who denied camera access and
  // scanned via the photo picker saw the frozen permission screen for the whole
  // analysis, and error states were set but never rendered.
  describe('with camera permission denied (photo-picker scans)', () => {
    beforeEach(() => {
      permissionControl.granted = false;
    });

    it('shows the analyzing spinner while a picked photo is processed', async () => {
      mockLaunchLibrary.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file://picked.jpg' }],
      } as any);
      let resolveAnalyze: (r: any) => void = () => {};
      mockAnalyzeImage.mockReturnValueOnce(new Promise((r) => { resolveAnalyze = r; }) as any);

      const { getByLabelText, getByText } = render(<CameraScreen />);

      await act(async () => {
        fireEvent.press(getByLabelText('Choose a photo instead'));
      });

      // Honest from t=0: nothing has been read until the upload lands.
      expect(getByText('Uploading photo…')).toBeTruthy();

      await act(async () => {
        resolveAnalyze({
          mode: 'label',
          verdict: 'safe',
          flagged_ingredients: [],
          allergen_warnings: [],
          explanation: 'All clear.',
          confidence: 'high',
        });
      });
    });

    describe('upload progress (plans/weak-signal-upload-2026-08-28.md)', () => {
      // On 2-bar LTE the 500 KB upload is 10–45 s during which the old screen
      // said "Reading ingredients…" and, at 30 s, told the user to cancel and
      // restart the very upload that was about to land.
      function startPickedScan() {
        mockLaunchLibrary.mockResolvedValueOnce({
          canceled: false,
          assets: [{ uri: 'file://picked.jpg' }],
        } as any);
        mockAnalyzeImage.mockReturnValueOnce(new Promise(() => {}) as any); // never settles
      }

      function reportProgress(progress: { phase: 'uploading'; pct: number } | { phase: 'reading' }) {
        const onProgress = mockAnalyzeImage.mock.calls[0][2]!;
        act(() => {
          onProgress(progress);
        });
      }

      it('shows the upload percentage, then "Reading ingredients…" once the body is sent', async () => {
        startPickedScan();
        const { getByLabelText, getByText } = render(<CameraScreen />);
        await act(async () => {
          fireEvent.press(getByLabelText('Choose a photo instead'));
        });

        reportProgress({ phase: 'uploading', pct: 42 });
        expect(getByText('Uploading photo… 42%')).toBeTruthy();

        reportProgress({ phase: 'reading' });
        expect(getByText('Reading ingredients…')).toBeTruthy();
      });

      it('at 30 s while still uploading, says so instead of telling the user to restart', async () => {
        startPickedScan();
        const { getByLabelText, getByText, queryByText } = render(<CameraScreen />);
        await act(async () => {
          fireEvent.press(getByLabelText('Choose a photo instead'));
        });
        reportProgress({ phase: 'uploading', pct: 30 });

        act(() => {
          jest.advanceTimersByTime(30000);
        });
        expect(getByText('Slow connection — still uploading. Hang tight or move to better signal.')).toBeTruthy();

        // The upload lands at 35 s. The slow clock must restart with the phase:
        // showing "cancel and try again" the instant a long upload completes
        // would throw away that upload — the /grill finding on the first cut.
        act(() => {
          jest.advanceTimersByTime(5000);
        });
        reportProgress({ phase: 'reading' });
        expect(getByText('Reading ingredients…')).toBeTruthy();
        expect(queryByText(/taking longer than usual/)).toBeNull();

        // A server leg over 20 s is abnormal (estimate 7–13 s) — only then
        // does the reading-phase slow copy appear, and it doesn't prescribe.
        act(() => {
          jest.advanceTimersByTime(19999);
        });
        expect(queryByText(/taking longer than usual/)).toBeNull();
        act(() => {
          jest.advanceTimersByTime(1);
        });
        expect(getByText('Still working — this is taking longer than usual. You can keep waiting, or cancel and try again.')).toBeTruthy();
      });

      it('Cancel during the upload beacons "cancelled" with the wait, and returns to the camera', async () => {
        // Before this, a cancel was an AbortError the screen dropped before
        // Sentry or the beacon — the field incident's two failed attempts left
        // no trace anywhere.
        startPickedScan();
        const { getByLabelText, queryByText } = render(<CameraScreen />);
        await act(async () => {
          fireEvent.press(getByLabelText('Choose a photo instead'));
        });
        reportProgress({ phase: 'uploading', pct: 20 });
        act(() => {
          jest.advanceTimersByTime(12000);
        });

        await act(async () => {
          fireEvent.press(getByLabelText('Cancel scan'));
        });

        expect(sendFailureBeacon).toHaveBeenCalledTimes(1);
        const [method, reason, elapsed] = (sendFailureBeacon as jest.Mock).mock.calls[0];
        expect(method).toBe('ocr');
        expect(reason).toBe('cancelled');
        expect(elapsed).toBeGreaterThanOrEqual(12000);
        expect(elapsed).toBeLessThan(13000);
        expect(queryByText(/Uploading photo/)).toBeNull();
      });

      function appStateListener() {
        return (AppState.addEventListener as jest.Mock).mock.calls.find(([evt]) => evt === 'change')![1];
      }

      it('going to the background mid-scan beacons "interrupted" (no elapsed) at that moment — not on resume', async () => {
        // iOS suspends the process seconds after backgrounding. Aborting on
        // *resume* (the old behavior) raced the dead socket's error and the 60 s
        // timer, so the same event could land as network / timeout / interrupted
        // depending on which reached JS first. The transition TO background is
        // deterministic and precedes both. Recording it as `cancelled` would
        // contaminate "the user gave up", and its wall-clock includes time asleep.
        (AppState as any).currentState = 'active';
        startPickedScan();
        const { getByLabelText } = render(<CameraScreen />);
        await act(async () => {
          fireEvent.press(getByLabelText('Choose a photo instead'));
        });
        reportProgress({ phase: 'uploading', pct: 50 });

        const onChange = appStateListener();
        await act(async () => {
          onChange('background');
        });
        expect(sendFailureBeacon).toHaveBeenCalledTimes(1);
        expect((sendFailureBeacon as jest.Mock).mock.calls[0]).toEqual(['ocr', 'interrupted']);

        await act(async () => {
          onChange('active');
        });
        expect(sendFailureBeacon).toHaveBeenCalledTimes(1); // resume adds nothing
      });

      it('a transient "inactive" (Notification Center, an incoming call banner) does not kill the scan', async () => {
        (AppState as any).currentState = 'active';
        startPickedScan();
        const { getByLabelText, getByText } = render(<CameraScreen />);
        await act(async () => {
          fireEvent.press(getByLabelText('Choose a photo instead'));
        });
        reportProgress({ phase: 'uploading', pct: 50 });

        const onChange = appStateListener();
        await act(async () => {
          onChange('inactive');
          onChange('active');
        });

        expect(sendFailureBeacon).not.toHaveBeenCalled();
        expect(getByText('Uploading photo… 50%')).toBeTruthy(); // still scanning
      });

      it('Cancel while the photo is still being resized still aborts the scan — the request must not go out afterwards', async () => {
        // Between the spinner appearing and the request going out there is a
        // resize+compress step (hundreds of ms on a 12 MP capture). A cancel in
        // that window used to find no controller: nothing aborted, nothing
        // beaconed, and the request went out anyway — then the result screen
        // pushed itself over the camera while the user framed the next shot.
        mockLaunchLibrary.mockResolvedValueOnce({
          canceled: false,
          assets: [{ uri: 'file://picked.jpg' }],
        } as any);
        const ImageManipulator = require('expo-image-manipulator');
        let resolveManipulate: (v: any) => void = () => {};
        (ImageManipulator.manipulateAsync as jest.Mock).mockReturnValueOnce(
          new Promise((r) => {
            resolveManipulate = r;
          })
        );
        // Behave like the real analyzeImage: an already-aborted signal is honored.
        mockAnalyzeImage.mockImplementationOnce(async (_img: string, signal?: AbortSignal) => {
          if (signal?.aborted) {
            const e = new Error('Aborted');
            e.name = 'AbortError';
            throw e;
          }
          return { mode: 'label', verdict: 'safe', flagged_ingredients: [], allergen_warnings: [], explanation: '', confidence: 'high' } as any;
        });

        const { getByLabelText } = render(<CameraScreen />);
        await act(async () => {
          fireEvent.press(getByLabelText('Choose a photo instead'));
        });
        await act(async () => {
          fireEvent.press(getByLabelText('Cancel scan'));
        });
        await act(async () => {
          resolveManipulate({ base64: 'mock-base64-image-data', uri: 'file://m.jpg' });
        });

        expect(sendFailureBeacon).toHaveBeenCalledTimes(1);
        expect((sendFailureBeacon as jest.Mock).mock.calls[0].slice(0, 2)).toEqual(['ocr', 'cancelled']);
        expect(mockPush).not.toHaveBeenCalled();
        // Either the request was never made, or it was made with an aborted signal.
        for (const call of mockAnalyzeImage.mock.calls) expect(call[1]?.aborted).toBe(true);
      });

      it('encodes the photo at 1024px / JPEG 0.6 — the Phase B measurement, not a guess', async () => {
        // 9 real labels through Vision (plan B1, 2026-08-28): 0.6 reads the
        // same text as 0.7 for ~15% fewer bytes; 0.5 lost 5.1% on the densest
        // label. Change the number only with a new table.
        startPickedScan();
        const { getByLabelText } = render(<CameraScreen />);
        await act(async () => {
          fireEvent.press(getByLabelText('Choose a photo instead'));
        });
        const ImageManipulator = require('expo-image-manipulator');
        expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
          'file://picked.jpg',
          [{ resize: { width: 1024 } }],
          expect.objectContaining({ compress: 0.6, base64: true })
        );
      });

      it('a scan that completes normally beacons nothing', async () => {
        mockLaunchLibrary.mockResolvedValueOnce({
          canceled: false,
          assets: [{ uri: 'file://picked.jpg' }],
        } as any);
        mockAnalyzeImage.mockResolvedValueOnce({
          mode: 'label',
          verdict: 'safe',
          flagged_ingredients: [],
          allergen_warnings: [],
          explanation: 'All clear.',
          confidence: 'high',
        } as any);
        const { getByLabelText } = render(<CameraScreen />);
        await act(async () => {
          fireEvent.press(getByLabelText('Choose a photo instead'));
        });
        expect(sendFailureBeacon).not.toHaveBeenCalled();
      });
    });

    it("shows the couldn't-read screen when a picked photo fails OCR", async () => {
      mockLaunchLibrary.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file://picked.jpg' }],
      } as any);
      mockAnalyzeImage.mockRejectedValueOnce(
        new APIError("Couldn't read the text.", 'ocr_failed')
      );

      const { getByLabelText, getByText } = render(<CameraScreen />);

      await act(async () => {
        fireEvent.press(getByLabelText('Choose a photo instead'));
      });

      await waitFor(() => {
        expect(getByText("Couldn't read that")).toBeTruthy();
      });
    });

    it('shows the offline screen when a picked photo hits a network error', async () => {
      mockLaunchLibrary.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file://picked.jpg' }],
      } as any);
      mockAnalyzeImage.mockRejectedValueOnce(
        new APIError('Network error. Please check your connection.', 'network')
      );

      const { getByLabelText, getByText } = render(<CameraScreen />);

      await act(async () => {
        fireEvent.press(getByLabelText('Choose a photo instead'));
      });

      await waitFor(() => {
        expect(getByText("You're offline")).toBeTruthy();
      });
    });
  });

  it('"Choose a photo instead" opens the image picker', async () => {
    mockAnalyzeImage.mockRejectedValueOnce(
      new APIError("Couldn't read the text.", 'ocr_failed')
    );
    mockLaunchLibrary.mockResolvedValueOnce({ canceled: true } as any);

    const { getByLabelText, getByText } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });

    await waitFor(() => {
      expect(getByText("Couldn't read that")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByLabelText('Choose a photo instead'));
    });

    expect(mockLaunchLibrary).toHaveBeenCalled();
  });
});

describe('barcode recovery (plans/barcode-recovery-2026-09-05.md)', () => {
  // A barcode that comes up empty — 404 not_found, or a 200 the server marked
  // result_reason: missing_context — used to be a toast or an amber verdict.
  // Both are now a persistent neutral state that leads to a photo-only camera.
  const BARCODE = '7311041088219';
  const SENTINEL_NAME = 'SENTINEL Ostrahagen Crispbread';
  const MISSING_CONTEXT = {
    mode: 'label',
    verdict: 'caution',
    flagged_ingredients: [],
    allergen_warnings: [],
    explanation: `Found "${SENTINEL_NAME}" but no ingredient data is available.`,
    confidence: 'low',
    product_name: SENTINEL_NAME,
    barcode: BARCODE,
    data_source: 'openfoodfacts',
    result_reason: 'missing_context',
  } as const;
  const UNMARKED_CAUTION = {
    mode: 'label',
    verdict: 'caution',
    flagged_ingredients: ['natural flavors'],
    allergen_warnings: [],
    explanation: 'Ambiguous ingredient.',
    confidence: 'low',
    product_name: SENTINEL_NAME,
    barcode: BARCODE,
  } as const;
  const LABEL_RESULT = {
    mode: 'label',
    verdict: 'unsafe',
    flagged_ingredients: ['wheat flour'],
    allergen_warnings: [],
    explanation: 'Contains wheat.',
    confidence: 'high',
  } as const;

  async function scan(getByTestId: any, code = BARCODE) {
    await act(async () => {
      await getByTestId('camera-view').props.onBarcodeScanned({ data: code, type: 'ean13' });
    });
  }

  function recoveryEvents(stage?: string) {
    return mockSendRecoveryEvent.mock.calls.filter((c: any[]) => !stage || c[2] === stage);
  }

  describe('entering recovery', () => {
    it('a 404 not_found lands on the persistent "Product not found" state — no toast, no result, no history', async () => {
      mockLookupBarcode.mockRejectedValueOnce(new APIError('Product not found', 'not_found'));
      const { getByTestId, getByText, queryByText, getByLabelText } = render(<CameraScreen />);

      await scan(getByTestId);

      expect(getByText('Product not found')).toBeTruthy();
      expect(getByLabelText('Scan ingredient label')).toBeTruthy();
      expect(getByLabelText('Scan another product')).toBeTruthy();
      expect(mockPush).not.toHaveBeenCalled();
      expect(addRecentScan).not.toHaveBeenCalled();
      expect(incrementLifetimeScanCount).not.toHaveBeenCalled();
    });

    it('a marked missing_context 200 lands on "Not enough information" with the product identity, and is not saved or counted', async () => {
      mockLookupBarcode.mockResolvedValueOnce(MISSING_CONTEXT as any);
      const { getByTestId, getByText, queryByText } = render(<CameraScreen />);

      await scan(getByTestId);

      expect(getByText('Not enough information')).toBeTruthy();
      expect(getByText(SENTINEL_NAME)).toBeTruthy();
      expect(getByText('BARCODE · 7 311041 088219')).toBeTruthy();
      // Missing information is not a verdict
      expect(queryByText('Caution')).toBeNull();
      expect(mockPush).not.toHaveBeenCalled();
      expect(addRecentScan).not.toHaveBeenCalled();
      expect(incrementLifetimeScanCount).not.toHaveBeenCalled();
    });

    it('a missing_context response without a product name still shows the state, just without the name line', async () => {
      mockLookupBarcode.mockResolvedValueOnce({ ...MISSING_CONTEXT, product_name: null } as any);
      const { getByTestId, getByText, queryByText } = render(<CameraScreen />);
      await scan(getByTestId);
      expect(getByText('Not enough information')).toBeTruthy();
      expect(queryByText(SENTINEL_NAME)).toBeNull();
    });

    it('an unmarked low-confidence caution is a normal result — never reinterpreted as missing data', async () => {
      mockLookupBarcode.mockResolvedValueOnce(UNMARKED_CAUTION as any);
      const { getByTestId, queryByText } = render(<CameraScreen />);

      await scan(getByTestId);

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(addRecentScan).toHaveBeenCalledWith(UNMARKED_CAUTION);
      expect(queryByText('Not enough information')).toBeNull();
      expect(queryByText('Product not found')).toBeNull();
      expect(mockSendRecoveryEvent).not.toHaveBeenCalled();
      // No recovery metadata rides along on a normal result
      expect(mockPush.mock.calls[0][0].params).not.toHaveProperty('recoveryFlowId');
    });

    it('beacons `shown` once per flow with a fresh flow ID — and nothing about the product', async () => {
      mockLookupBarcode.mockResolvedValueOnce(MISSING_CONTEXT as any);
      const { getByTestId, rerender } = render(<CameraScreen />);

      await scan(getByTestId);
      rerender(<CameraScreen />);

      expect(recoveryEvents('shown')).toHaveLength(1);
      expect(recoveryEvents('shown')[0]).toEqual(['flow-1', 'missing_context', 'shown']);
      expect(JSON.stringify(mockSendRecoveryEvent.mock.calls)).not.toContain('SENTINEL');
      expect(JSON.stringify(mockSendRecoveryEvent.mock.calls)).not.toContain(BARCODE);
    });

    it('a queued barcode callback arriving after recovery began does nothing', async () => {
      // expo-camera can deliver a callback that was already in flight when the
      // prop was unset. The handler must guard on its own, not just via the prop.
      mockLookupBarcode.mockRejectedValueOnce(new APIError('Product not found', 'not_found'));
      const { getByTestId, getByText } = render(<CameraScreen />);
      const staleHandler = getByTestId('camera-view').props.onBarcodeScanned;

      await scan(getByTestId);
      expect(getByText('Product not found')).toBeTruthy();

      await act(async () => {
        await staleHandler({ data: '0012345678905', type: 'upc_a' });
      });
      expect(mockLookupBarcode).toHaveBeenCalledTimes(1);
      expect(recoveryEvents('shown')).toHaveLength(1);
    });
  });

  describe('photo-only capture', () => {
    async function enterCapture(reject = true) {
      if (reject) mockLookupBarcode.mockRejectedValueOnce(new APIError('Product not found', 'not_found'));
      else mockLookupBarcode.mockResolvedValueOnce(MISSING_CONTEXT as any);
      const utils = render(<CameraScreen />);
      await scan(utils.getByTestId);
      await act(async () => {
        fireEvent.press(utils.getByLabelText('Scan ingredient label'));
      });
      return utils;
    }

    it('"Scan ingredient label" opens the camera with barcode detection off and the approved copy', async () => {
      const { getByText, getByTestId, getByLabelText, queryByText } = await enterCapture();

      expect(getByText('PHOTO ONLY')).toBeTruthy();
      expect(getByText('Scan the ingredient label')).toBeTruthy();
      expect(getByText('Include the ingredient list and allergen statement, then tap the capture button.')).toBeTruthy();
      expect(queryByText('Point at a label, menu, or barcode')).toBeNull();
      expect(getByTestId('camera-view').props.onBarcodeScanned).toBeUndefined();
      // Shipped control positions preserved: torch, library, shutter, Recents
      expect(getByLabelText('Turn on flashlight')).toBeTruthy();
      expect(getByLabelText('Upload photo from library')).toBeTruthy();
      expect(getByLabelText('Capture photo of the ingredient label')).toBeTruthy();
      expect(getByLabelText('View recent scans')).toBeTruthy();
      expect(getByLabelText('Scan another product')).toBeTruthy();
      // Merely opening the camera is not a photo start
      expect(recoveryEvents('photo_started')).toHaveLength(0);
    });

    it('barcode detection stays off through the whole flow — the re-arm timer must not turn it back on', async () => {
      const { getByTestId } = await enterCapture();
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });
      expect(getByTestId('camera-view').props.onBarcodeScanned).toBeUndefined();
    });

    it('the shutter beacons photo_started (camera), and the result carries the flow to the result screen', async () => {
      mockAnalyzeImage.mockResolvedValueOnce(LABEL_RESULT as any);
      const { getByLabelText } = await enterCapture();

      await act(async () => {
        fireEvent.press(getByLabelText('Capture photo of the ingredient label'));
      });
      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));

      expect(recoveryEvents('photo_started')).toEqual([['flow-1', 'not_found', 'photo_started', { source: 'camera' }]]);
      expect(mockPush.mock.calls[0][0].params).toMatchObject({
        recoveryFlowId: 'flow-1',
        recoveryReason: 'not_found',
        result: JSON.stringify(LABEL_RESULT),
      });
      // The recovered result is counted and saved once, as the photo result only
      expect(incrementLifetimeScanCount).toHaveBeenCalledTimes(1);
      expect(addRecentScan).toHaveBeenCalledTimes(1);
      expect(addRecentScan).toHaveBeenCalledWith(LABEL_RESULT);
      // The result screen owns result_displayed — the camera never sends it
      expect(recoveryEvents('result_displayed')).toHaveLength(0);
      expect(recoveryEvents('exited')).toHaveLength(0);
    });

    it('after a completed flow the camera is back to normal capture — Back never lands on the missing-data screen', async () => {
      mockAnalyzeImage.mockResolvedValueOnce(LABEL_RESULT as any);
      const { getByLabelText, getByText, queryByText, getByTestId } = await enterCapture(false);

      await act(async () => {
        fireEvent.press(getByLabelText('Capture photo of the ingredient label'));
      });
      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));

      expect(queryByText('PHOTO ONLY')).toBeNull();
      expect(queryByText('Not enough information')).toBeNull();
      expect(getByText('Point at a label, menu, or barcode')).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      expect(getByTestId('camera-view').props.onBarcodeScanned).toBeDefined();
    });

    it('a completed flow does not attach to the next product', async () => {
      mockAnalyzeImage.mockResolvedValueOnce(LABEL_RESULT as any);
      const { getByLabelText, getByTestId } = await enterCapture();
      await act(async () => {
        fireEvent.press(getByLabelText('Capture photo of the ingredient label'));
      });
      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));

      // Next product: a normal barcode result
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      mockLookupBarcode.mockResolvedValueOnce(UNMARKED_CAUTION as any);
      await scan(getByTestId, '0012345678905');
      expect(mockPush).toHaveBeenCalledTimes(2);
      expect(mockPush.mock.calls[1][0].params).not.toHaveProperty('recoveryFlowId');
      expect(recoveryEvents()).toHaveLength(2); // shown + photo_started only
    });

    it('a library pick beacons photo_started (picker); a picker cancel keeps the flow open and is not an exit', async () => {
      mockLaunchLibrary.mockResolvedValueOnce({ canceled: true } as any);
      const { getByLabelText, getByText } = await enterCapture();

      await act(async () => {
        fireEvent.press(getByLabelText('Upload photo from library'));
      });
      expect(getByText('PHOTO ONLY')).toBeTruthy();
      expect(recoveryEvents('photo_started')).toHaveLength(0);
      expect(recoveryEvents('exited')).toHaveLength(0);

      mockLaunchLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file://picked.jpg' }] } as any);
      mockAnalyzeImage.mockResolvedValueOnce(LABEL_RESULT as any);
      await act(async () => {
        fireEvent.press(getByLabelText('Upload photo from library'));
      });
      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
      expect(recoveryEvents('photo_started')).toEqual([['flow-1', 'not_found', 'photo_started', { source: 'picker' }]]);
    });

    it("couldn't-read keeps recovery intent: Try again returns to photo-only, and the retry beacons photo_started again on the same flow", async () => {
      mockAnalyzeImage.mockRejectedValueOnce(new APIError("Couldn't read", 'ocr_failed'));
      const { getByLabelText, getByText, getByTestId } = await enterCapture();

      await act(async () => {
        fireEvent.press(getByLabelText('Capture photo of the ingredient label'));
      });
      await waitFor(() => expect(getByText("Couldn't read that")).toBeTruthy());
      expect(recoveryEvents('exited')).toHaveLength(0);

      await act(async () => {
        fireEvent.press(getByLabelText('Turn on flashlight & retry'));
      });
      expect(getByText('PHOTO ONLY')).toBeTruthy();
      expect(getByTestId('camera-view').props.onBarcodeScanned).toBeUndefined();

      mockAnalyzeImage.mockResolvedValueOnce(LABEL_RESULT as any);
      await act(async () => {
        fireEvent.press(getByLabelText('Capture photo of the ingredient label'));
      });
      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
      expect(recoveryEvents('photo_started')).toHaveLength(2);
      expect(recoveryEvents('photo_started').every((c: any[]) => c[0] === 'flow-1')).toBe(true);
    });

    it('a library photo that fails to read gets the photo-specific copy and never a flashlight fix', async () => {
      mockLaunchLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file://picked.jpg' }] } as any);
      mockAnalyzeImage.mockRejectedValueOnce(new APIError("Couldn't read", 'ocr_failed'));
      const { getByLabelText, getByText, queryByLabelText } = await enterCapture();

      await act(async () => {
        fireEvent.press(getByLabelText('Upload photo from library'));
      });
      await waitFor(() => expect(getByText("Couldn't read that")).toBeTruthy());
      expect(getByText('The text in that photo was too small or blurry to read. Try a closer photo of the ingredient list.')).toBeTruthy();
      expect(queryByLabelText('Turn on flashlight & retry')).toBeNull();
      expect(getByLabelText('Choose another photo')).toBeTruthy();
    });

    it('offline during the photo keeps recovery: Try again returns to photo-only', async () => {
      mockAnalyzeImage.mockRejectedValueOnce(new APIError('Offline', 'network'));
      const { getByLabelText, getByText } = await enterCapture();
      await act(async () => {
        fireEvent.press(getByLabelText('Capture photo of the ingredient label'));
      });
      await waitFor(() => expect(getByText("You're offline")).toBeTruthy());
      await act(async () => {
        fireEvent.press(getByLabelText('Try again'));
      });
      expect(getByText('PHOTO ONLY')).toBeTruthy();
      expect(recoveryEvents('exited')).toHaveLength(0);
    });

    it('Cancel during analysis returns to photo-only capture, not the prompt and not normal scanning', async () => {
      mockAnalyzeImage.mockReturnValueOnce(new Promise(() => {}) as any);
      const { getByLabelText, getByText, queryByText } = await enterCapture();
      await act(async () => {
        fireEvent.press(getByLabelText('Capture photo of the ingredient label'));
      });
      expect(getByText('Uploading photo…')).toBeTruthy();

      await act(async () => {
        fireEvent.press(getByText('Cancel'));
      });
      expect(getByText('PHOTO ONLY')).toBeTruthy();
      expect(queryByText('Product not found')).toBeNull();
      expect(sendFailureBeacon).toHaveBeenCalledWith('ocr', 'cancelled', expect.any(Number));
      expect(recoveryEvents('exited')).toHaveLength(0);
    });

    it('backgrounding mid-photo drops the request and resumes on a usable photo-only camera — no auto-retry', async () => {
      mockAnalyzeImage.mockReturnValueOnce(new Promise(() => {}) as any);
      const { getByLabelText, getByText } = await enterCapture();
      await act(async () => {
        fireEvent.press(getByLabelText('Capture photo of the ingredient label'));
      });

      const listener = (AppState.addEventListener as jest.Mock).mock.calls.at(-1)[1];
      await act(async () => {
        listener('background');
      });
      await act(async () => {
        listener('active');
      });
      expect(getByText('PHOTO ONLY')).toBeTruthy();
      expect(mockAnalyzeImage).toHaveBeenCalledTimes(1);
      expect(sendFailureBeacon).toHaveBeenCalledWith('ocr', 'interrupted');
    });

    it('with camera permission denied, the library route still works inside recovery', async () => {
      mockLookupBarcode.mockRejectedValueOnce(new APIError('Product not found', 'not_found'));
      const { getByTestId, getByLabelText, getByText } = render(<CameraScreen />);
      await scan(getByTestId);
      permissionControl.granted = false;
      await act(async () => {
        fireEvent.press(getByLabelText('Scan ingredient label'));
      });
      expect(getByText('Camera access')).toBeTruthy();

      mockLaunchLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file://picked.jpg' }] } as any);
      mockAnalyzeImage.mockResolvedValueOnce(LABEL_RESULT as any);
      await act(async () => {
        fireEvent.press(getByLabelText('Choose a photo instead'));
      });
      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
      expect(recoveryEvents('photo_started')).toEqual([['flow-1', 'not_found', 'photo_started', { source: 'picker' }]]);
      expect(mockPush.mock.calls[0][0].params).toMatchObject({ recoveryFlowId: 'flow-1' });
    });
  });

  describe('exiting recovery', () => {
    it('"Scan another product" from the prompt beacons exited and returns to normal scanning', async () => {
      mockLookupBarcode.mockRejectedValueOnce(new APIError('Product not found', 'not_found'));
      const { getByTestId, getByLabelText, getByText, queryByText } = render(<CameraScreen />);
      await scan(getByTestId);

      await act(async () => {
        fireEvent.press(getByLabelText('Scan another product'));
      });

      expect(queryByText('Product not found')).toBeNull();
      expect(getByText('Point at a label, menu, or barcode')).toBeTruthy();
      expect(recoveryEvents('exited')).toEqual([['flow-1', 'not_found', 'exited']]);
    });

    it('the exit pill in photo-only capture does the same', async () => {
      mockLookupBarcode.mockResolvedValueOnce(MISSING_CONTEXT as any);
      const { getByTestId, getByLabelText, getByText, queryByText } = render(<CameraScreen />);
      await scan(getByTestId);
      await act(async () => {
        fireEvent.press(getByLabelText('Scan ingredient label'));
      });
      expect(getByText('PHOTO ONLY')).toBeTruthy();

      await act(async () => {
        fireEvent.press(getByLabelText('Scan another product'));
      });
      expect(queryByText('PHOTO ONLY')).toBeNull();
      expect(getByText('Point at a label, menu, or barcode')).toBeTruthy();
      expect(recoveryEvents('exited')).toEqual([['flow-1', 'missing_context', 'exited']]);
    });

    it('does not immediately reopen on the same barcode: 2 s re-arm, then the dismissed code is silently ignored for 60 s', async () => {
      mockLookupBarcode.mockRejectedValueOnce(new APIError('Product not found', 'not_found'));
      const { getByTestId, getByLabelText, queryByText } = render(<CameraScreen />);
      await scan(getByTestId);
      await act(async () => {
        fireEvent.press(getByLabelText('Scan another product'));
      });

      // Scanner is disarmed for the re-arm window
      expect(getByTestId('camera-view').props.onBarcodeScanned).toBeUndefined();
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      expect(getByTestId('camera-view').props.onBarcodeScanned).toBeDefined();

      // Same code, still in frame: silence — no lookup, no prompt, no toast
      await scan(getByTestId);
      expect(mockLookupBarcode).toHaveBeenCalledTimes(1);
      expect(queryByText('Product not found')).toBeNull();
      expect(recoveryEvents('shown')).toHaveLength(1);

      // A different code works right away
      mockLookupBarcode.mockResolvedValueOnce(UNMARKED_CAUTION as any);
      await scan(getByTestId, '0012345678905');
      expect(mockLookupBarcode).toHaveBeenCalledTimes(2);
      expect(mockPush).toHaveBeenCalledTimes(1);

      // After the TTL the same code is retryable — as a fresh flow
      await act(async () => {
        jest.advanceTimersByTime(60000);
      });
      mockLookupBarcode.mockRejectedValueOnce(new APIError('Product not found', 'not_found'));
      await scan(getByTestId);
      expect(mockLookupBarcode).toHaveBeenCalledTimes(3);
      expect(recoveryEvents('shown')).toEqual([
        ['flow-1', 'not_found', 'shown'],
        ['flow-2', 'not_found', 'shown'],
      ]);
    });

    it('a completed flow suppresses its barcode too — Back with the product still in frame does not reopen the question the photo just answered', async () => {
      mockLookupBarcode.mockResolvedValueOnce(MISSING_CONTEXT as any);
      mockAnalyzeImage.mockResolvedValueOnce(LABEL_RESULT as any);
      const { getByTestId, getByLabelText, queryByText } = render(<CameraScreen />);
      await scan(getByTestId);
      await act(async () => {
        fireEvent.press(getByLabelText('Scan ingredient label'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('Capture photo of the ingredient label'));
      });
      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Same code: no lookup (which would also be a server scan event), no prompt
      await scan(getByTestId);
      expect(mockLookupBarcode).toHaveBeenCalledTimes(1);
      expect(queryByText('Not enough information')).toBeNull();
      expect(recoveryEvents('shown')).toHaveLength(1);

      // A different product scans normally
      mockLookupBarcode.mockResolvedValueOnce(UNMARKED_CAUTION as any);
      await scan(getByTestId, '0012345678905');
      expect(mockLookupBarcode).toHaveBeenCalledTimes(2);
      expect(mockPush).toHaveBeenCalledTimes(2);
    });

    it('an exit within the lookup re-arm window still holds the scanner for the full 2 s', async () => {
      mockLookupBarcode.mockRejectedValueOnce(new APIError('Product not found', 'not_found'));
      const { getByTestId, getByLabelText } = render(<CameraScreen />);
      await scan(getByTestId);
      await act(async () => {
        jest.advanceTimersByTime(1500);
        fireEvent.press(getByLabelText('Scan another product'));
      });
      await act(async () => {
        jest.advanceTimersByTime(1000); // the lookup's own timer would have fired here
      });
      expect(getByTestId('camera-view').props.onBarcodeScanned).toBeUndefined();
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(getByTestId('camera-view').props.onBarcodeScanned).toBeDefined();
    });

    it('opening Recents from photo-only capture exits the flow', async () => {
      mockLookupBarcode.mockRejectedValueOnce(new APIError('Product not found', 'not_found'));
      const { getByTestId, getByLabelText, queryByText } = render(<CameraScreen />);
      await scan(getByTestId);
      await act(async () => {
        fireEvent.press(getByLabelText('Scan ingredient label'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('View recent scans'));
      });
      expect(mockPush).toHaveBeenCalledWith('/recents');
      expect(recoveryEvents('exited')).toEqual([['flow-1', 'not_found', 'exited']]);
      expect(queryByText('PHOTO ONLY')).toBeNull();
    });

    it('Recents outside a flow beacons nothing', async () => {
      const { getByLabelText } = render(<CameraScreen />);
      await act(async () => {
        fireEvent.press(getByLabelText('View recent scans'));
      });
      expect(mockPush).toHaveBeenCalledWith('/recents');
      expect(mockSendRecoveryEvent).not.toHaveBeenCalled();
    });
  });

  describe('stale and unfocused callbacks', () => {
    it('a barcode response that lands after Cancel neither pushes a result nor opens recovery', async () => {
      let resolveLookup: (r: any) => void = () => {};
      mockLookupBarcode.mockReturnValueOnce(new Promise((r) => { resolveLookup = r; }) as any);
      const { getByTestId, getByText, queryByText } = render(<CameraScreen />);

      await act(async () => {
        getByTestId('camera-view').props.onBarcodeScanned({ data: BARCODE, type: 'ean13' });
      });
      expect(getByText(`Looking up barcode ${BARCODE}…`)).toBeTruthy();
      await act(async () => {
        fireEvent.press(getByText('Cancel'));
      });
      expect(sendFailureBeacon).toHaveBeenCalledWith('barcode', 'cancelled', expect.any(Number));

      await act(async () => {
        resolveLookup(MISSING_CONTEXT);
      });
      expect(queryByText('Not enough information')).toBeNull();
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockSendRecoveryEvent).not.toHaveBeenCalled();
    });

    it('a 404 that lands after Cancel does not open the recovery prompt', async () => {
      let rejectLookup: (e: any) => void = () => {};
      mockLookupBarcode.mockReturnValueOnce(new Promise((_, r) => { rejectLookup = r; }) as any);
      const { getByTestId, getByText, queryByText } = render(<CameraScreen />);
      await act(async () => {
        getByTestId('camera-view').props.onBarcodeScanned({ data: BARCODE, type: 'ean13' });
      });
      await act(async () => {
        fireEvent.press(getByText('Cancel'));
      });
      await act(async () => {
        rejectLookup(new APIError('Product not found', 'not_found'));
      });
      expect(queryByText('Product not found')).toBeNull();
      expect(mockSendRecoveryEvent).not.toHaveBeenCalled();
    });

    it('never starts a lookup while the screen is under Results or Recents', async () => {
      const { getByTestId } = render(<CameraScreen />);
      const handler = getByTestId('camera-view').props.onBarcodeScanned;
      expect(handler).toBeDefined();

      await act(async () => {
        focusControl.blur();
      });
      expect(getByTestId('camera-view').props.onBarcodeScanned).toBeUndefined();
      await act(async () => {
        await handler({ data: BARCODE, type: 'ean13' }); // queued callback
      });
      expect(mockLookupBarcode).not.toHaveBeenCalled();

      await act(async () => {
        focusControl.focus();
      });
      expect(getByTestId('camera-view').props.onBarcodeScanned).toBeDefined();
    });
  });
});
