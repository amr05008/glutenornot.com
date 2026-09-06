import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useFocusEffect } from 'expo-router';
import { analyzeImage, lookupBarcode, sendFailureBeacon, APIError } from '../services/api';
import { reportError } from '../services/errorReporting';
import { incrementLifetimeScanCount, addRecentScan } from '../services/storage';
import { newRecoveryFlowId, sendRecoveryEvent, RecoveryReason } from '../services/recovery';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Toast } from '../components/Toast';
import { StateScreen } from '../components/StateScreen';
import { BarcodeRecoveryState } from '../components/BarcodeRecoveryState';
import { Icon, Reticle } from '../components/Icon';
import { AnalysisResult, FOOD_BARCODE_TYPES } from '../constants/verdicts';
import { theme } from '../constants/theme';
import { sans, mono } from '../constants/fonts';

type SystemState = 'offline' | 'error' | null;

// Barcode-to-photo recovery (plans/barcode-recovery-2026-09-05.md). One flow
// per barcode dead end: `prompt` is the neutral "Product not found" / "Not
// enough information" state, `capture` is the photo-only camera it leads to.
// Everything here is transient — in memory for the life of this screen, never
// persisted, never sent except as the content-free funnel beacons (`id` +
// `reason` + stage). `barcode` is kept only so an explicit exit can suppress
// the same code for a while; it never leaves the device.
interface RecoveryFlow {
  id: string;
  reason: RecoveryReason;
  barcode: string;
  productName: string | null;
  phase: 'prompt' | 'capture';
}

// When a flow ends — explicit exit, or a photo result — the same barcode is
// usually still in frame. Ignore that one code silently (no toast, no lookup,
// no new flow) for a bounded window so the prompt can't reopen from the frame
// the user just left, and hold the scanner off for a beat after an exit.
// Different codes work after the re-arm; the same code is retryable after
// the TTL. In memory only.
const SCANNER_REARM_MS = 2000;
const DISMISSED_CODE_TTL_MS = 60000;
// A barcode the server just said it doesn't have won't be there a moment
// later — a cached miss reopens the recovery prompt without a lookup. With
// equal TTLs the dismissal window normally outlasts this cache; it is the
// backstop for any path that ends a flow without dismissing the code.
const RECENT_MISS_TTL_MS = 60000;

// Photo-only capture copy (design addendum §2, state C). Names the physical
// action so nobody waits for automatic detection the way they do with barcodes.
const RECOVERY_CAPTURE_COPY = {
  eyebrow: 'PHOTO ONLY',
  title: 'Scan the ingredient label',
  guidance: 'Include the ingredient list and allergen statement, then tap the capture button.',
  exit: 'Scan another product',
};

// How long the native camera session gets to settle before a torch transition
// is trusted to reach the LED (see the torch-application effect).
const TORCH_SETTLE_MS = 750;

// Slow copy, by scan phase (plans/weak-signal-upload-2026-08-28.md). On a weak
// uplink the upload itself is the wait, and restarting it has the same odds —
// so say what is happening instead of prescribing a retry. The slow clock is
// per phase (the spinner is keyed on it): a 35 s upload must not land on a
// "cancel and try again" screen the instant it completes. A server leg over
// 20 s is abnormal (estimate 7–13 s); only then does the reading copy appear,
// and it offers rather than instructs — a retry re-uploads.
const SLOW_UPLOADING_MESSAGE = 'Slow connection — still uploading. Hang tight or move to better signal.';
const SLOW_UPLOADING_THRESHOLD_MS = 30000;
const SLOW_READING_MESSAGE = 'Still working — this is taking longer than usual. You can keep waiting, or cancel and try again.';
const SLOW_READING_THRESHOLD_MS = 20000;

function Wordmark() {
  return (
    <View style={styles.wordmark}>
      <Reticle size={18} color="#fff" stroke={2.1} gap={5} />
      <Text style={styles.wordmarkText}>
        Gluten<Text style={styles.wordmarkSub}> or </Text>Not
      </Text>
    </View>
  );
}

