/**
 * Camter React Native App
 * WebView 기반 하이브리드 앱 with FCM, Deep Link 지원
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Platform,
  BackHandler,
  Alert,
  View,
  ActivityIndicator,
  Text,
  Image,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Localization from 'expo-localization';
import messaging from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';

import WebViewContainer, { WebViewContainerRef } from './src/components/WebViewContainer';
import { useDeepLink } from './src/hooks/useDeepLink';
import { usePushNotification } from './src/hooks/usePushNotification';
import { initKakaoSDK } from './src/services/kakaoShareService';
import AppExitSnackbar from './src/components/AppExitSnackbar';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch(() => {
  /* reloading the app might trigger some race conditions, ignore them */
});

// Expo Notifications 설정 (포그라운드 알림 표시)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// WebView URL
const WEBVIEW_URL = process.env.EXPO_PUBLIC_WEBVIEW_URL || 'https://camter-client.vercel.app/';

export default function App() {
  const webViewRef = useRef<WebViewContainerRef>(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true); // 최초 로딩만 표시
  const [canGoBack, setCanGoBack] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(WEBVIEW_URL);
  const [lastAppUrl, setLastAppUrl] = useState(WEBVIEW_URL);

  // Localized Splash Logic
  const [isAppReady, setIsAppReady] = useState(false);
  const [splashImage, setSplashImage] = useState<any>(null);

  // App Exit Logic State
  const lastBackPress = useRef<number>(0);
  const [exitSnackbarVisible, setExitSnackbarVisible] = useState(false);

  // 딥링크 훅
  const {
    webViewPath: deepLinkPath,
    isReady: isDeepLinkReady,
    clearDeepLink,
  } = useDeepLink();

  // 푸시 알림 훅
  const {
    fcmToken,
    isInitialized: isPushInitialized,
    handleLoginSuccess,
    handleLogout,
  } = usePushNotification({
    onDeepLink: (path) => {
      console.log('[App] Push notification deep link:', path);
      webViewRef.current?.navigateTo(path);
    },
  });

  // 초기화 및 언어 감지
  useEffect(() => {
    async function prepare() {
      try {
        // 언어 감지 (기본값 ko)
        const locales = Localization.getLocales();
        const languageCode = locales[0]?.languageCode || 'ko';
        console.log('[App] Detected language:', languageCode);

        if (languageCode === 'ko') {
          setSplashImage(require('./assets/splash-icon.png'));
        } else {
          setSplashImage(require('./assets/splash-icon.png'));
        }

        // 카카오 SDK 초기화
        await initKakaoSDK();

        // Firebase Messaging 권한 요청 및 리스너 설정
        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (enabled) {
          console.log('[App] Firebase messaging permission granted:', authStatus);
        }

        // 포그라운드 메시지 리스너
        const unsubscribeForeground = messaging().onMessage(async remoteMessage => {
          console.log('[App] FCM Foreground message received:', JSON.stringify(remoteMessage));

          // Expo Notifications로 시스템 알림 표시
          await Notifications.scheduleNotificationAsync({
            content: {
              title: remoteMessage.notification?.title || '알림',
              body: remoteMessage.notification?.body || '',
              data: remoteMessage.data,
            },
            trigger: null,
          });
        });

        // 백그라운드/종료 상태에서 알림 탭 시
        messaging().onNotificationOpenedApp(remoteMessage => {
          console.log('[App] FCM Notification opened app:', remoteMessage);
        });

        // 앱이 종료된 상태에서 알림으로 열렸을 때
        messaging()
          .getInitialNotification()
          .then(remoteMessage => {
            if (remoteMessage) {
              console.log('[App] FCM Initial notification:', remoteMessage);
            }
          });

      } catch (e) {
        console.warn('[App] Prepare error:', e);
      } finally {
        // Tell the application to render
        setIsAppReady(true);
      }
    }

    prepare();
  }, []);

  // 모든 준비가 완료되었을 때 네이티브 스플래시 숨김
  const onLayoutRootView = useCallback(async () => {
    if (isAppReady && isDeepLinkReady && isPushInitialized) {
      await SplashScreen.hideAsync();
    }
  }, [isAppReady, isDeepLinkReady, isPushInitialized]);

  // 카카오 SDK 초기화 (useEffect merged above)

  /**
   * 딥링크 처리
   */
  useEffect(() => {
    if (deepLinkPath && isDeepLinkReady) {
      console.log('[App] Navigating to deep link path:', deepLinkPath);
      webViewRef.current?.navigateTo(deepLinkPath);
      clearDeepLink();
    }
  }, [deepLinkPath, isDeepLinkReady, clearDeepLink]);

  /**
   * Android 뒤로가기 버튼 처리
   * Double Back to Exit 패턴 적용 (Flutter 앱과 동일한 UX)
   */
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const isPaymentUrl = (url: string) => {
      return (
        url.includes('tosspayments.com') ||
        url.includes('pay.toss.im') ||
        url.includes('payment-gateway.tosspayments.com') ||
        url.includes('payment-gateway-sandbox.tosspayments.com')
      );
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isPaymentUrl(currentUrl)) {
        // 결제창에서는 WebView 히스토리를 우선 소진하고, 없으면 앱 내 마지막 URL로 복귀
        if (canGoBack) {
          console.log('[App] Back pressed on payment URL - goBack');
          webViewRef.current?.goBack();
        } else if (lastAppUrl) {
          console.log('[App] Back pressed on payment URL - navigating to last app URL');
          const script = `window.location.href='${lastAppUrl}'; true;`;
          webViewRef.current?.injectJavaScript(script);
        }
        return true;
      }

      // 1. WebView 히스토리가 있으면 뒤로가기 (단, 홈 페이지가 아닐 때)
      // 홈 페이지 정의: 기본 URL, /home 등
      const isHomePage =
        currentUrl === WEBVIEW_URL ||
        currentUrl === `${WEBVIEW_URL}/` ||
        currentUrl.endsWith('/home') ||
        (!currentUrl.includes('/') || currentUrl.split('/').filter(Boolean).length <= 3);

      if (canGoBack && !isHomePage) {
        console.log('[App] Back button pressed - navigating back in WebView');
        webViewRef.current?.goBack();
        return true;
      }

      // 2. 앱 종료 확인 로직 (Flutter HomeNotificationUtil.showBottomToast 유사 구현)
      const now = Date.now();
      const EXIT_TIMEOUT = 2000; // 2초

      if (lastBackPress.current && now - lastBackPress.current < EXIT_TIMEOUT) {
        BackHandler.exitApp(); // 2초 내 재클릭 시 종료
        return true;
      }

      // 3. 첫 번째 클릭: 스낵바 표시 및 타이머 리셋
      lastBackPress.current = now;
      setExitSnackbarVisible(true);

      // 2초 후 스낵바 자동으로 숨김 상태로 변경 (UI 처리)
      // 실제 숨김 애니메이션은 컴포넌트 내부에서 처리되거나, 여기서 상태를 꺼도 됨.
      // 여기서는 명확한 상태 관리를 위해 setTimeout으로 상태를 끔.
      setTimeout(() => {
        setExitSnackbarVisible(false);
      }, EXIT_TIMEOUT);

      return true;
    });

    return () => backHandler.remove();
  }, [canGoBack, currentUrl]);

  /**
   * 네비게이션 상태 변경 처리
   */
  const handleNavigationStateChange = useCallback((navState: { url: string; title?: string; canGoBack?: boolean }) => {
    setCurrentUrl(navState.url);
    // 앱 도메인 내 URL을 기억해 결제창 등 외부 페이지에서 복귀 시 사용
    if (navState.url.startsWith(WEBVIEW_URL)) {
      setLastAppUrl(navState.url);
    }
    // WebView의 실제 히스토리 기반으로 canGoBack 상태 업데이트
    // navState.canGoBack이 있으면 그 값을 사용, 없으면 URL 기반 판단
    if (navState.canGoBack !== undefined) {
      setCanGoBack(navState.canGoBack);
    } else {
      // fallback: URL 기반 판단
      setCanGoBack(navState.url !== WEBVIEW_URL && navState.url !== `${WEBVIEW_URL}/`);
    }
  }, []);

  /**
   * 로딩 완료 - 최초 로딩만 처리
   */
  const handleLoadEnd = useCallback(() => {
    if (isFirstLoad) {
      setIsFirstLoad(false);
    }
  }, [isFirstLoad]);

  /**
   * 에러 처리
   */
  const handleError = useCallback((error: string) => {
    console.error('[App] WebView error:', error);
    setIsFirstLoad(false);

    Alert.alert(
      '연결 오류',
      '페이지를 불러오는 데 실패했습니다.\n다시 시도해 주세요.',
      [
        { text: '다시 시도', onPress: () => webViewRef.current?.reload() },
      ]
    );
  }, []);

  // 초기화 중 스플래시 표시 (Override native loading with Custom Splash)
  if (!isAppReady || !isDeepLinkReady || !isPushInitialized) {
    return (
      <View style={styles.splashContainer} onLayout={onLayoutRootView}>
        {/* Show nothing or the determined image if needed immediately, 
             but typically onLayout handles the hide. 
             Ideally we render the Image here to replace native splash visually.
         */}
        {splashImage && (
          <Image
            source={splashImage}
            style={styles.splashImage}
            resizeMode="contain"
          />
        )}
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']} onLayout={onLayoutRootView}>
        < StatusBar style="dark" />

        {/* WebView */}
        < WebViewContainer
          ref={webViewRef}
          uri={WEBVIEW_URL}
          deepLinkPath={deepLinkPath || undefined}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadEnd={handleLoadEnd}
          onError={handleError}
        />

        {/* 최초 로딩 오버레이 (웹뷰 로딩 중) */}
        {isFirstLoad && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#00AC6A" />
          </View>
        )}

        {/* 앱 종료 확인 스낵바 (최상위 배치) */}
        <AppExitSnackbar visible={exitSnackbarVisible} />
      </SafeAreaView>
    </SafeAreaProvider >
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Fullscreen splash style
  splashContainer: {
    flex: 1,
    backgroundColor: '#00AC6A', // Match splash background color
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashImage: {
    width: '100%',
    height: '100%',
  },
});
