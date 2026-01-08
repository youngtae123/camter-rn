/**
 * WebViewContainer - FlutterBridge 호환 WebView 컨테이너
 * camter 웹앱과 동일한 방식의 네이티브 연동
 */

import React, { useRef, useCallback, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Alert, Platform, Linking, Share, ActionSheetIOS } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';

import {
  generateInjectedJavaScript,
  pickImageFromCamera,
  pickImageFromGallery,
  pickImage,
  checkPermission,
  BridgeMessage,
  ImagePickerResult,
} from '../utils/webviewBridge';
import { getFcmToken, syncFcmTokenToServer } from '../services/fcmService';
import { downloadFile } from '../services/downloadService';

interface WebViewContainerProps {
  uri: string;
  onNavigationStateChange?: (navState: { url: string; title?: string }) => void;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
  onError?: (error: string) => void;
  deepLinkPath?: string;
}

export interface WebViewContainerRef {
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  navigateTo: (path: string) => void;
  injectJavaScript: (script: string) => void;
}

const WebViewContainer = forwardRef<WebViewContainerRef, WebViewContainerProps>(
  ({ uri, onNavigationStateChange, onLoadStart, onLoadEnd, onError, deepLinkPath }, ref) => {
    const webViewRef = useRef<WebView>(null);
    const [currentUrl, setCurrentUrl] = useState(uri);

    // ref를 통해 외부에서 WebView 제어
    useImperativeHandle(ref, () => ({
      goBack: () => webViewRef.current?.goBack(),
      goForward: () => webViewRef.current?.goForward(),
      reload: () => webViewRef.current?.reload(),
      navigateTo: (path: string) => {
        const script = `window.location.href = '${path}';`;
        webViewRef.current?.injectJavaScript(script);
      },
      injectJavaScript: (script: string) => {
        webViewRef.current?.injectJavaScript(script);
      },
    }));

    // 딥링크 경로가 있으면 WebView 네비게이션
    useEffect(() => {
      if (deepLinkPath && webViewRef.current) {
        const baseUrl = uri.replace(/\/$/, '');
        const targetUrl = `${baseUrl}${deepLinkPath}`;
        webViewRef.current.injectJavaScript(`window.location.href = '${targetUrl}'; true;`);
      }
    }, [deepLinkPath, uri]);

    /**
     * 이미지 선택 액션시트 표시
     */
    const showImagePickerActionSheet = useCallback((): Promise<ImagePickerResult | null> => {
      return new Promise((resolve) => {
        if (Platform.OS === 'ios') {
          ActionSheetIOS.showActionSheetWithOptions(
            {
              options: ['취소', '카메라', '갤러리'],
              cancelButtonIndex: 0,
            },
            async (buttonIndex) => {
              if (buttonIndex === 1) {
                const result = await pickImageFromCamera();
                resolve(result);
              } else if (buttonIndex === 2) {
                const result = await pickImageFromGallery();
                resolve(result);
              } else {
                resolve(null);
              }
            }
          );
        } else {
          // Android: Alert로 선택지 표시
          Alert.alert(
            '사진 선택',
            '사진을 어떻게 선택할까요?',
            [
              {
                text: '취소',
                style: 'cancel',
                onPress: () => resolve(null),
              },
              {
                text: '카메라',
                onPress: async () => {
                  const result = await pickImageFromCamera();
                  resolve(result);
                },
              },
              {
                text: '갤러리',
                onPress: async () => {
                  const result = await pickImageFromGallery();
                  resolve(result);
                },
              },
            ],
            { cancelable: true, onDismiss: () => resolve(null) }
          );
        }
      });
    }, []);

    /**
     * WebView 메시지를 JavaScript로 전송 (기존 방식)
     */
    const sendResultToWebView = useCallback((type: string, result: unknown) => {
      if (webViewRef.current) {
        const script = `
          if (window.handleNativeResponse) {
            window.handleNativeResponse('${type}', ${JSON.stringify(result)});
          }
          true;
        `;
        webViewRef.current.injectJavaScript(script);
      }
    }, []);

    /**
     * Flutter 호환 응답 전송 (requestId 기반)
     */
    const sendFlutterResponse = useCallback((requestId: string, success: boolean, data: unknown, error?: string) => {
      if (webViewRef.current) {
        const response = {
          requestId,
          success,
          data: success ? data : null,
          error: success ? undefined : (error || 'Unknown error'),
        };
        const script = `
          if (window.handleFlutterResponse) {
            window.handleFlutterResponse(${JSON.stringify(response)});
          }
          true;
        `;
        webViewRef.current.injectJavaScript(script);
      }
    }, []);

    /**
     * WebView 메시지 핸들러
     */
    const handleMessage = useCallback(
      async (event: WebViewMessageEvent) => {
        try {
          const message: BridgeMessage = JSON.parse(event.nativeEvent.data);
          const { type, action, data, source, requestId } = message;

          // action 또는 type 사용 (Flutter 호환)
          const actionType = action || type;

          console.log('[WebViewContainer] Message received:', actionType, requestId ? `(requestId: ${requestId})` : '');

          switch (actionType) {
            // Flutter 호환: pickImage (source 지정)
            case 'pickImage': {
              try {
                if (source) {
                  const result = await pickImage(source);
                  if (requestId) {
                    sendFlutterResponse(requestId, result !== null, result);
                  } else {
                    sendResultToWebView('pickImageResult', result);
                  }
                } else {
                  // source가 없으면 액션시트 표시
                  const result = await showImagePickerActionSheet();
                  if (requestId) {
                    sendFlutterResponse(requestId, result !== null, result);
                  } else {
                    sendResultToWebView('pickImageResult', result);
                  }
                }
              } catch (error) {
                if (requestId) {
                  sendFlutterResponse(requestId, false, null, (error as Error).message);
                }
              }
              break;
            }

            case 'showImagePicker': {
              try {
                const result = await showImagePickerActionSheet();
                if (requestId) {
                  sendFlutterResponse(requestId, result !== null, result);
                } else {
                  sendResultToWebView('imagePickerResult', result);
                }
              } catch (error) {
                if (requestId) {
                  sendFlutterResponse(requestId, false, null, (error as Error).message);
                }
              }
              break;
            }

            case 'pickImageFromCamera': {
              try {
                const result = await pickImageFromCamera();
                if (requestId) {
                  sendFlutterResponse(requestId, result !== null, result);
                } else {
                  sendResultToWebView('cameraResult', result);
                }
              } catch (error) {
                if (requestId) {
                  sendFlutterResponse(requestId, false, null, (error as Error).message);
                }
              }
              break;
            }

            case 'pickImageFromGallery': {
              try {
                const result = await pickImageFromGallery();
                if (requestId) {
                  sendFlutterResponse(requestId, result !== null, result);
                } else {
                  sendResultToWebView('galleryResult', result);
                }
              } catch (error) {
                if (requestId) {
                  sendFlutterResponse(requestId, false, null, (error as Error).message);
                }
              }
              break;
            }

            case 'checkPermission': {
              try {
                if (data) {
                  const permType = (data as { permissionType?: string; type?: string }).permissionType ||
                                  (data as { type?: string }).type;
                  if (permType) {
                    const result = await checkPermission(permType as 'camera' | 'photos');
                    if (requestId) {
                      sendFlutterResponse(requestId, true, result);
                    } else {
                      sendResultToWebView('permissionResult', result);
                    }
                  }
                }
              } catch (error) {
                if (requestId) {
                  sendFlutterResponse(requestId, false, null, (error as Error).message);
                }
              }
              break;
            }

            case 'getFcmToken': {
              try {
                const token = await getFcmToken();
                if (requestId) {
                  sendFlutterResponse(requestId, token !== null, token);
                } else {
                  sendResultToWebView('fcmTokenResult', token);
                }
              } catch (error) {
                if (requestId) {
                  sendFlutterResponse(requestId, false, null, (error as Error).message);
                }
              }
              break;
            }

            case 'notifyLoginSuccess': {
              if (data) {
                const { accessToken } = data as { accessToken: string };
                // 로그인 성공 시 FCM 토큰 서버 동기화
                const fcmToken = await getFcmToken();
                if (fcmToken && accessToken) {
                  await syncFcmTokenToServer(fcmToken, accessToken);
                }
              }
              break;
            }

            case 'notifyLogout': {
              // 로그아웃 시 필요한 처리
              console.log('[WebViewContainer] User logged out');
              break;
            }

            case 'downloadFile': {
              if (data) {
                const { url, fileName } = data as { url: string; fileName: string };
                await downloadFile(url, fileName);
              }
              break;
            }

            case 'openExternalLink': {
              if (data) {
                const { url } = data as { url: string };
                const supported = await Linking.canOpenURL(url);
                if (supported) {
                  await Linking.openURL(url);
                } else {
                  console.warn('Cannot open URL:', url);
                }
              }
              break;
            }

            case 'shareContent': {
              if (data) {
                const { title, message: shareMessage, url: shareUrl } = data as {
                  title: string;
                  message: string;
                  url: string;
                };
                await Share.share({
                  title,
                  message: shareUrl ? `${shareMessage}\n${shareUrl}` : shareMessage,
                  url: shareUrl,
                });
              }
              break;
            }

            default:
              console.warn('[WebViewContainer] Unknown message type:', actionType);
          }
        } catch (error) {
          console.error('[WebViewContainer] Message handling error:', error);
        }
      },
      [showImagePickerActionSheet, sendResultToWebView, sendFlutterResponse]
    );

    /**
     * 네비게이션 상태 변경 핸들러
     */
    const handleNavigationStateChange = useCallback(
      (navState: { url: string; title?: string }) => {
        setCurrentUrl(navState.url);
        onNavigationStateChange?.(navState);
      },
      [onNavigationStateChange]
    );

    /**
     * 외부 URL 처리 (카카오, 토스 등)
     */
    const handleShouldStartLoadWithRequest = useCallback((request: { url: string }) => {
      const { url } = request;

      // 카카오톡 딥링크
      if (url.startsWith('kakaolink://') || url.startsWith('kakao')) {
        Linking.openURL(url).catch(console.error);
        return false;
      }

      // 토스 결제
      if (url.startsWith('supertoss://') || url.startsWith('tosspayments://')) {
        Linking.openURL(url).catch(console.error);
        return false;
      }

      // 플레이스토어/앱스토어
      if (
        url.startsWith('market://') ||
        url.startsWith('itms-apps://') ||
        url.includes('play.google.com') ||
        url.includes('apps.apple.com')
      ) {
        Linking.openURL(url).catch(console.error);
        return false;
      }

      // intent 스킴 (Android)
      if (url.startsWith('intent://')) {
        const match = url.match(/intent:\/\/.*?#Intent;.*?package=([^;]+)/);
        if (match) {
          const packageName = match[1];
          const playStoreUrl = `market://details?id=${packageName}`;
          Linking.openURL(playStoreUrl).catch(console.error);
        }
        return false;
      }

      // 전화, 이메일, SMS
      if (url.startsWith('tel:') || url.startsWith('mailto:') || url.startsWith('sms:')) {
        Linking.openURL(url).catch(console.error);
        return false;
      }

      return true;
    }, []);

    /**
     * 에러 핸들러
     */
    const handleError = useCallback(
      (syntheticEvent: { nativeEvent: { description: string } }) => {
        const { description } = syntheticEvent.nativeEvent;
        console.error('[WebViewContainer] Error:', description);
        onError?.(description);
      },
      [onError]
    );

    return (
      <WebView
        ref={webViewRef}
        source={{ uri: currentUrl }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        allowsBackForwardNavigationGestures={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="compatibility"
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        injectedJavaScript={generateInjectedJavaScript()}
        onMessage={handleMessage}
        onNavigationStateChange={handleNavigationStateChange}
        onLoadStart={onLoadStart}
        onLoadEnd={onLoadEnd}
        onError={handleError}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        // iOS 설정
        allowsLinkPreview={false}
        bounces={true}
        // Android 설정
        overScrollMode="never"
        cacheEnabled={true}
        geolocationEnabled={true}
      />
    );
  }
);

WebViewContainer.displayName = 'WebViewContainer';

const styles = StyleSheet.create({
  webview: {
    flex: 1,
  },
});

export default WebViewContainer;
