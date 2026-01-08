/**
 * Camter React Native App
 * WebView 기반 하이브리드 앱 with FCM, Deep Link 지원
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  SafeAreaView,
  StyleSheet,
  Platform,
  BackHandler,
  Alert,
  View,
  ActivityIndicator,
  Text,
} from 'react-native';

import WebViewContainer, { WebViewContainerRef } from './src/components/WebViewContainer';
import { useDeepLink } from './src/hooks/useDeepLink';
import { usePushNotification } from './src/hooks/usePushNotification';

// WebView URL
const WEBVIEW_URL = process.env.EXPO_PUBLIC_WEBVIEW_URL || 'https://camter-client.vercel.app/';

export default function App() {
  const webViewRef = useRef<WebViewContainerRef>(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true); // 최초 로딩만 표시
  const [canGoBack, setCanGoBack] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(WEBVIEW_URL);

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
   */
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // 홈 화면이면 앱 종료 확인
      const isHomePage =
        currentUrl === WEBVIEW_URL ||
        currentUrl === `${WEBVIEW_URL}/` ||
        currentUrl.endsWith('/home') ||
        (!currentUrl.includes('/') || currentUrl.split('/').filter(Boolean).length <= 3);

      if (!canGoBack || isHomePage) {
        Alert.alert(
          '앱 종료',
          '앱을 종료하시겠습니까?',
          [
            { text: '취소', style: 'cancel' },
            { text: '종료', onPress: () => BackHandler.exitApp() },
          ],
          { cancelable: true }
        );
        return true;
      }

      // WebView 뒤로가기
      webViewRef.current?.goBack();
      return true;
    });

    return () => backHandler.remove();
  }, [canGoBack, currentUrl]);

  /**
   * 네비게이션 상태 변경 처리
   */
  const handleNavigationStateChange = useCallback((navState: { url: string; title?: string }) => {
    setCurrentUrl(navState.url);
    // canGoBack은 WebView 내부 히스토리 기반으로 결정
    // 현재는 URL 기반으로 간단히 처리
    setCanGoBack(navState.url !== WEBVIEW_URL && navState.url !== `${WEBVIEW_URL}/`);
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

  // 초기화 중 스플래시 표시
  if (!isDeepLinkReady || !isPushInitialized) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00AC6A" />
          <Text style={styles.loadingText}>캠터 로딩중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* WebView */}
      <WebViewContainer
        ref={webViewRef}
        uri={WEBVIEW_URL}
        deepLinkPath={deepLinkPath || undefined}
        onNavigationStateChange={handleNavigationStateChange}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
      />

      {/* 최초 로딩 오버레이 */}
      {isFirstLoad && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#00AC6A" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? 25 : 0,
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
});
