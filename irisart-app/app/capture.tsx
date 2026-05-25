import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Alert, Image, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import * as ImagePicker from 'expo-image-picker';

import { AppBottomBar } from '@/components/AppBottomBar';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

type CaptureState =
  | { kind: 'camera' }
  | { kind: 'preview'; uri: string };

type DragState = {
  cxPx: number;
  cyPx: number;
  minCx: number;
  maxCx: number;
  minCy: number;
  maxCy: number;
};

export default function CaptureScreen() {
  const scheme = useColorScheme();
  const c = Colors[scheme];

  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<CaptureState>({ kind: 'camera' });
  const [torchOn, setTorchOn] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [zoom, setZoom] = useState(0.3); // 0..1, ~1.5–2x default
  const { width: windowW } = useWindowDimensions();
  const stageSize = Math.min(Math.max(240, windowW - 36), 520);
  const [cropRect, setCropRect] = useState<{ cx: number; cy: number; scale: number }>({
    cx: 0.5,
    cy: 0.5,
    scale: 1,
  });
  const cropRectRef = useRef(cropRect);
  cropRectRef.current = cropRect;

  const cropAspect = 4 / 3;
  const baseRectW = stageSize * 0.84;
  const rectW = Math.min(stageSize * 0.96, baseRectW * cropRect.scale);
  const rectH = Math.min(stageSize * 0.92, rectW / cropAspect);
  const rectLeft = stageSize * cropRect.cx - rectW / 2;
  const rectTop = stageSize * cropRect.cy - rectH / 2;

  const previewRectStyle = useMemo(
    () => ({
      left: rectLeft,
      top: rectTop,
      width: rectW,
      height: rectH,
    }),
    [rectLeft, rectTop, rectW, rectH]
  );

  const dragStartRef = useRef<DragState | null>(null);
  const rectResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const cur = cropRectRef.current;
        const curW = Math.min(stageSize * 0.96, baseRectW * cur.scale);
        const curH = Math.min(stageSize * 0.92, curW / cropAspect);
        const halfW = curW / 2;
        const halfH = curH / 2;
        dragStartRef.current = {
          cxPx: stageSize * cur.cx,
          cyPx: stageSize * cur.cy,
          minCx: halfW / stageSize,
          maxCx: (stageSize - halfW) / stageSize,
          minCy: halfH / stageSize,
          maxCy: (stageSize - halfH) / stageSize,
        };
      },
      onPanResponderMove: (_, gestureState) => {
        const base = dragStartRef.current;
        if (!base) return;
        const nextCxPx = base.cxPx + gestureState.dx;
        const nextCyPx = base.cyPx + gestureState.dy;
        const nextCx = Math.max(base.minCx, Math.min(base.maxCx, nextCxPx / stageSize));
        const nextCy = Math.max(base.minCy, Math.min(base.maxCy, nextCyPx / stageSize));
        setCropRect((cur) => ({ ...cur, cx: nextCx, cy: nextCy }));
      },
      onPanResponderRelease: () => {
        dragStartRef.current = null;
      },
    });
  }, [baseRectW, cropAspect, stageSize]);

  const canUseCamera = permission?.granted === true;

  const onTakePicture = async () => {
    if (!cameraRef.current || isCapturing) return;
    try {
      setIsCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: Platform.OS === 'android',
      });
      if (!photo?.uri) throw new Error('No photo URI returned.');
      setCropRect({ cx: 0.5, cy: 0.5, scale: 1 });
      setState({ kind: 'preview', uri: photo.uri });
    } catch (e) {
      Alert.alert('Camera error', e instanceof Error ? e.message : 'Failed to take photo.');
    } finally {
      setIsCapturing(false);
    }
  };

  const pickFromGallery = async () => {
    if (isPicking) return;
    try {
      setIsPicking(true);
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo access to upload an eye image.');
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });

      if (res.canceled) return;
      const uri = res.assets?.[0]?.uri;
      if (!uri) throw new Error('No image selected.');
      setCropRect({ cx: 0.5, cy: 0.5, scale: 1 });
      setState({ kind: 'preview', uri });
    } catch (e) {
      Alert.alert('Upload error', e instanceof Error ? e.message : 'Failed to pick image.');
    } finally {
      setIsPicking(false);
    }
  };

  const onConfirm = () => {
    if (state.kind !== 'preview') return;
    // pass normalized rectangle for eye crop
    const x = rectLeft / stageSize;
    const y = rectTop / stageSize;
    const w = rectW / stageSize;
    const h = rectH / stageSize;
    router.push({
      pathname: '/iris',
      params: {
        uri: state.uri,
        cropX: String(Math.max(0, Math.min(1, x))),
        cropY: String(Math.max(0, Math.min(1, y))),
        cropW: String(Math.max(0.1, Math.min(1, w))),
        cropH: String(Math.max(0.1, Math.min(1, h))),
      },
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={
          scheme === 'dark'
            ? ['rgba(0,0,0,0.75)', 'rgba(0,0,0,0.20)', 'rgba(0,0,0,0.75)']
            : ['rgba(10,11,16,0.28)', 'rgba(10,11,16,0.06)', 'rgba(10,11,16,0.28)']
        }
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.chip,
              { borderColor: c.border, backgroundColor: c.surface },
              pressed && { opacity: 0.85 },
            ]}>
            <Text style={[styles.chipText, { color: c.text }]}>Back</Text>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              onPress={pickFromGallery}
              disabled={isPicking}
              style={({ pressed }) => [
                styles.chip,
                { borderColor: c.border, backgroundColor: c.surface },
                pressed && { opacity: 0.85 },
              ]}>
              <Text style={[styles.chipText, { color: c.text }]}>{isPicking ? 'Uploading…' : 'Upload'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setTorchOn((v) => !v)}
              style={({ pressed }) => [
                styles.chip,
                { borderColor: c.border, backgroundColor: c.surface },
                pressed && { opacity: 0.85 },
              ]}>
              <Text style={[styles.chipText, { color: c.text }]}>{torchOn ? 'Torch On' : 'Torch Off'}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.stage}>
          {!canUseCamera ? (
            <View style={[styles.permissionCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.permissionTitle, { color: c.text }]}>Camera access required</Text>
              <Text
                style={[
                  styles.permissionBody,
                  { color: scheme === 'dark' ? 'rgba(243,245,255,0.70)' : 'rgba(10,11,16,0.68)' },
                ]}>
                IrisArt needs the camera to capture a macro photo of your eye.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => requestPermission()}
                style={({ pressed }) => [
                  styles.permissionButton,
                  { backgroundColor: c.tint, opacity: pressed ? 0.9 : 1 },
                ]}>
                <Text style={styles.permissionButtonText}>Allow Camera</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={pickFromGallery}
                disabled={isPicking}
                style={({ pressed }) => [
                  styles.permissionButton,
                  { backgroundColor: c.surfaceAlt, borderColor: c.border, opacity: pressed ? 0.92 : 1, borderWidth: StyleSheet.hairlineWidth },
                ]}>
                <Text style={[styles.permissionButtonText, { color: c.text }]}>{isPicking ? 'Uploading…' : 'Upload Instead'}</Text>
              </Pressable>
            </View>
          ) : state.kind === 'preview' ? (
            <View style={[styles.previewWrap, { width: stageSize, height: stageSize }]}>
              <Image source={{ uri: state.uri }} style={styles.preview} resizeMode="cover" />
              <View {...rectResponder.panHandlers} style={[styles.cropRect, previewRectStyle]} />
            </View>
          ) : (
            <View style={[styles.cameraWrap, { width: stageSize, height: stageSize }]}>
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="back"
                enableTorch={torchOn}
                // expo-camera zoom is 0..1; keep within safe bounds
                zoom={Math.max(0, Math.min(1, zoom))}
              />
              <View pointerEvents="none" style={styles.eyeRectGuide} />
              <Text
                style={[
                  styles.hint,
                  { color: scheme === 'dark' ? 'rgba(243,245,255,0.70)' : 'rgba(10,11,16,0.70)' },
                ]}>
                Keep the whole eye in the rectangle
              </Text>
            </View>
          )}
        </View>

        <View style={styles.zoomRow}>
          <Text style={[styles.zoomLabel, { color: scheme === 'dark' ? 'rgba(243,245,255,0.75)' : 'rgba(10,11,16,0.75)' }]}>
            Zoom { (1 + zoom * 3).toFixed(1) }×
          </Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={1}
            value={zoom}
            onValueChange={setZoom}
            minimumTrackTintColor={c.tint}
            maximumTrackTintColor={scheme === 'dark' ? 'rgba(243,245,255,0.25)' : 'rgba(10,11,16,0.25)'}
            thumbTintColor={c.tint}
          />
        </View>

        <View style={styles.controls}>
          {state.kind === 'preview' ? (
            <>
              <View style={styles.cropPanel}>
                <Text style={[styles.cropTitle, { color: c.text }]}>Crop Eye Area</Text>
                <Text style={[styles.cropHint, { color: scheme === 'dark' ? 'rgba(243,245,255,0.72)' : 'rgba(10,11,16,0.72)' }]}>
                  Move rectangle over the eye. Include eyelid + brow.
                </Text>
                <Slider
                  style={styles.cropSlider}
                  minimumValue={0.62}
                  maximumValue={1.12}
                  value={cropRect.scale}
                  onValueChange={(v) =>
                    setCropRect((cur) => {
                      const scale = v;
                      const nextW = Math.min(stageSize * 0.96, baseRectW * scale);
                      const nextH = Math.min(stageSize * 0.92, nextW / cropAspect);
                      const halfW = nextW / 2;
                      const halfH = nextH / 2;
                      const minCx = halfW / stageSize;
                      const maxCx = (stageSize - halfW) / stageSize;
                      const minCy = halfH / stageSize;
                      const maxCy = (stageSize - halfH) / stageSize;
                      return {
                        ...cur,
                        scale,
                        cx: Math.max(minCx, Math.min(maxCx, cur.cx)),
                        cy: Math.max(minCy, Math.min(maxCy, cur.cy)),
                      };
                    })
                  }
                  minimumTrackTintColor={c.tint}
                  maximumTrackTintColor={scheme === 'dark' ? 'rgba(243,245,255,0.25)' : 'rgba(10,11,16,0.25)'}
                  thumbTintColor={c.tint}
                />
                <View style={[styles.examplePlaceholder, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
                  <Text style={[styles.examplePlaceholderText, { color: scheme === 'dark' ? 'rgba(243,245,255,0.62)' : 'rgba(10,11,16,0.62)' }]}>
                    Example image slot (you can add your sample reference here later)
                  </Text>
                </View>
              </View>
              <View style={styles.previewButtonsRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setState({ kind: 'camera' })}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    { borderColor: c.border, backgroundColor: c.surface },
                    pressed && { opacity: 0.9 },
                  ]}>
                  <Text style={[styles.secondaryText, { color: c.text }]}>Retake</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={onConfirm}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: c.tint, opacity: pressed ? 0.9 : 1 },
                  ]}>
                  <Text style={styles.primaryText}>Use Photo</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.shutterRow}>
              <Pressable
                accessibilityRole="button"
                onPress={onTakePicture}
                disabled={!canUseCamera || isCapturing}
                style={({ pressed }) => [
                  styles.shutter,
                  { borderColor: 'rgba(255,255,255,0.28)' },
                  (pressed || isCapturing) && { transform: [{ scale: 0.98 }] },
                ]}>
                <View style={[styles.shutterInner, { backgroundColor: c.tint }]} />
              </Pressable>
            </View>
          )}
        </View>
        <AppBottomBar active="scan" />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 13.5, fontWeight: '650' },

  stage: { flexShrink: 1, justifyContent: 'center' },
  cameraWrap: {
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewWrap: {
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  preview: { ...StyleSheet.absoluteFillObject },
  eyeRectGuide: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.78)',
    width: '84%',
    height: '58%',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  hint: {
    position: 'absolute',
    bottom: 18,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.15,
  },

  permissionCard: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 10,
  },
  permissionTitle: { fontSize: 18, fontWeight: '750' },
  permissionBody: { fontSize: 13.5, lineHeight: 19.5 },
  permissionButton: {
    marginTop: 8,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  permissionButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '750' },

  zoomRow: { paddingTop: 10, paddingHorizontal: 4 },
  zoomLabel: { fontSize: 12.5, marginBottom: 4 },
  slider: { width: '100%', height: 32 },

  controls: { paddingTop: 14, flexDirection: 'column', justifyContent: 'center', gap: 12, alignItems: 'stretch' },
  shutterRow: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  previewButtonsRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, width: '100%' },
  cropPanel: {
    width: '100%',
    backgroundColor: 'rgba(10,11,16,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    padding: 14,
    gap: 8,
  },
  cropTitle: { fontSize: 14.5, fontWeight: '900' },
  cropHint: { fontSize: 12.5, fontWeight: '700' },
  cropSlider: { width: '100%', height: 34 },
  examplePlaceholder: {
    marginTop: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  examplePlaceholderText: { fontSize: 11.8, fontWeight: '650' },
  cropRect: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 74 / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 56 / 2,
  },
  primaryBtn: { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '800' },
  secondaryBtn: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryText: { fontSize: 15.5, fontWeight: '750' },
});

