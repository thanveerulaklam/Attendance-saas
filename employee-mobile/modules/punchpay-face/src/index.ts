import { requireNativeModule, requireNativeView } from 'expo';
import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

export type FaceRecognitionEvent = {
  type?: 'status' | 'match' | 'sample' | 'calibration';
  message?: string;
  employeeId?: number;
  name?: string;
  similarity?: number;
  threshold?: number;
  matched?: boolean;
  step?: string;
  embedding?: number[];
  dimension?: number;
  detectionMs?: number;
  cropMs?: number;
  inferenceMs?: number;
  matchingMs?: number;
  totalMs?: number;
};

type NativeProps = ViewProps & {
  active?: boolean;
  mode?: 'recognize' | 'enroll' | 'calibrate';
  paused?: boolean;
  enrollStep?: string;
  onRecognition?: (event: { nativeEvent: FaceRecognitionEvent }) => void;
};

export const FaceCameraView = requireNativeView<NativeProps>('PunchPayFace');

type FaceNativeModule = {
  setGallery(json: string): Promise<void>;
  getPerformanceStats(): Promise<Record<string, unknown>>;
};

const nativeModule = requireNativeModule<FaceNativeModule>('PunchPayFace');

export function setFaceGallery(json: string) {
  return nativeModule.setGallery(json);
}

export function getFacePerformanceStats() {
  return nativeModule.getPerformanceStats();
}

export type FaceCameraComponent = ComponentType<NativeProps>;
