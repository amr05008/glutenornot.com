import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { analyzeImage, lookupBarcode, APIError } from '../services/api';
import { reportError } from '../services/errorReporting';
import { incrementLifetimeScanCount, addRecentScan } from '../services/storage';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Toast } from '../components/Toast';
import { StateScreen } from '../components/StateScreen';
import { Icon, Reticle } from '../components/Icon';
import { AnalysisResult, FOOD_BARCODE_TYPES } from '../constants/verdicts';
import { theme } from '../constants/theme';
import { sans } from '../constants/fonts';

type SystemState = 'offline' | 'error' | null;

// How long the native camera session gets to settle before a torch transition
// is trusted to reach the LED (see the torch-application effect).
const TORCH_SETTLE_MS = 750;

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
  // Session-scoped by design: survives retakes and result round-trips (the
  // screen stays mounted under the stack), resets when the app relaunches.
  // `torch` is the user's intent (drives the button); `torchApplied` is what
  // actually reaches CameraView, applied on a settle delay — see below.
  const [torch, setTorch] = useState(false);
  const [torchApplied, setTorchApplied] = useState(false);
  const cameraReadyAtRef = useRef(0);
  const cameraRef = useRef<CameraView>(null);
  const capturingRef = useRef(false);
  const scanningRef = useRef(false);
  const router = useRouter();

  const abortControllerRef = useRef<AbortController | null>(null);
  const appState = useRef(AppState.currentState);
  const resumedFromBackground = useRef(false);
  const recentNotFound = useRef<Set<string>>(new Set());

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        resumedFromBackground.current = true;
        // Cancel any stuck request on resume
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        setIsAnalyzing(false);
        setBarcodeScanned(false);
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  // The camera unmounts whenever the spinner or a system state replaces it —
  // reset the ready gate so the torch is re-applied as a false→true prop
  // transition on the remounted live camera (the manual-toggle path) instead
  // of being pre-set at mount, which expo-camera has fumbled on iOS.
  useEffect(() => {
    if (isAnalyzing || systemState) setCameraReady(false);
  }, [isAnalyzing, systemState]);

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
    const timer = setTimeout(() => setTorchApplied(true), delay);
    return () => clearTimeout(timer);
  }, [torch, cameraReady]);

  // Fallback: if onCameraReady never fires (production build race), force-enable
  // after 2s. Only while the camera is actually mounted — otherwise the timer
  // would mark an unmounted camera ready and defeat the remount gate above.
  useEffect(() => {
    if (cameraReady || isAnalyzing || systemState) return;
    const timeout = setTimeout(() => {
      cameraReadyAtRef.current = Date.now();
      setCameraReady(true);
    }, 2000);
    return () => clearTimeout(timeout);
  }, [cameraReady, isAnalyzing, systemState]);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsAnalyzing(false);
    setBarcodeScanned(false);
  }, []);

  const navigateToResult = useCallback(async (result: AnalysisResult) => {
    const scanCount = await incrementLifetimeScanCount();
    await addRecentScan(result); // never throws — history can't break a scan
    resumedFromBackground.current = false;
    router.push({
      pathname: '/result',
      params: { result: JSON.stringify(result), scanCount: String(scanCount) },
    });
  }, [router]);

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

    // For barcode not_found, show as toast banner so user can try photo
    if (error instanceof APIError && error.type === 'not_found') {
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

  const processAndAnalyze = async (imageUri: string) => {
    setOcrError(null);
    setSystemState(null);

    try {
      setIsAnalyzing(true);
      setLoadingMessage('Reading ingredients…');

      // Resize and compress image - smaller for faster upload
      const manipulated = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 1024 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!manipulated.base64) {
        throw new Error('Failed to process image');
      }

      // Dev-only: Sentry captures console output as breadcrumbs in release
      // builds — scan content (results, barcodes) must never reach it.
      if (__DEV__) console.log('Image size (bytes):', manipulated.base64.length);

      // Analyze with API, passing abort signal for cancellation
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const result = await analyzeImage(manipulated.base64, controller.signal);
      abortControllerRef.current = null;
      if (__DEV__) console.log('API result:', result);

      await navigateToResult(result);
    } catch (error) {
      handleError(error, resumedFromBackground.current ? 'scan_after_resume' : 'normal_scan');
    } finally {
      abortControllerRef.current = null;
      setIsAnalyzing(false);
    }
  };

  const handleBarcodeScanned = async (scanResult: BarcodeScanningResult) => {
    // Synchronous ref check prevents duplicate calls before state updates
    if (scanningRef.current || capturingRef.current) return;

    const { data: barcodeData } = scanResult;
    if (!barcodeData) return;

    // Skip API call for recently-failed barcodes to prevent frustration retry loops
    if (recentNotFound.current.has(barcodeData)) {
      setOcrError('Product not in database — scan the ingredient label instead');
      return;
    }

    // Immediately block further scans (synchronous)
    scanningRef.current = true;

    if (__DEV__) console.log('Barcode detected:', barcodeData);
    setBarcodeScanned(true);
    setOcrError(null);

    try {
      setIsAnalyzing(true);
      setLoadingMessage(`Looking up barcode ${barcodeData}…`);

      const controller = new AbortController();
      abortControllerRef.current = controller;
      const result = await lookupBarcode(barcodeData, controller.signal);
      abortControllerRef.current = null;
      if (__DEV__) console.log('Barcode result:', result);

      await navigateToResult(result);
    } catch (error) {
      if (error instanceof APIError && error.type === 'not_found') {
        recentNotFound.current.add(barcodeData);
        setTimeout(() => recentNotFound.current.delete(barcodeData), 60000);
      }
      handleError(error, 'barcode_scan');
    } finally {
      abortControllerRef.current = null;
      setIsAnalyzing(false);
      // Reset barcode scan state after a delay to prevent rapid re-scanning
      setTimeout(() => {
        setBarcodeScanned(false);
        scanningRef.current = false;
      }, 2000);
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isAnalyzing) return;

    capturingRef.current = true;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (!photo?.uri) {
        Alert.alert('Error', 'Failed to capture photo');
        return;
      }

      await processAndAnalyze(photo.uri);
    } catch (error) {
      // Camera can unmount if a barcode scan triggers navigation mid-capture
      console.warn('Photo capture failed:', error);
    } finally {
      capturingRef.current = false;
    }
  };

  const handlePickImage = async () => {
    if (isAnalyzing) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (result.canceled) return;

    await processAndAnalyze(result.assets[0].uri);
  };

  if (!permission) {
    return <View style={styles.container} />;
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

  if (isAnalyzing) {
    return (
      <LoadingSpinner
        message={loadingMessage}
        slowMessage="This is taking longer than usual. Cancel and try your scan again."
        slowThresholdMs={30000}
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
    return (
      <StateScreen
        icon="alert"
        iconColor={theme.verdict.caution.accent}
        iconBg={theme.verdict.caution.surface}
        title="Couldn't read that"
        body="The text was too blurry or small to read. Hold steady and fill the frame with the label."
        primary={torch ? 'Try again' : 'Turn on flashlight & retry'}
        onPrimary={() => {
          // Dim light is the likeliest fixable cause of an unreadable label —
          // pre-enable the torch for the retry (no-op if already on).
          setTorch(true);
          setSystemState(null);
        }}
        secondary="Choose a photo instead"
        onSecondary={() => {
          setSystemState(null);
          handlePickImage();
        }}
      />
    );
  }

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
        }}
        barcodeScannerSettings={{
          barcodeTypes: [...FOOD_BARCODE_TYPES],
        }}
        onBarcodeScanned={barcodeScanned ? undefined : handleBarcodeScanned}
      />

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
        <TouchableOpacity
          style={[
            styles.torchButton,
            { top: insets.top + theme.space[4] },
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
      </View>

      {/* OCR error toast */}
      <Toast
        message={ocrError || ''}
        visible={!!ocrError}
        onHide={handleToastHide}
      />

      {/* Controls: gallery picker + capture button */}
      <View style={[styles.controls, { bottom: insets.bottom + theme.space[6] }]}>
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
          accessibilityLabel="Capture photo of ingredients"
          accessibilityHint="Takes a photo to scan for gluten"
        >
          <View style={[styles.captureButtonInner, !cameraReady && styles.captureButtonInnerDisabled]} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.galleryButton}
          onPress={() => router.push('/recents')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="View recent scans"
          accessibilityHint="Shows your scan history, stored on this device"
        >
          <Icon name="history" size={24} color="#fff" stroke={1.7} />
        </TouchableOpacity>
      </View>
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
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 40,
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
    position: 'absolute',
    right: theme.space[4],
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  torchButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
});
