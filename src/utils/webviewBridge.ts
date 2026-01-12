/**
 * WebView Bridge - React Native ↔ 웹 통신 인터페이스
 * camter 웹앱과 React Native 앱 간의 네이티브 기능 연동
 */

import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

// 이미지 선택 결과 타입
export interface ImagePickerResult {
  base64: string;
  mimeType: string;
  fileName: string;
  path: string;
}

// 권한 상태 타입
export interface PermissionStatus {
  granted: boolean;
  denied: boolean;
  permanentlyDenied: boolean;
  limited: boolean;
}

// 브릿지 메시지 타입
export interface BridgeMessage {
  type: string;
  action?: string;
  requestId?: string;
  data?: unknown;
  source?: 'camera' | 'gallery';  // pickImage용
  callbackId?: string;
}

// 콜백 저장소
const pendingCallbacks = new Map<string, (result: unknown) => void>();
let callbackIdCounter = 0;

/**
 * 콜백 ID 생성
 */
const generateCallbackId = (): string => {
  return `callback_${++callbackIdCounter}_${Date.now()}`;
};

/**
 * 콜백 등록
 */
export const registerCallback = (callbackId: string, callback: (result: unknown) => void): void => {
  pendingCallbacks.set(callbackId, callback);
};

/**
 * 콜백 실행
 */
export const executeCallback = (callbackId: string, result: unknown): void => {
  const callback = pendingCallbacks.get(callbackId);
  if (callback) {
    callback(result);
    pendingCallbacks.delete(callbackId);
  }
};

/**
 * 이미지 선택 - 카메라
 */
export const pickImageFromCamera = async (): Promise<ImagePickerResult | null> => {
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      console.warn('Camera permission denied');
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    const asset = result.assets[0];
    const fileName = asset.uri.split('/').pop() || `image_${Date.now()}.jpg`;
    const mimeType = asset.mimeType || 'image/jpeg';

    return {
      base64: asset.base64 || '',
      mimeType,
      fileName,
      path: asset.uri,
    };
  } catch (error) {
    console.error('Camera error:', error);
    return null;
  }
};

/**
 * 이미지 선택 - 갤러리
 */
export const pickImageFromGallery = async (): Promise<ImagePickerResult | null> => {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      console.warn('Gallery permission denied');
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    const asset = result.assets[0];
    const fileName = asset.uri.split('/').pop() || `image_${Date.now()}.jpg`;
    const mimeType = asset.mimeType || 'image/jpeg';

    return {
      base64: asset.base64 || '',
      mimeType,
      fileName,
      path: asset.uri,
    };
  } catch (error) {
    console.error('Gallery error:', error);
    return null;
  }
};

/**
 * 이미지 선택 - source에 따라 분기
 */
export const pickImage = async (source: 'camera' | 'gallery'): Promise<ImagePickerResult | null> => {
  if (source === 'camera') {
    return pickImageFromCamera();
  } else {
    return pickImageFromGallery();
  }
};

/**
 * 권한 확인
 */
export const checkPermission = async (permissionType: 'camera' | 'photos'): Promise<PermissionStatus> => {
  try {
    let status: ImagePicker.PermissionStatus;

    if (permissionType === 'camera') {
      const result = await ImagePicker.getCameraPermissionsAsync();
      status = result.status;
    } else {
      const result = await ImagePicker.getMediaLibraryPermissionsAsync();
      status = result.status;
    }

    return {
      granted: status === 'granted',
      denied: status === 'denied',
      permanentlyDenied: status === 'denied',
      limited: false,
    };
  } catch (error) {
    console.error('Permission check error:', error);
    return {
      granted: false,
      denied: true,
      permanentlyDenied: false,
      limited: false,
    };
  }
};

/**
 * WebView에 주입할 JavaScript 코드 생성
 * 웹에서 window.NativeBridge를 통해 RN 네이티브 기능 호출
 */
