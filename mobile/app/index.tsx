import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, AppState } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { analyzeImage, lookupBarcode, APIError } from '../services/api';
import { reportError } from '../services/errorReporting';
import { incrementLifetimeScanCount } from '../services/storage';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Toast } from '../components/Toast';
import { AnalysisResult, BRAND_COLORS, FOOD_BARCODE_TYPES } from '../constants/verdicts';

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [barcodeScanned, setBarcodeScanned] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Scanning ingredients...');
  const cameraRef = useRef<CameraView>(null);
  const capturingRef = useRef(false);
  const scanningRef = useRef(false);
  const router = useRouter();

  const abortControllerRef = useRef<AbortController | null>(null);
  const appState = useRef(AppState.currentState);
  const resumedFromBackground = useRef(false);

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

  // Fallback: if onCameraReady never fires (production build race), force-enable after 2s
  useEffect(() => {
    if (cameraReady) return;
    const timeout = setTimeout(() => setCameraReady(true), 2000);
    return () => clearTimeout(timeout);
  }, [cameraReady]);

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
    resumedFromBackground.current = false;
    router.push({
      pathname: '/result',
      params: { result: JSON.stringify(result), scanCount: String(scanCount) },
    });
  }, [router]);

  const handleError = useCallback((error: unknown, context: string) => {
    // Don't report or alert if user manually cancelled
    if (error instanceof Error && error.name === 'AbortError') return;

    reportError(error, { context });

    if (error instanceof APIError && error.type === 'ocr_failed') {
      setOcrError(error.message);
      return;
    }

    // For barcode not_found, show as OCR error banner so user can try photo
    if (error instanceof APIError && error.type === 'not_found') {
      setOcrError(error.message);
      return;
    }

    let message = 'Something went wrong. Please try again.';
    if (error instanceof APIError) {
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }

    Alert.alert('Error', message);
  }, []);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera Access Needed</Text>
        <Text style={styles.permissionText}>
          GlutenOrNot needs camera access to scan ingredient labels and barcodes.
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermission}
          accessibilityRole="button"
          accessibilityLabel="Grant camera permission"
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const processAndAnalyze = async (imageUri: string) => {
    setOcrError(null);

    try {
      setIsAnalyzing(true);
      setLoadingMessage('Scanning ingredients...');

      // Resize and compress image - smaller for faster upload
      const manipulated = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 1024 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!manipulated.base64) {
        throw new Error('Failed to process image');
      }

      console.log('Image size (bytes):', manipulated.base64.length);

      // Analyze with API, passing abort signal for cancellation
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const result = await analyzeImage(manipulated.base64, controller.signal);
      abortControllerRef.current = null;
      console.log('API result:', result);

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

    // Immediately block further scans (synchronous)
    scanningRef.current = true;

    console.log('Barcode detected:', barcodeData);
    setBarcodeScanned(true);
    setOcrError(null);

    try {
      setIsAnalyzing(true);
      setLoadingMessage(`Looking up barcode ${barcodeData}...`);

      const controller = new AbortController();
      abortControllerRef.current = controller;
      const result = await lookupBarcode(barcodeData, controller.signal);
      abortControllerRef.current = null;
      console.log('Barcode result:', result);

      await navigateToResult(result);
    } catch (error) {
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

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        onCameraReady={() => setCameraReady(true)}
        barcodeScannerSettings={{
          barcodeTypes: [...FOOD_BARCODE_TYPES],
        }}
        onBarcodeScanned={barcodeScanned ? undefined : handleBarcodeScanned}
      />

      {/* Viewfinder overlay — outside CameraView to avoid children warning */}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.viewfinder} />
        <Text style={styles.hint}>Point at ingredients, menu, or barcode</Text>
      </View>

      {/* OCR error toast */}
      <Toast
        message={ocrError || ''}
        visible={!!ocrError}
        onHide={() => setOcrError(null)}
      />

      {/* Controls: gallery picker + capture button */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.galleryButton}
          onPress={handlePickImage}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Upload photo from library"
          accessibilityHint="Pick a screenshot or photo to scan for gluten"
        >
          <Text style={styles.galleryIcon}>{'\uD83D\uDDBC'}</Text>
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
        <View style={styles.galleryPlaceholder} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewfinder: {
    width: '85%',
    aspectRatio: 3 / 4,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 12,
  },
  hint: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },
  captureButtonDisabled: {
    opacity: 0.4,
  },
  captureButtonInnerDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  galleryButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryIcon: {
    fontSize: 24,
  },
  galleryPlaceholder: {
    width: 48,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  permissionText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: BRAND_COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
