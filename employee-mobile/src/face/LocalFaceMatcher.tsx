import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { API_BASE } from '../config';

export type LocalFaceMatch = {
  employeeId: number;
  name: string;
  employeeCode?: string;
  distance: number;
};

export type FaceGallery = {
  threshold: number;
  employees: Array<{
    employee_id: number;
    name: string;
    employee_code?: string;
    embedding: number[];
  }>;
};

export type FaceBox = { x: number; y: number; width: number; height: number };

export type LocalFaceMatcherHandle = {
  match: (imageBase64: string, faceBox?: FaceBox, faceCrop?: boolean) => Promise<LocalFaceMatch | null>;
};

type Props = {
  gallery: FaceGallery | null;
  onReady: () => void;
  onError: (message: string) => void;
};

const MATCH_TIMEOUT_MS = 25000;

function faceMatchDocument(apiBase: string) {
  const modelUrl = `${apiBase}/api/kiosk-assets/models`;
  const scriptUrl = `${apiBase}/api/kiosk-assets/face-api.js`;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body>
<script>
function post(msg) {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
}
window.__gallery = [];
window.__threshold = 0.55;
window.__setGallery = function (payload) {
  window.__gallery = (payload && payload.employees) || [];
  window.__threshold = Number(payload && payload.threshold) || 0.55;
};
function distance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  var sum = 0;
  for (var i = 0; i < a.length; i++) {
    var d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}
function bestPerson(desc) {
  if (!desc) return null;
  var list = Array.from(desc);
  var best = null;
  var people = window.__gallery || [];
  for (var i = 0; i < people.length; i++) {
    var person = people[i];
    var dist = distance(list, person.embedding);
    if (dist <= window.__threshold && (!best || dist < best.distance)) {
      best = {
        employeeId: person.employee_id,
        name: person.name,
        employeeCode: person.employee_code,
        distance: dist
      };
    }
  }
  return best;
}
function photoCanvas(img) {
  var width = img.naturalWidth || img.width;
  var height = img.naturalHeight || img.height;
  if (!width || !height) return null;
  var maxEdge = 512;
  var scale = Math.min(1, maxEdge / Math.max(width, height));
  var canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}
function matchFace(img) {
  return faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor().then(function (result) {
    return result ? result.descriptor : null;
  });
}
window.__match = function (requestId, imageBase64) {
  var img = new Image();
  img.onload = function () {
    var canvas = photoCanvas(img);
    if (!canvas) {
      post({ type: 'match', requestId: requestId, match: null });
      return;
    }
    matchFace(canvas).then(function (desc) {
      post({ type: 'match', requestId: requestId, match: bestPerson(desc) });
    }).catch(function (err) {
      post({ type: 'match', requestId: requestId, error: String(err && err.message || err) });
    });
  };
  img.onerror = function () {
    post({ type: 'match', requestId: requestId, error: 'Could not read photo' });
  };
  img.src = 'data:image/jpeg;base64,' + imageBase64;
};
function boot() {
  if (typeof faceapi === 'undefined') {
    post({ type: 'error', message: 'Face matching library did not load' });
    return;
  }
  var tf = faceapi.tf;
  var start = tf.setBackend('webgl').catch(function () { return tf.setBackend('cpu'); });
  start.then(function () { return tf.ready(); }).then(function () {
    return faceapi.nets.ssdMobilenetv1.loadFromUri(${JSON.stringify(modelUrl)});
  }).then(function () {
    return faceapi.nets.faceLandmark68Net.loadFromUri(${JSON.stringify(modelUrl)});
  }).then(function () {
    return faceapi.nets.faceRecognitionNet.loadFromUri(${JSON.stringify(modelUrl)});
  }).then(function () {
    var canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 160;
    canvas.getContext('2d').fillRect(0, 0, 160, 160);
    return faceapi.detectSingleFace(canvas).catch(function () { return null; }).then(function () {
      return faceapi.detectFaceLandmarks(canvas).catch(function () { return null; });
    }).then(function () {
      return faceapi.computeFaceDescriptor(canvas).catch(function () { return null; });
    });
  }).then(function () {
    post({ type: 'ready' });
  }).catch(function (err) {
    post({ type: 'error', message: String(err && err.message || err) });
  });
}
</script>
<script src="${scriptUrl}" onerror="post({type:'error', message:'Could not download face matching'})"></script>
<script>boot();</script>
</body>
</html>`;
}

const LocalFaceMatcher = forwardRef<LocalFaceMatcherHandle, Props>(function LocalFaceMatcher(
  { gallery, onReady, onError },
  ref
) {
  const webRef = useRef<WebView>(null);
  const pendingRef = useRef<
    Map<number, { resolve: (match: LocalFaceMatch | null) => void; reject: (err: Error) => void }>
  >(new Map());
  const seqRef = useRef(0);
  const [ready, setReady] = useState(false);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!ready || !gallery || !webRef.current) return;
    webRef.current.injectJavaScript(
      `window.__setGallery(${JSON.stringify({
        threshold: gallery.threshold,
        employees: gallery.employees,
      })}); true;`
    );
  }, [gallery, ready]);

  useImperativeHandle(ref, () => ({
    match(imageBase64: string, faceBox?: FaceBox, faceCrop = false) {
      return new Promise((resolve, reject) => {
        if (!ready || !webRef.current) {
          reject(new Error('Face matching is still loading'));
          return;
        }
        const requestId = seqRef.current + 1;
        seqRef.current = requestId;
        const timer = setTimeout(() => {
          if (!pendingRef.current.has(requestId)) return;
          pendingRef.current.delete(requestId);
          reject(new Error('Face match timed out'));
        }, MATCH_TIMEOUT_MS);
        pendingRef.current.set(requestId, {
          resolve: (match) => {
            clearTimeout(timer);
            resolve(match);
          },
          reject: (err) => {
            clearTimeout(timer);
            reject(err);
          },
        });
        webRef.current.injectJavaScript(
          `window.__match(${requestId}, ${JSON.stringify(imageBase64)}, ${JSON.stringify(faceBox || null)}, ${faceCrop ? 'true' : 'false'}); true;`
        );
      });
    },
  }), [ready]);

  const onMessage = (event: WebViewMessageEvent) => {
    let data: { type?: string; message?: string; requestId?: number; match?: LocalFaceMatch | null; error?: string };
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (data.type === 'ready') {
      setReady(true);
      onReadyRef.current();
      return;
    }
    if (data.type === 'error') {
      onErrorRef.current(data.message || 'Face matching failed to start');
      return;
    }
    if (data.type === 'match' && data.requestId != null) {
      const pending = pendingRef.current.get(data.requestId);
      if (!pending) return;
      pendingRef.current.delete(data.requestId);
      if (data.error) pending.reject(new Error(data.error));
      else pending.resolve(data.match || null);
    }
  };

  return (
    <WebView
      ref={webRef}
      style={styles.hidden}
      source={{ html: faceMatchDocument(API_BASE), baseUrl: `${API_BASE}/` }}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      cacheEnabled
      androidLayerType="hardware"
      pointerEvents="none"
      onMessage={onMessage}
      onError={() => onErrorRef.current('Face matching could not start')}
    />
  );
});

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 320,
    height: 320,
    opacity: 0,
    zIndex: -1,
  },
});

export default LocalFaceMatcher;
