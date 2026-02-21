import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, AppState } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { analyzeImage, APIError } from '../services/api';
import { reportError } from '../services/errorReporting';
import { incrementLifetimeScanCount } from '../services/storage';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { AnalysisResult, BRAND_COLORS } from '../constants/verdicts';

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
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
  }, []);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera Access Needed</Text>
        <Text style={styles.permissionText}>
          GlutenOrNot needs camera access to scan ingredient labels.
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

      // Increment scan count on successful analysis
      const scanCount = await incrementLifetimeScanCount();

      resumedFromBackground.current = false;

      // Navigate to result screen
      router.push({
        pathname: '/result',
        params: { result: JSON.stringify(result), scanCount: String(scanCount) },
      });
    } catch (error) {
      // Don't report or alert if user manually cancelled
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      const context = resumedFromBackground.current ? 'scan_after_resume' : 'normal_scan';
      reportError(error, { context });

      if (error instanceof APIError && error.type === 'ocr_failed') {
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
    } finally {
      abortControllerRef.current = null;
      setIsAnalyzing(false);
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isAnalyzing) return;

    const photo = await cameraRef.current.takePictureAsync({
      quality: 0.8,
      base64: false,
    });

    if (!photo?.uri) {
      Alert.alert('Error', 'Failed to capture photo');
      return;
    }

    await processAndAnalyze(photo.uri);
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
        message="Scanning ingredients..."
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
      />

      {/* Viewfinder overlay — outside CameraView to avoid children warning */}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.viewfinder} />
        <Text style={styles.hint}>Point at the ingredients or menu</Text>
      </View>

      {/* OCR error banner */}
      {ocrError && (
        <View style={styles.ocrErrorBanner}>
          <Text style={styles.ocrErrorText}>{ocrError}</Text>
          <TouchableOpacity style={styles.ocrRetryButton} onPress={handleCapture}>
            <Text style={styles.ocrRetryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

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
          <Text style={styles.galleryIcon}>🖼</Text>
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
  ocrErrorBanner: {
    position: 'absolute',
    bottom: 140,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  ocrErrorText: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 12,
  },
  ocrRetryButton: {
    backgroundColor: BRAND_COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  ocrRetryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