export const generateInjectedJavaScript = (): string => {
  return `
    (function() {
      // RN WebView 환경 플래그 설정 (레거시 호환용 isFlutterWebView 유지)
      window.isFlutterWebView = true;
      window.isRNWebView = true;

      // 요청 ID 생성
      function generateRequestId() {
        return Date.now() + '-' + Math.random().toString(36).substring(2, 9);
      }

      // 대기 중인 요청 저장소
      window._pendingRequests = window._pendingRequests || {};

      // NativeBridge 인터페이스 (레거시 호환용 FlutterBridge도 유지)
      var bridge = {
        // postMessage - RN WebView로 메시지 전송
        postMessage: function(messageString) {
          try {
            var message = JSON.parse(messageString);
            window.ReactNativeWebView.postMessage(JSON.stringify(message));
          } catch (e) {
            console.error('[NativeBridge] postMessage error:', e);
          }
        },

        // 이미지 피커 표시 (액션시트)
        showImagePicker: function() {
          return new Promise(function(resolve, reject) {
            var requestId = generateRequestId();
            window._pendingRequests[requestId] = { resolve: resolve, reject: reject };

            window.ReactNativeWebView.postMessage(JSON.stringify({
              action: 'showImagePicker',
              type: 'showImagePicker',
              requestId: requestId
            }));
          });
        },

        // 이미지 선택 (source 지정)
        pickImage: function(source) {
          return new Promise(function(resolve, reject) {
            var requestId = generateRequestId();
            window._pendingRequests[requestId] = { resolve: resolve, reject: reject };

            window.ReactNativeWebView.postMessage(JSON.stringify({
              action: 'pickImage',
              type: 'pickImage',
              requestId: requestId,
              source: source
            }));
          });
        },

        // 카메라로 촬영
        pickImageFromCamera: function() {
          return new Promise(function(resolve, reject) {
            var requestId = generateRequestId();
            window._pendingRequests[requestId] = { resolve: resolve, reject: reject };

            window.ReactNativeWebView.postMessage(JSON.stringify({
              action: 'pickImageFromCamera',
              type: 'pickImageFromCamera',
              requestId: requestId
            }));
          });
        },

        // 갤러리에서 선택
        pickImageFromGallery: function() {
          return new Promise(function(resolve, reject) {
            var requestId = generateRequestId();
            window._pendingRequests[requestId] = { resolve: resolve, reject: reject };

            window.ReactNativeWebView.postMessage(JSON.stringify({
              action: 'pickImageFromGallery',
              type: 'pickImageFromGallery',
              requestId: requestId
            }));
          });
        },

        // 권한 확인
        checkPermission: function(permissionType) {
          return new Promise(function(resolve, reject) {
            var requestId = generateRequestId();
            window._pendingRequests[requestId] = { resolve: resolve, reject: reject };

            window.ReactNativeWebView.postMessage(JSON.stringify({
              action: 'checkPermission',
              type: 'checkPermission',
              requestId: requestId,
              data: { type: permissionType, permissionType: permissionType }
            }));
          });
        },

        // FCM 토큰 요청
        getFcmToken: function() {
          return new Promise(function(resolve, reject) {
            var requestId = generateRequestId();
            window._pendingRequests[requestId] = { resolve: resolve, reject: reject };

            window.ReactNativeWebView.postMessage(JSON.stringify({
              action: 'getFcmToken',
              type: 'getFcmToken',
              requestId: requestId
            }));
          });
        },

        // 로그인 성공 알림 (FCM 토큰 서버 동기화용)
        notifyLoginSuccess: function(accessToken) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            action: 'notifyLoginSuccess',
            type: 'notifyLoginSuccess',
            data: { accessToken: accessToken }
          }));
        },

        // 로그아웃 알림
        notifyLogout: function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            action: 'notifyLogout',
            type: 'notifyLogout'
          }));
        },

        // 파일 다운로드
        downloadFile: function(url, fileName) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            action: 'downloadFile',
            type: 'downloadFile',
            data: { url: url, fileName: fileName }
          }));
        },

        // 외부 링크 열기
        openExternalLink: function(url) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            action: 'openExternalLink',
            type: 'openExternalLink',
            data: { url: url }
          }));
        },

        // 콘텐츠 공유
        shareContent: function(title, message, url) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            action: 'shareContent',
            type: 'shareContent',
            data: { title: title, message: message, url: url }
          }));
        }
      };

      // NativeBridge와 FlutterBridge 둘 다 등록 (레거시 호환)
      window.NativeBridge = bridge;
      window.FlutterBridge = bridge;

      // 네이티브 응답 핸들러
      // 웹의 nativeBridge.ts가 handleNativeResponse를 등록하므로, 여기서는 등록하지 않음
      // handleFlutterResponse만 alias로 연결 (웹에서 이미 등록된 handleNativeResponse 사용)
      // 레거시 호환용 alias - handleNativeResponse가 있으면 연결
      if (window.handleNativeResponse) {
        window.handleFlutterResponse = window.handleNativeResponse;
      }

      // 타입 기반 응답 핸들러 (기존 호환)
      window.handleNativeResponseByType = function(type, result) {
        console.log('[NativeBridge] Response by type:', type);

        // 타입별로 대기 중인 요청 찾기
        for (var requestId in window._pendingRequests) {
          var pending = window._pendingRequests[requestId];
          delete window._pendingRequests[requestId];
          pending.resolve(result);
          break;
        }
      };

      // 브릿지 준비 완료 이벤트 (레거시 호환용 FlutterBridgeReady도 유지)
      window.dispatchEvent(new Event('NativeBridgeReady'));
      window.dispatchEvent(new Event('FlutterBridgeReady'));

      // 콜백 호출 (레거시 호환)
      if (typeof window.onNativeBridgeReady === 'function') {
        window.onNativeBridgeReady();
      }
      if (typeof window.onFlutterBridgeReady === 'function') {
        window.onFlutterBridgeReady();
      }

      console.log('[WebViewBridge] NativeBridge initialized (RN)');
    })();
    true;
  `;
};

