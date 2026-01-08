/**
 * usePushNotification - 푸시 알림 관리 훅
 * FCM 토큰 관리, 알림 수신, 딥링크 처리
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { AppState, AppStateStatus, Platform } from 'react-native';

import {
  getFcmToken,
  getStoredFcmToken,
  syncFcmTokenToServer,
  configureNotificationPresentation,
  extractDeepLinkFromNotification,
  clearBadge,
  clearFcmToken,
} from '../services/fcmService';

interface UsePushNotificationOptions {
  onNotificationReceived?: (notification: Notifications.Notification) => void;
  onDeepLink?: (path: string) => void;
}

interface UsePushNotificationResult {
  fcmToken: string | null;
  isPermissionGranted: boolean;
  isInitialized: boolean;
  lastNotification: Notifications.Notification | null;
  requestPermission: () => Promise<boolean>;
  syncTokenWithServer: (accessToken: string) => Promise<boolean>;
  handleLoginSuccess: (accessToken: string) => Promise<void>;
  handleLogout: () => Promise<void>;
}

export const usePushNotification = (
  options: UsePushNotificationOptions = {}
): UsePushNotificationResult => {
  const { onNotificationReceived, onDeepLink } = options;

  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [isPermissionGranted, setIsPermissionGranted] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [lastNotification, setLastNotification] = useState<Notifications.Notification | null>(null);

  const appState = useRef(AppState.currentState);
  const accessTokenRef = useRef<string | null>(null);
  const onDeepLinkRef = useRef(onDeepLink);
  const onNotificationReceivedRef = useRef(onNotificationReceived);

  // 콜백 ref 업데이트
  useEffect(() => {
    onDeepLinkRef.current = onDeepLink;
    onNotificationReceivedRef.current = onNotificationReceived;
  }, [onDeepLink, onNotificationReceived]);

  /**
   * 알림 권한 요청 및 토큰 획득
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      // 시뮬레이터 체크
      if (!Device.isDevice) {
        console.log('[usePushNotification] Skipping push on simulator');
        return false;
      }

      const token = await getFcmToken();

      if (token) {
        setFcmToken(token);
        setIsPermissionGranted(true);
        return true;
      }

      setIsPermissionGranted(false);
      return false;
    } catch (error) {
      console.error('[usePushNotification] Permission request error:', error);
      return false;
    }
  }, []);

  /**
   * FCM 토큰 서버 동기화
   */
  const syncTokenWithServer = useCallback(async (accessToken: string): Promise<boolean> => {
    try {
      const token = fcmToken || (await getStoredFcmToken());

      if (!token) {
        console.warn('[usePushNotification] No FCM token to sync');
        return false;
      }

      const result = await syncFcmTokenToServer(token, accessToken);
      return result?.code === 'SUCCESS';
    } catch (error) {
      console.error('[usePushNotification] Token sync error:', error);
      return false;
    }
  }, [fcmToken]);

  /**
   * 로그인 성공 처리
   */
  const handleLoginSuccess = useCallback(async (accessToken: string): Promise<void> => {
    console.log('[usePushNotification] Login success, syncing FCM token...');
    accessTokenRef.current = accessToken;

    // 토큰이 없으면 새로 요청
    if (!fcmToken) {
      await requestPermission();
    }

    // 서버 동기화
    await syncTokenWithServer(accessToken);
  }, [fcmToken, requestPermission, syncTokenWithServer]);

  /**
   * 로그아웃 처리
   */
  const handleLogout = useCallback(async (): Promise<void> => {
    console.log('[usePushNotification] Logout, clearing FCM data...');
    accessTokenRef.current = null;

    // FCM 토큰 삭제
    await clearFcmToken();
    setFcmToken(null);

    // 배지 초기화
    await clearBadge();
  }, []);

  /**
   * 앱 상태 변경 핸들러
   */
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('[usePushNotification] App came to foreground');
        await clearBadge();
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  /**
   * 초기화
   */
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        console.log('[usePushNotification] Initializing...');

        // 알림 표시 설정
        configureNotificationPresentation();

        // 저장된 토큰 확인
        const storedToken = await getStoredFcmToken();
        if (storedToken && mounted) {
          setFcmToken(storedToken);
          setIsPermissionGranted(true);
        }

        // 초기화 완료
        if (mounted) {
          setIsInitialized(true);
          console.log('[usePushNotification] Initialized successfully');
        }
      } catch (error) {
        console.error('[usePushNotification] Initialization error:', error);
        if (mounted) {
          setIsInitialized(true); // 에러가 나도 초기화 완료로 처리
        }
      }
    };

    initialize();

    return () => {
      mounted = false;
    };
  }, []); // 빈 dependency array - 마운트 시 한 번만 실행

  /**
   * 알림 리스너 설정
   */
  useEffect(() => {
    // 앱이 포그라운드일 때 알림 수신
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      console.log('[usePushNotification] Notification received');
      setLastNotification(notification);
      onNotificationReceivedRef.current?.(notification);
    });

    // 사용자가 알림을 탭했을 때
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('[usePushNotification] Notification tapped');

      const notification = response.notification;
      setLastNotification(notification);

      // 딥링크 경로 추출
      const deepLinkPath = extractDeepLinkFromNotification(notification);
      if (deepLinkPath && onDeepLinkRef.current) {
        console.log('[usePushNotification] Deep link from notification:', deepLinkPath);
        onDeepLinkRef.current(deepLinkPath);
      }
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, []); // 빈 dependency array - 마운트 시 한 번만 실행

  /**
   * 초기화 후 토큰 요청 (실제 디바이스에서만)
   */
  useEffect(() => {
    if (isInitialized && !fcmToken && Device.isDevice) {
      requestPermission();
    }
  }, [isInitialized, fcmToken, requestPermission]);

  return {
    fcmToken,
    isPermissionGranted,
    isInitialized,
    lastNotification,
    requestPermission,
    syncTokenWithServer,
    handleLoginSuccess,
    handleLogout,
  };
};

export default usePushNotification;