function Corners() {
  return (
    <>
      <View style={[styles.corner, styles.cornerTL]} />
      <View style={[styles.corner, styles.cornerTR]} />
      <View style={[styles.corner, styles.cornerBL]} />
      <View style={[styles.corner, styles.cornerBR]} />
    </>
  );
}

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [systemState, setSystemState] = useState<SystemState>(null);
  const [barcodeScanned, setBarcodeScanned] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Reading ingredients…');
  // Which leg a scan is on, for the 30 s slow copy: while the photo is still
  // uploading, "cancel and retry" is bad advice (it restarts the same upload
  // on the same signal); once the server has the image, a retry is reasonable.
  const [scanPhase, setScanPhase] = useState<'uploading' | 'reading'>('reading');
  // Where the last analyzed photo came from — the couldn't-read screen only
  // offers the flashlight retry for camera captures (a torch can't fix a
  // blurry screenshot from the photo library).
  const [scanSource, setScanSource] = useState<'camera' | 'picker'>('camera');
  // Session-scoped by design: survives retakes and result round-trips (the
  // screen stays mounted under the stack), resets when the app relaunches.
  // `torch` is the user's intent (drives the button); `torchApplied` is what
  // actually reaches CameraView, applied on a settle delay — see below.
  const [torch, setTorch] = useState(false);
  const [torchApplied, setTorchApplied] = useState(false);
  // Bumped each time the native onCameraReady callback actually fires — lets
  // the torch effect re-run when the real ready arrives AFTER the 2s fallback
  // already forced cameraReady (see the torch-application effect).
  const [readySignal, setReadySignal] = useState(0);
  const cameraReadyAtRef = useRef(0);
  const cameraRef = useRef<CameraView>(null);
  const capturingRef = useRef(false);
  // Native shutter/picker promises cannot be aborted. Invalidate their owner
  // on Cancel, exit, blur, or unmount so a late photo cannot start a new scan.
  const photoSelectionRef = useRef<object | null>(null);
  const invalidatePhotoSelection = useCallback(() => {
    photoSelectionRef.current = null;
    capturingRef.current = false;
  }, []);
  const scanningRef = useRef(false);
  const router = useRouter();

  // Recovery flow state, mirrored in a ref: expo-camera can deliver a queued
  // barcode callback after the UI has already moved on, so the handler guards
  // on the ref (synchronous truth), not just on the prop being unset.
  const [recovery, setRecovery] = useState<RecoveryFlow | null>(null);
  const recoveryRef = useRef<RecoveryFlow | null>(null);
  const setRecoveryFlow = useCallback((flow: RecoveryFlow | null) => {
    recoveryRef.current = flow;
    setRecovery(flow);
  }, []);
  // Suppressed codes (dismissed or just answered) → their expiry timer.
  const dismissedCodes = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // The post-lookup scanner re-arm, so an exit can replace it with its own.
  const rearmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Is this screen the focused route? The camera stays mounted under Results
  // and Recents; a barcode must never start a lookup from under them.
  const [isFocused, setIsFocused] = useState(true);
  const focusedRef = useRef(true);
  // Every timer this screen sets, so unmount can clear them — a stale timer
  // must not re-arm the scanner or touch state on a screen that's gone.
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const after = useCallback((ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timersRef.current.delete(t);
      fn();
    }, ms);
    timersRef.current.add(t);
    return t;
  }, []);
  useEffect(() => {
    const timers = timersRef.current;
    const dismissed = dismissedCodes.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
      dismissed.forEach(clearTimeout);
      dismissed.clear();
    };
  }, []);

  const rearmScannerAfter = useCallback((ms: number) => {
    if (rearmTimerRef.current) {
      clearTimeout(rearmTimerRef.current);
      timersRef.current.delete(rearmTimerRef.current);
    }
    scanningRef.current = true;
    setBarcodeScanned(true);
    rearmTimerRef.current = after(ms, () => {
      rearmTimerRef.current = null;
      scanningRef.current = false;
      setBarcodeScanned(false);
    });
  }, [after]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      setIsFocused(true);
      return () => {
        focusedRef.current = false;
        invalidatePhotoSelection();
        setIsFocused(false);
      };
    }, [invalidatePhotoSelection])
  );

  const abortControllerRef = useRef<AbortController | null>(null);
  // What the in-flight request is and when it went out — for the beacon an
  // abandoned scan sends. The API layer can't tell a user cancel from a
  // system abort (both are the same AbortSignal), so the screen reports it.
  const scanMethodRef = useRef<'ocr' | 'barcode'>('ocr');
  const scanStartedAtRef = useRef(0);
  const appState = useRef(AppState.currentState);
  const resumedFromBackground = useRef(false);
  const recentNotFound = useRef<Set<string>>(new Set());

  // Abandon the in-flight scan and say why. `cancelled` = the user gave up
  // (with how long they waited — on weak signal the only measurement of the
  // upload leg); `interrupted` = iOS resumed the app and the request was
  // dropped, which is not the user giving up and whose wall-clock includes
  // time asleep, so it carries no elapsed. Before this a cancel left no trace
  // anywhere (plans/weak-signal-upload-2026-08-28.md).
  const abandonScan = useCallback((reason: 'cancelled' | 'interrupted') => {
    invalidatePhotoSelection();
    const wasBarcode = abortControllerRef.current && scanMethodRef.current === 'barcode';
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      if (reason === 'cancelled') {
        sendFailureBeacon(scanMethodRef.current, 'cancelled', Date.now() - scanStartedAtRef.current);
      } else {
        sendFailureBeacon(scanMethodRef.current, 'interrupted');
      }
    }
    setIsAnalyzing(false);
    setBarcodeScanned(false);
    scanningRef.current = false;
    if (wasBarcode) rearmScannerAfter(SCANNER_REARM_MS);
  }, [invalidatePhotoSelection, rearmScannerAfter]);

  useEffect(() => () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    invalidatePhotoSelection();
  }, [invalidatePhotoSelection]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      // Drop an in-flight scan the moment the app goes to the background. iOS
      // suspends the process seconds later; aborting on *resume* (the old
      // behavior) raced the dead socket's error and the 60 s timer, so the same
      // event could land as network / timeout / interrupted depending on which
      // reached JS first. `inactive` alone (Notification Center, a call banner)
      // is transient and no longer kills the scan.
      if (nextState === 'background') {
        abandonScan('interrupted');
      }
      if (
        appState.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        resumedFromBackground.current = true;
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [abandonScan]);

  const cameraMounted = !!permission?.granted && !isAnalyzing && !systemState && recovery?.phase !== 'prompt';

  // The camera unmounts whenever the spinner, recovery prompt, or a system state replaces it —
  // reset the ready gate so the torch is re-applied as a false→true prop
  // transition on the remounted live camera (the manual-toggle path) instead
  // of being pre-set at mount, which expo-camera has fumbled on iOS.
  useEffect(() => {
    if (!cameraMounted) setCameraReady(false);
  }, [cameraMounted]);

  // Apply the torch only after the camera has been ready for a settle period.
  // On-device (1.4.0 TestFlight): a transition fired right at onCameraReady is
  // silently dropped while the native session settles — the LED stays dark even
  // though the prop (and button) say on. A transition ~1s later works, which is
  // why a human toggle always works. Emulate that timing: immediate when the
  // camera has been running past the settle window (manual toggles stay
  // instant), delayed to the window's edge otherwise (retry/remount paths).
  useEffect(() => {
    if (!torch || !cameraReady) {
      setTorchApplied(false);
      return;
    }
    const settledMs = Date.now() - cameraReadyAtRef.current;
    const delay = Math.max(0, TORCH_SETTLE_MS - settledMs);
    if (delay === 0) {
      setTorchApplied(true);
      return;
    }
    // Force a fresh false→true transition: if the 2s fallback already applied
    // the torch against an unsettled session (readySignal re-run), that prop
    // change was silently dropped — leaving the prop true would never light
    // the LED.
    setTorchApplied(false);
    const timer = setTimeout(() => setTorchApplied(true), delay);
    return () => clearTimeout(timer);
  }, [torch, cameraReady, readySignal]);

  // Fallback: if onCameraReady never fires (production build race), force-enable
  // after 2s. Only while the camera is actually mounted — otherwise the timer
  // would mark an unmounted camera ready and defeat the remount gate above.
  useEffect(() => {
    if (cameraReady || !cameraMounted) return;
    const timeout = setTimeout(() => {
      cameraReadyAtRef.current = Date.now();
      setCameraReady(true);
    }, 2000);
    return () => clearTimeout(timeout);
  }, [cameraReady, cameraMounted]);

  const handleCancel = useCallback(() => abandonScan('cancelled'), [abandonScan]);

  // Enter a recovery flow. Idempotent while one is open: a cached-miss
  // callback during the same flow must not mint a second ID or re-show.
  const beginRecovery = useCallback((reason: RecoveryReason, barcode: string, productName: string | null) => {
    if (recoveryRef.current) return;
    setOcrError(null);
    setRecoveryFlow({ id: newRecoveryFlowId(), reason, barcode, productName, phase: 'prompt' });
  }, [setRecoveryFlow]);

  const startRecoveryCapture = useCallback(() => {
    const flow = recoveryRef.current;
    if (!flow) return;
    setRecoveryFlow({ ...flow, phase: 'capture' });
  }, [setRecoveryFlow]);

  const suppressCode = useCallback((barcode: string) => {
    const existing = dismissedCodes.current.get(barcode);
    if (existing) clearTimeout(existing);
    dismissedCodes.current.set(
      barcode,
      setTimeout(() => dismissedCodes.current.delete(barcode), DISMISSED_CODE_TTL_MS)
    );
  }, []);

  // Explicit exit — "Scan another product", or opening Recents. Beacons
  // `exited`, suppresses the dismissed code, and re-arms the scanner after a
  // beat. Picker cancel, couldn't-read, offline and Cancel are NOT exits.
  const exitRecovery = useCallback(() => {
    const flow = recoveryRef.current;
    if (!flow) return;
    invalidatePhotoSelection();
    sendRecoveryEvent(flow.id, flow.reason, 'exited');
    suppressCode(flow.barcode);
    rearmScannerAfter(SCANNER_REARM_MS);
    setSystemState(null);
    setRecoveryFlow(null);
  }, [suppressCode, rearmScannerAfter, setRecoveryFlow, invalidatePhotoSelection]);

  const openRecents = useCallback(() => {
    exitRecovery(); // no-op outside a flow
    router.push('/recents');
  }, [exitRecovery, router]);

  // `shown` fires when the prompt is actually on screen — not when the
  // response arrived — once per flow (the service dedupes remounts).
  const promptVisible = isFocused && !isAnalyzing && !systemState && recovery?.phase === 'prompt';
  useEffect(() => {
    if (promptVisible && recovery) sendRecoveryEvent(recovery.id, recovery.reason, 'shown');
  }, [promptVisible, recovery]);

  const navigateToResult = useCallback(async (result: AnalysisResult, controller: AbortController) => {
    // A result completes any open recovery flow: hand its ID to the result
    // screen (which beacons `result_displayed` once it's actually on screen)
    // and clear it here, so Back lands on normal capture and the next
    // product can't inherit this flow's telemetry. The answered product is
    // still in the user's hand — suppress its code like a dismissal, or Back
    // would re-open the prompt (and, for missing_context, re-run the lookup)
    // for a question the photo just answered.
    const flow = recoveryRef.current;
    const stillCurrent = () => abortControllerRef.current === controller && !controller.signal.aborted && focusedRef.current;
    if (!stillCurrent()) return;
    const scanCount = await incrementLifetimeScanCount();
    if (!stillCurrent()) return;
    await addRecentScan(result); // never throws — history can't break a scan
    if (!stillCurrent()) return;
    if (flow) {
      suppressCode(flow.barcode);
      setRecoveryFlow(null);
    }
    resumedFromBackground.current = false;
    router.push({
      pathname: '/result',
      params: {
        result: JSON.stringify(result),
        scanCount: String(scanCount),
        ...(flow ? { recoveryFlowId: flow.id, recoveryReason: flow.reason } : {}),
      },
    });
  }, [router, setRecoveryFlow, suppressCode]);

  const handleToastHide = useCallback(() => setOcrError(null), []);

  const handleError = useCallback((error: unknown, context: string) => {
    // Don't report or alert if user manually cancelled
    if (error instanceof Error && error.name === 'AbortError') return;

    reportError(error, { context });

    // Photo too blurry/small to read → dedicated "Couldn't read" state screen
    if (error instanceof APIError && error.type === 'ocr_failed') {
      setSystemState('error');
      return;
    }

    // Lost connection → dedicated Offline state screen
    if (error instanceof APIError && error.type === 'network') {
      setSystemState('offline');
      return;
    }

    // For invalid barcode input, show as toast so user can try again
    if (error instanceof APIError && error.type === 'invalid_input') {
      setOcrError(error.message);
      return;
    }

    // timeout / rate_limit / server_error keep the alert
    let message = 'Something went wrong. Please try again.';
    if (error instanceof APIError) {
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }

    Alert.alert('Error', message);
  }, []);

  const processAndAnalyze = async (imageUri: string, source: 'camera' | 'picker') => {
    setOcrError(null);
    setSystemState(null);
    setScanSource(source);

    // The user committed a photo to analysis — the funnel's second step. A
    // retry after couldn't-read fires again; the read counts unique flows.
    const flow = recoveryRef.current;
    if (flow) sendRecoveryEvent(flow.id, flow.reason, 'photo_started', { source });

    const controller = new AbortController();
    const ownsRequest = () => abortControllerRef.current === controller && !controller.signal.aborted;
    try {
      setIsAnalyzing(true);
      // Honest from t=0: nothing has been read until the upload lands.
      setScanPhase('uploading');
      setLoadingMessage('Uploading photo…');

      // The abort handle exists from the first frame of the spinner, BEFORE the
      // resize: a Cancel during those hundreds of ms used to find no controller,
      // so nothing aborted, nothing beaconed, and the request went out anyway —
      // then the result pushed itself over the camera. Check ownership after
      // the resize as well as after analysis; stale work never reaches the API.
      abortControllerRef.current = controller;
      scanMethodRef.current = 'ocr';
      scanStartedAtRef.current = Date.now();

      // Resize and compress image - smaller for faster upload. Quality 0.6 was
      // picked by measurement, not taste (plans/weak-signal-upload-2026-08-28.md
      // B1, 2026-08-28): on 9 real labels Vision extracted the same text at
      // 0.6 (median Δ −0.2%, worst −3.5%) for ~15% fewer bytes; 0.5 lost 5.1%
      // on the densest label, over the plan's 5% line. Resolution stays at
      // 1024 — OCR is sensitive to resolution, tolerant of compression.
      const manipulated = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 1024 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!ownsRequest()) return;
      if (!manipulated.base64) {
        throw new Error('Failed to process image');
      }

      // Dev-only: Sentry captures console output as breadcrumbs in release
      // builds — scan content (results, barcodes) must never reach it.
      if (__DEV__) console.log('Image size (bytes):', manipulated.base64.length);

      // Analyze with API, passing the abort signal for cancellation
      const result = await analyzeImage(manipulated.base64, controller.signal, (progress) => {
        if (!ownsRequest()) return;
        if (progress.phase === 'uploading') {
          setLoadingMessage(`Uploading photo… ${progress.pct}%`);
        } else {
          setScanPhase('reading');
          setLoadingMessage('Reading ingredients…');
        }
      });
      if (!ownsRequest()) return;
      if (__DEV__) console.log('API result:', result);

      await navigateToResult(result, controller);
    } catch (error) {
      if (ownsRequest()) handleError(error, resumedFromBackground.current ? 'scan_after_resume' : 'normal_scan');
    } finally {
      // Returning from try/catch still runs finally. A stale operation must
      // not clear its replacement's spinner or steal its Cancel controller.
      if (ownsRequest()) {
        abortControllerRef.current = null;
        setIsAnalyzing(false);
      }
    }
  };

  const handleBarcodeScanned = async (scanResult: BarcodeScanningResult) => {
    // Refs, not state: a native callback queued before the last render can
    // arrive after the prop was unset. No lookups inside a recovery flow
    // (photo-only means photo-only, including retries), and none from under
    // a Results/Recents route.
    if (recoveryRef.current || !focusedRef.current) return;
    // Synchronous ref check prevents duplicate calls before state updates
    if (scanningRef.current || capturingRef.current || abortControllerRef.current) return;

    const { data: barcodeData } = scanResult;
    if (!barcodeData) return;

    // The code the user just explicitly walked away from: silence, not a
    // reopened prompt. Checked before the miss cache so a dismissed cached
    // miss can't resurrect the state.
    if (dismissedCodes.current.has(barcodeData)) return;

    // A recent miss won't be found a moment later — same recovery affordance,
    // no lookup, no toast.
    if (recentNotFound.current.has(barcodeData)) {
      beginRecovery('not_found', barcodeData, null);
      return;
    }

    // Immediately block further scans (synchronous)
    scanningRef.current = true;

    if (__DEV__) console.log('Barcode detected:', barcodeData);
    setBarcodeScanned(true);
    setOcrError(null);

    const controller = new AbortController();
    try {
      setIsAnalyzing(true);
      setScanPhase('reading'); // no upload leg on a barcode lookup
      setLoadingMessage(`Looking up barcode ${barcodeData}…`);

      abortControllerRef.current = controller;
      scanMethodRef.current = 'barcode';
      scanStartedAtRef.current = Date.now();
      const result = await lookupBarcode(barcodeData, controller.signal);
      // Ownership check: if this request was cancelled or interrupted while
      // in flight, a response that still lands must not push a result or
      // open a recovery state over whatever the user is doing now.
      if (abortControllerRef.current !== controller || controller.signal.aborted) return;
      if (__DEV__) console.log('Barcode result:', result);

      // Known marker only — anything unmarked is a normal result, never
      // reinterpreted from the explanation text.
      if (result.result_reason === 'missing_context') {
        beginRecovery('missing_context', barcodeData, result.product_name ?? null);
        return;
      }

      await navigateToResult(result, controller);
    } catch (error) {
      // A 404 whose body read raced a Cancel/background still surfaces as
      // not_found — it must not open the prompt over what the user did next.
      if (abortControllerRef.current !== controller || controller.signal.aborted) return;
      if (error instanceof APIError && error.type === 'not_found') {
        recentNotFound.current.add(barcodeData);
        after(RECENT_MISS_TTL_MS, () => recentNotFound.current.delete(barcodeData));
        // A persistent recovery state, not a toast (and not a Sentry event —
        // an empty database is a normal user flow).
        beginRecovery('not_found', barcodeData, null);
        return;
      }
      handleError(error, 'barcode_scan');
    } finally {
      if (abortControllerRef.current === controller && !controller.signal.aborted) {
        abortControllerRef.current = null;
        setIsAnalyzing(false);
        // Only the owner may reset the scanner or replace its re-arm timer.
        rearmScannerAfter(SCANNER_REARM_MS);
      }
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isAnalyzing || capturingRef.current || abortControllerRef.current || !focusedRef.current) return;

    const selection = {};
    photoSelectionRef.current = selection;
    capturingRef.current = true;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (photoSelectionRef.current !== selection) return;
      if (!photo?.uri) {
        Alert.alert('Error', 'Failed to capture photo');
        return;
      }

      await processAndAnalyze(photo.uri, 'camera');
    } catch (error) {
      // Camera can unmount if a barcode scan triggers navigation mid-capture
      if (photoSelectionRef.current === selection) console.warn('Photo capture failed:', error);
    } finally {
      if (photoSelectionRef.current === selection) invalidatePhotoSelection();
    }
  };

  const handlePickImage = async () => {
    if (isAnalyzing || capturingRef.current || abortControllerRef.current || !focusedRef.current) return;

    const selection = {};
    photoSelectionRef.current = selection;
    capturingRef.current = true;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (photoSelectionRef.current !== selection || result.canceled) return;

      await processAndAnalyze(result.assets[0].uri, 'picker');
    } catch (error) {
      if (photoSelectionRef.current === selection) handleError(error, 'photo_picker');
    } finally {
      if (photoSelectionRef.current === selection) invalidatePhotoSelection();
    }
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  // The analyzing/system-state branches must render before the permission gate:
  // photo-picker scans work without camera access, and gating them behind the
  // permission screen froze the UI for the whole analysis and swallowed the
  // offline/couldn't-read states entirely.
  if (isAnalyzing) {
    return (
      <LoadingSpinner
        key={scanPhase} // remount on phase change so the slow clock restarts with it
        message={loadingMessage}
        slowMessage={scanPhase === 'uploading' ? SLOW_UPLOADING_MESSAGE : SLOW_READING_MESSAGE}
        slowThresholdMs={scanPhase === 'uploading' ? SLOW_UPLOADING_THRESHOLD_MS : SLOW_READING_THRESHOLD_MS}
        onCancel={handleCancel}
      />
    );
  }

  // Offline / couldn't-read interrupts route back into the capture flow
  if (systemState === 'offline') {
    return (
      <StateScreen
        icon="offline"
        title="You're offline"
        body="Scanning needs an internet connection to analyze ingredients. Reconnect and try again."
        primary="Try again"
        onPrimary={() => setSystemState(null)}
      />
    );
  }

  if (systemState === 'error') {
    const fromPicker = scanSource === 'picker';
    return (
      <StateScreen
        icon="alert"
        iconColor={theme.verdict.caution.accent}
        iconBg={theme.verdict.caution.surface}
        title="Couldn't read that"
        body={
          fromPicker
            ? 'The text in that photo was too small or blurry to read. Try a closer photo of the ingredient list.'
            : 'The text was too blurry or small to read. Hold steady and fill the frame with the label.'
        }
        primary={scanSource === 'camera' && !torch ? 'Turn on flashlight & retry' : 'Try again'}
        onPrimary={() => {
          // Dim light is the likeliest fixable cause of an unreadable camera
          // capture — pre-enable the torch for the retry (no-op if already
          // on). Library picks never touch the torch: it can't fix them.
          if (scanSource === 'camera') setTorch(true);
          setSystemState(null);
        }}
        secondary={fromPicker ? 'Choose another photo' : 'Choose a photo instead'}
        onSecondary={() => {
          setSystemState(null);
          handlePickImage();
        }}
      />
    );
  }

  // Barcode dead end → persistent neutral recovery state (never a toast, never
  // a verdict). Nothing is saved or counted here: no analysis was delivered.
  if (recovery?.phase === 'prompt') {
    return (
      <BarcodeRecoveryState
        reason={recovery.reason}
        productName={recovery.productName}
        barcode={recovery.barcode}
        onPrimary={startRecoveryCapture}
        onSecondary={exitRecovery}
      />
    );
  }

  // Camera permission gate → designed system-state screen
  if (!permission.granted) {
    return (
      <StateScreen
        icon="camera"
        title="Camera access"
        body="GlutenOrNot uses your camera to read ingredient labels, menus, and barcodes. Your photos are never stored."
        primary="Enable camera"
        onPrimary={requestPermission}
        secondary="Choose a photo instead"
        onSecondary={handlePickImage}
      />
    );
  }

  const photoOnly = recovery?.phase === 'capture';
  // Barcode detection is off for the whole recovery flow (including retries)
  // and whenever this screen isn't the focused route. The handler guards on
  // the same facts via refs — see handleBarcodeScanned.
  const scannerActive = isFocused && !barcodeScanned && !recovery;

  // Shared controls: torch top-right; library / shutter / Recents along the
  // bottom — the same positions in normal and photo-only capture.
  const torchButton = (floating: boolean) => (
    <TouchableOpacity
      style={[
        styles.torchButton,
        floating && [styles.torchFloating, { top: insets.top + theme.space[4] }],
        torch && styles.torchButtonActive,
      ]}
      onPress={() => setTorch((t) => !t)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={torch ? 'Turn off flashlight' : 'Turn on flashlight'}
      accessibilityHint="Lights up the label in dim surroundings"
    >
      <Icon name="torch" size={20} color={torch ? '#0E0E0F' : '#fff'} stroke={1.7} />
    </TouchableOpacity>
  );
  const bottomControls = (captureLabel: string, captureHint: string) => (
    <>
      <TouchableOpacity
        style={styles.galleryButton}
        onPress={handlePickImage}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Upload photo from library"
        accessibilityHint="Pick a screenshot or photo to scan for gluten"
      >
        <Icon name="image" size={24} color="#fff" stroke={1.7} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.captureButton, !cameraReady && styles.captureButtonDisabled]}
        onPress={handleCapture}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={captureLabel}
        accessibilityHint={captureHint}
      >
        <View style={[styles.captureButtonInner, !cameraReady && styles.captureButtonInnerDisabled]} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.galleryButton}
        onPress={openRecents}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="View recent scans"
        accessibilityHint="Shows your scan history, stored on this device"
      >
        <Icon name="history" size={24} color="#fff" stroke={1.7} />
      </TouchableOpacity>
    </>
  );

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        enableTorch={torchApplied}
        onCameraReady={() => {
          cameraReadyAtRef.current = Date.now();
          setCameraReady(true);
          // If the 2s fallback beat this callback, the settle window was
          // measured from the wrong instant and the torch may have been
          // dropped by the unsettled session — re-stamp and re-apply.
          setReadySignal((n) => n + 1);
        }}
        barcodeScannerSettings={{
          barcodeTypes: [...FOOD_BARCODE_TYPES],
        }}
        onBarcodeScanned={scannerActive ? handleBarcodeScanned : undefined}
      />

      {photoOnly ? (
        /* Photo-only recovery capture (state C): a stacked column — top bar /
           viewfinder / instruction / controls — so large text pushes the
           layout instead of colliding with the shutter. */
        <View
          style={[
            styles.recoveryOverlay,
            { paddingTop: insets.top + theme.space[4], paddingBottom: insets.bottom + theme.space[6] },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.recoveryTopBar}>
            <TouchableOpacity
              style={styles.exitPill}
              onPress={exitRecovery}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={RECOVERY_CAPTURE_COPY.exit}
              accessibilityHint="Leaves photo-only mode and turns barcode scanning back on"
            >
              <Icon name="close" size={17} color="#fff" stroke={2.1} />
              <Text style={styles.exitPillText}>{RECOVERY_CAPTURE_COPY.exit}</Text>
            </TouchableOpacity>
            {torchButton(false)}
          </View>
          <View style={styles.recoveryViewfinderWrap}>
            <View style={styles.recoveryViewfinder}>
              <Corners />
            </View>
          </View>
          <View style={styles.recoveryInstruction}>
            <Text style={styles.recoveryEyebrow}>{RECOVERY_CAPTURE_COPY.eyebrow}</Text>
            <Text style={styles.recoveryTitle} accessibilityRole="header">
              {RECOVERY_CAPTURE_COPY.title}
            </Text>
            <Text style={styles.recoveryGuidance}>{RECOVERY_CAPTURE_COPY.guidance}</Text>
          </View>
          <View style={styles.controlsRow}>
            {bottomControls('Capture photo of the ingredient label', 'Takes a photo of the label to scan for gluten')}
          </View>
        </View>
      ) : (
        <>
          {/* Viewfinder overlay — outside CameraView to avoid children warning */}
          <View style={styles.overlay} pointerEvents="box-none">
            <View style={[styles.wordmarkWrap, { top: insets.top + theme.space[4] }]}>
              <Wordmark />
            </View>
            <View style={styles.viewfinder}>
              <Corners />
            </View>
            <Text style={[styles.hint, { bottom: insets.bottom + 132 }]}>
              Point at a label, menu, or barcode
            </Text>
            {torchButton(true)}
          </View>

          {/* Controls: gallery picker + capture button */}
          <View style={[styles.controlsRow, styles.controlsFloating, { bottom: insets.bottom + theme.space[6] }]}>
            {bottomControls('Capture photo of ingredients', 'Takes a photo to scan for gluten')}
          </View>
        </>
      )}

      {/* OCR error toast */}
      <Toast
        message={ocrError || ''}
        visible={!!ocrError}
        onHide={handleToastHide}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.captureBg,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wordmarkWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  wordmarkText: {
    fontFamily: sans('700'),
    fontSize: 16,
    letterSpacing: -0.2,
    color: '#fff',
  },
  wordmarkSub: {
    fontFamily: sans('600'),
    color: 'rgba(255,255,255,0.55)',
  },
  viewfinder: {
    width: '74%',
    aspectRatio: 3 / 4,
    marginTop: -16,
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
    borderTopLeftRadius: 6,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 2.5,
    borderRightWidth: 2.5,
    borderTopRightRadius: 6,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 2.5,
    borderRightWidth: 2.5,
    borderBottomRightRadius: 6,
  },
  hint: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: sans('500'),
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14.5,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 40,
  },
  controlsFloating: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  captureButton: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  captureButtonDisabled: {
    opacity: 0.4,
  },
  captureButtonInnerDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  galleryButton: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  torchButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  torchFloating: {
    position: 'absolute',
    right: theme.space[4],
  },
  torchButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  // Photo-only recovery capture
  recoveryOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
    paddingHorizontal: theme.space[4],
  },
  recoveryTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.space[3],
  },
  exitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: theme.touchMin,
    paddingLeft: 11,
    paddingRight: 15,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
    flexShrink: 1, // yields to the torch at large text sizes
  },
  exitPillText: {
    fontFamily: sans('600'),
    fontSize: 14.5,
    color: '#fff',
    flexShrink: 1, // wraps rather than pushing the torch off-screen
  },
  recoveryViewfinderWrap: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: theme.space[4],
    paddingBottom: theme.space[2] + 2,
  },
  recoveryViewfinder: {
    width: '74%',
    aspectRatio: 3 / 4,
    maxHeight: '100%',
  },
  recoveryInstruction: {
    alignItems: 'center',
    paddingHorizontal: theme.space[2],
    paddingBottom: theme.space[5],
  },
  recoveryEyebrow: {
    fontFamily: mono('400'),
    fontSize: 10,
    letterSpacing: 1.6,
    color: 'rgba(255,255,255,0.62)',
    marginBottom: 7,
  },
  recoveryTitle: {
    fontFamily: sans('700'),
    fontSize: 17,
    lineHeight: 21,
    letterSpacing: -0.2,
    color: '#fff',
    textAlign: 'center',
  },
  recoveryGuidance: {
    fontFamily: sans('400'),
    fontSize: 13.5,
    lineHeight: 19.5,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    maxWidth: 296,
    marginTop: 6,
  },
});