/**
 * WebView 메시지 핸들러 타입
 */
export type MessageHandler = (message: BridgeMessage) => void;

export const createMessageHandler = (handlers: {
  onShowImagePicker?: () => Promise<ImagePickerResult | null>;
  onPickImage?: (source: 'camera' | 'gallery') => Promise<ImagePickerResult | null>;
  onPickImageFromCamera?: () => Promise<ImagePickerResult | null>;
  onPickImageFromGallery?: () => Promise<ImagePickerResult | null>;
  onCheckPermission?: (permissionType: 'camera' | 'photos') => Promise<PermissionStatus>;
  onGetFcmToken?: () => Promise<string | null>;
  onLoginSuccess?: (accessToken: string) => void;
  onLogout?: () => void;
  onDownloadFile?: (url: string, fileName: string) => void;
  onOpenExternalLink?: (url: string) => void;
  onShareContent?: (title: string, message: string, url: string) => void;
}): MessageHandler => {
  return async (message: BridgeMessage) => {
    const { type, action, data, source } = message;
    const actionType = action || type;

    switch (actionType) {
      case 'showImagePicker':
        if (handlers.onShowImagePicker) {
          const result = await handlers.onShowImagePicker();
          return { type: 'imagePickerResult', result };
        }
        break;

      case 'pickImage':
        if (handlers.onPickImage && source) {
          const result = await handlers.onPickImage(source);
          return { type: 'pickImageResult', result };
        }
        break;

      case 'pickImageFromCamera':
        if (handlers.onPickImageFromCamera) {
          const result = await handlers.onPickImageFromCamera();
          return { type: 'cameraResult', result };
        }
        break;

      case 'pickImageFromGallery':
        if (handlers.onPickImageFromGallery) {
          const result = await handlers.onPickImageFromGallery();
          return { type: 'galleryResult', result };
        }
        break;

      case 'checkPermission':
        if (handlers.onCheckPermission && data) {
          const permType = (data as { permissionType?: string; type?: string }).permissionType ||
            (data as { type?: string }).type;
          if (permType) {
            const result = await handlers.onCheckPermission(permType as 'camera' | 'photos');
            return { type: 'permissionResult', result };
          }
        }
        break;

      case 'getFcmToken':
        if (handlers.onGetFcmToken) {
          const result = await handlers.onGetFcmToken();
          return { type: 'fcmTokenResult', result };
        }
        break;

      case 'notifyLoginSuccess':
        if (handlers.onLoginSuccess && data) {
          const { accessToken } = data as { accessToken: string };
          handlers.onLoginSuccess(accessToken);
        }
        break;

      case 'notifyLogout':
        if (handlers.onLogout) {
          handlers.onLogout();
        }
        break;

      case 'downloadFile':
        if (handlers.onDownloadFile && data) {
          const { url, fileName } = data as { url: string; fileName: string };
          handlers.onDownloadFile(url, fileName);
        }
        break;

      case 'openExternalLink':
        if (handlers.onOpenExternalLink && data) {
          const { url } = data as { url: string };
          handlers.onOpenExternalLink(url);
        }
        break;

      case 'shareContent':
        if (handlers.onShareContent && data) {
          const { title, message, url } = data as { title: string; message: string; url: string };
          handlers.onShareContent(title, message, url);
        }
        break;
    }

    return null;
  };
};
