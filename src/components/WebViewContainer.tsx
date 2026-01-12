/**
 * WebViewContainer - NativeBridge WebView 컨테이너
 * camter 웹앱과 React Native 앱 간의 네이티브 연동
 *
 * 이미지 선택 UI는 웹의 BottomModal을 사용하며,
 * RN은 네이티브 카메라/갤러리 기능만 실행합니다.
 */

import React, { useRef, useCallback, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Linking, Share, AppState, AppStateStatus, Platform } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { ConvertUrl } from '@tosspayments/widget-sdk-react-native/src/utils/convertUrl';

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
import { shareKakaoFeed, initKakaoSDK } from '../services/kakaoShareService';

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
    // URL과 헤더를 포함한 Source 상태 관리
    const [webviewSource, setWebviewSource] = useState<{ uri: string; headers?: Record<string, string> }>({ uri });
    const appState = useRef(AppState.currentState);

    // 메시지 큐: WebView가 준비되지 않았거나 앱이 백그라운드일 때 메시지 저장
    const messageQueue = useRef<string[]>([]);
    const isWebViewLoaded = useRef(false);

    // WebView가 JS를 실행할 수 있는 안정적인 상태인지 여부
    // 로드 완료 && 앱 포그라운드 && 포그라운드 전환 후 안정화 시간 경과
    const isWebViewInteractive = useRef(false);

    // OAuth 중복 요청 방지용 타임스탬프
    const lastOAuthCallbackTime = useRef(0);

    // 앱 상태 변경 감지 및 안정화 처리
    useEffect(() => {
      const subscription = AppState.addEventListener('change', (nextAppState) => {
        const wasBackground = appState.current.match(/inactive|background/);
        const isForeground = nextAppState === 'active';

        appState.current = nextAppState;

        if (wasBackground && isForeground) {
          console.log('[WebViewContainer] App came to foreground, stabilizing WebView...');
          // 포그라운드 전환 직후에는 WebView가 JS를 놓칠 수 있으므로 약간의 지연 후 활성화
          setTimeout(() => {
            console.log(`[WebViewContainer] Stabilization check: AppState=${appState.current}, Loaded=${isWebViewLoaded.current}`);
            if (appState.current === 'active' && isWebViewLoaded.current) {
              console.log('[WebViewContainer] WebView is now interactive, processing queue');
              isWebViewInteractive.current = true;
              processMessageQueue();
            } else {
              console.warn('[WebViewContainer] Stabilization failed or delayed');
            }
          }, 800); // 800ms로 안정화 시간 확보
        } else if (nextAppState.match(/inactive|background/)) {
          console.log('[WebViewContainer] App went to background/inactive');
          isWebViewInteractive.current = false;
        }
      });

      return () => {
        subscription.remove();
      };
    }, []);

    const processMessageQueue = useCallback(() => {
      if (webViewRef.current && messageQueue.current.length > 0) {
        console.log(`[WebViewContainer] Processing ${messageQueue.current.length} queued messages`);
        // 큐에 있는 모든 스크립트 실행
        while (messageQueue.current.length > 0) {
          const script = messageQueue.current.shift();
          if (script) {
            webViewRef.current.injectJavaScript(script);
          }
        }
      }
    }, []);

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
     * WebView 메시지를 JavaScript로 전송 (타입 기반 응답)
     */
    const sendResultToWebView = useCallback((type: string, result: unknown) => {
      if (webViewRef.current) {
        const script = `
          if (window.handleNativeResponseByType) {
            window.handleNativeResponseByType('${type}', ${JSON.stringify(result)});
          }
          true;
        `;
        webViewRef.current.injectJavaScript(script);
      }
    }, []);

    /**
     * 네이티브 응답 전송 (requestId 기반)
     * 웹의 nativeBridge.ts가 window.handleNativeResponse를 등록
     * 안정성을 위해 재시도 로직 및 큐잉 추가
     */
    const sendNativeResponse = useCallback((requestId: string, success: boolean, data: unknown, error?: string) => {
      const response = {
        requestId,
        success,
        data: success ? data : null,
        error: success ? undefined : (error || 'Unknown error'),
      };

      const script = `
        setTimeout(function() {
          (function() {
            try {
              console.log('[RN->Web] sendNativeResponse:', '${requestId}', 'success:', ${success});
              if (window.handleNativeResponse) {
                window.handleNativeResponse(${JSON.stringify(response)});
                console.log('[RN->Web] handleNativeResponse 호출 완료');
              } else {
                console.error('[RN->Web] handleNativeResponse not found!');
              }
            } catch (e) {
              console.error('[RN->Web] Error in sendNativeResponse:', e);
            }
          })();
        }, 100);
        true;
      `;

      // WebView가 인터랙티브한 상태일 때만 즉시 전송, 아니면 큐에 저장
      // (AppState가 active여도 화면 전환 직후에는 불안정할 수 있음)
      if (isWebViewInteractive.current && webViewRef.current) {
        webViewRef.current.injectJavaScript(script);
      } else {
        console.log('[WebViewContainer] WebView not ready/interactive, queuing message');
        messageQueue.current.push(script);
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

          // Web에서 메시지가 왔다는 것은 로드 완료 상태라는 뜻
          if (!isWebViewLoaded.current) {
            console.log('[WebViewContainer] Message received, marking WebView as loaded');
            isWebViewLoaded.current = true;
          }

          // action 또는 type 사용
          const actionType = action || type;

          console.log('[WebViewContainer] Message received:', actionType, requestId ? `(requestId: ${requestId})` : '');

          switch (actionType) {
            // pickImage: source 지정
            // 웹에서 BottomModal UI로 카메라/갤러리 선택 후 source와 함께 호출
            case 'pickImage': {
              console.log('[WebViewContainer] pickImage - source:', source, 'requestId:', requestId);
              try {
                if (source) {
                  // source가 지정되면 해당 기능 바로 실행
                  console.log('[WebViewContainer] pickImage - calling pickImage with source:', source);
                  const result = await pickImage(source);
                  console.log('[WebViewContainer] pickImage - result:', result ? `success (base64 length: ${result.base64?.length || 0})` : 'null/cancelled');
                  if (requestId) {
                    console.log('[WebViewContainer] pickImage - sending response, success:', result !== null);
                    sendNativeResponse(requestId, result !== null, result);
                  } else {
                    sendResultToWebView('pickImageResult', result);
                  }
                } else {
                  // source가 없으면 에러 반환 (웹에서 UI 선택 필요)
                  console.warn('[WebViewContainer] pickImage called without source');
                  if (requestId) {
                    sendNativeResponse(requestId, false, null, 'source is required (camera or gallery)');
                  } else {
                    sendResultToWebView('pickImageResult', null);
                  }
                }
              } catch (error) {
                console.error('[WebViewContainer] pickImage - error:', (error as Error).message);
                if (requestId) {
                  sendNativeResponse(requestId, false, null, (error as Error).message);
                }
              }
              break;
            }

            // showImagePicker: 웹에서 BottomModal UI 사용하도록 안내
            // 이 액션은 더 이상 네이티브 UI를 표시하지 않음
            case 'showImagePicker': {
              console.log('[WebViewContainer] showImagePicker - use web BottomModal UI instead');
              if (requestId) {
                // 웹에서 직접 UI를 처리하도록 알림
                sendNativeResponse(requestId, true, { useWebUI: true });
              } else {
                sendResultToWebView('imagePickerResult', { useWebUI: true });
              }
              break;
            }

            case 'pickImageFromCamera': {
              try {
                const result = await pickImageFromCamera();
                if (requestId) {
                  sendNativeResponse(requestId, result !== null, result);
                } else {
                  sendResultToWebView('cameraResult', result);
                }
              } catch (error) {
                if (requestId) {
                  sendNativeResponse(requestId, false, null, (error as Error).message);
                }
              }
              break;
            }

            case 'pickImageFromGallery': {
              try {
                const result = await pickImageFromGallery();
                if (requestId) {
                  sendNativeResponse(requestId, result !== null, result);
                } else {
                  sendResultToWebView('galleryResult', result);
                }
              } catch (error) {
                if (requestId) {
                  sendNativeResponse(requestId, false, null, (error as Error).message);
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
                      sendNativeResponse(requestId, true, result);
                    } else {
                      sendResultToWebView('permissionResult', result);
                    }
                  }
                }
              } catch (error) {
                if (requestId) {
                  sendNativeResponse(requestId, false, null, (error as Error).message);
                }
              }
              break;
            }

            case 'getFcmToken': {
              try {
                const token = await getFcmToken();
                if (requestId) {
                  sendNativeResponse(requestId, token !== null, token);
                } else {
                  sendResultToWebView('fcmTokenResult', token);
                }
              } catch (error) {
                if (requestId) {
                  sendNativeResponse(requestId, false, null, (error as Error).message);
                }
              }
              break;
            }

            case 'notifyLoginSuccess': {
              console.log('[WebViewContainer] notifyLoginSuccess received');
              // message에서 직접 accessToken 추출 (data가 아님!)
              const accessToken = (message as any).accessToken || (data as any)?.accessToken;
              console.log('[WebViewContainer] accessToken:', accessToken ? 'present' : 'missing');

              if (accessToken) {
                // 로그인 성공 시 FCM 토큰 서버 동기화
                console.log('[WebViewContainer] Fetching FCM token...');
                const fcmToken = await getFcmToken();
                console.log('[WebViewContainer] FCM token:', fcmToken ? `obtained (${fcmToken.substring(0, 20)}...)` : 'null');

                if (fcmToken) {
                  console.log('[WebViewContainer] Syncing FCM token to server...');
                  await syncFcmTokenToServer(fcmToken, accessToken);
                  console.log('[WebViewContainer] FCM token sync completed');
                } else {
                  console.warn('[WebViewContainer] FCM token not available');
                }
              } else {
                console.warn('[WebViewContainer] accessToken not found in message');
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

            case 'shareKakao': {
              try {
                // data 자체가 KakaoShareData 객체임 (nativeBridge.ts에서 { data: shareData } 형태로 보냄 -> message.data = shareData)
                // 타입체크를 위해 optional chaining 사용
                const shareParams = data as { title: string; description?: string; imageUrl?: string; webUrl: string; mobileWebUrl?: string; buttonTitle?: string; executionParams?: Record<string, string> } | undefined;

                console.log('[WebViewContainer] shareKakao data:', JSON.stringify(shareParams));

                if (shareParams && shareParams.title && shareParams.webUrl) {
                  // 카카오 SDK를 통한 공유 (딥링크 지원)
                  const success = await shareKakaoFeed({
                    title: shareParams.title,
                    description: shareParams.description,
                    imageUrl: shareParams.imageUrl,
                    webUrl: shareParams.webUrl,
                    mobileWebUrl: shareParams.mobileWebUrl,
                    buttonTitle: shareParams.buttonTitle || '자세히 보기',
                    executionParams: shareParams.executionParams,
                  });

                  if (requestId) {
                    sendNativeResponse(requestId, success, { success });
                  }
                } else {
                  console.warn('[WebViewContainer] shareKakao - invalid data:', data);
                  if (requestId) {
                    sendNativeResponse(requestId, false, null, 'Invalid share data');
                  }
                }
              } catch (error) {
                console.error('[WebViewContainer] Kakao share error:', error);
                // 카카오 SDK 실패 시 일반 공유로 fallback
                try {
                  const shareParams = data as { title: string; webUrl: string } | undefined;
                  if (shareParams && shareParams.title && shareParams.webUrl) {
                    await Share.share({
                      title: shareParams.title,
                      message: `${shareParams.title}\n${shareParams.webUrl}`,
                      url: shareParams.webUrl,
                    });
                    if (requestId) {
                      sendNativeResponse(requestId, true, { success: true, fallback: true });
                    }
                  }
                } catch (fallbackError) {
                  if (requestId) {
                    sendNativeResponse(requestId, false, null, (error as Error).message);
                  }
                }
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
      [sendResultToWebView, sendNativeResponse]
    );

    /**
     * 네비게이션 상태 변경 핸들러
     */
    const handleNavigationStateChange = useCallback(
      (navState: { url: string; title?: string }) => {
        // 디버깅: 모든 navigation 변경 로깅
        console.log('[WebViewContainer][NAV] URL changed:', navState.url);

        // OAuth 관련 URL 상세 로깅
        if (navState.url.includes('oauth') || navState.url.includes('auth') || navState.url.includes('apple')) {
          console.log('[WebViewContainer][NAV] 🔐 OAuth/Auth URL detected:', navState.url);
        }

        // URL이 변경되면 상태 업데이트 (헤더는 초기화) - 로직 제거 (무한 리로드/중복 요청 원인)
        // WebView는 내부적으로 네비게이션을 관리하므로, 굳이 source를 매번 업데이트할 필요가 없음
        // 단, 헤더 주입 등 강제 네비게이션이 필요할 때만 setWebviewSource 사용

        // setWebviewSource((prev) => { ... }); <--- 제거됨

        onNavigationStateChange?.(navState);
      },
      [onNavigationStateChange]
    );

    /**
     * 외부 URL 처리 (카카오, 토스 등)
     * 토스페이먼츠 공식 가이드: https://docs.tosspayments.com/resources/webview
     */
    const handleShouldStartLoadWithRequest = useCallback((request: { url: string }) => {
      const { url } = request;

      // OAuth 로그인 진입 시 Origin 헤더 주입 (iOS/Android 공통)
      // 백엔드에서 Origin 검증을 통과하기 위해 클라이언트 도메인 주입
      // 주의: 백엔드 URL에만 적용, Apple/Kakao 등 외부 OAuth 페이지에는 적용하지 않음
      // ⚠️ redirect_uri 파라미터에도 백엔드 URL이 포함되어 있으므로 hostname으로 정확히 체크
      const isBackendOAuthAuthorize =
        url.startsWith('https://dev.api.camter.co.kr') &&
        url.includes('/oauth2/') &&
        url.includes('/authorize');

      if (isBackendOAuthAuthorize) {
        console.log('[WebViewContainer][DEBUG] Backend OAuth authorize URL detected:', url);
        const targetOrigin = 'https://camter-client.vercel.app';
        const hasOriginHeader = webviewSource.headers?.['Origin'] === targetOrigin;

        if (!hasOriginHeader) {
          console.log('[WebViewContainer][DEBUG] Injecting Origin header for OAuth:', url);
          setWebviewSource({
            uri: url,
            headers: { Origin: targetOrigin },
          });
          return false; // 현재 로드 중단하고 헤더 포함해서 재로드
        } else {
          console.log('[WebViewContainer][DEBUG] Origin header already set, proceeding');
        }
      }

      // OAuth 콜백 URL - 백엔드가 POST를 받아 처리하고 /auth/success로 리다이렉트함
      // WebView는 이 리다이렉트를 따라가며, Universal Link가 자동으로 발동됨
      // 따라서 콜백 URL을 차단하지 않고 자연스럽게 진행시킴


      // OAuth 콜백 URL - 백엔드가 POST를 받아 처리하고 /auth/success로 리다이렉트함
      // WebView는 이 리다이렉트를 따라가며, Universal Link가 자동으로 발동됨
      // 따라서 콜백 URL을 차단하지 않고 자연스럽게 진행시킴
      if (url.includes('/oauth2/') && url.includes('/callback')) {
        console.log('[WebViewContainer][DEBUG] ✅ OAuth callback allowed:', url);
      }

      // 토스페이먼츠 Intent URL 변환 처리 (공식 SDK 사용)
      if (url.startsWith('intent://')) {
        console.log('[WebViewContainer] Intent URL detected:', url.substring(0, 100));

        const convertUrl = new ConvertUrl(url);
        if (convertUrl.isAppLink()) {
          console.log('[WebViewContainer] TossPayments app link detected, launching app...');
          convertUrl.launchApp().then((isLaunch) => {
            if (isLaunch === false) {
              console.log('[WebViewContainer] App launch failed - app not installed');
            } else {
              console.log('[WebViewContainer] App launched successfully');
            }
          }).catch((error) => {
            console.error('[WebViewContainer] App launch error:', error);
          });
          return false; // WebView 로드는 중단하고 앱으로 이동
        }

        // ConvertUrl이 처리하지 못한 intent는 기존 로직 사용
        console.log('[WebViewContainer] Not a recognized app link, blocking');
        return false;
      }

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

      // 전화, 이메일, SMS
      if (url.startsWith('tel:') || url.startsWith('mailto:') || url.startsWith('sms:')) {
        Linking.openURL(url).catch(console.error);
        return false;
      }

      return true;
    }, [webviewSource]);

    /**
     * 에러 핸들러
     */
    const handleError = useCallback(
      (syntheticEvent: { nativeEvent: { description: string } }) => {
        const { description } = syntheticEvent.nativeEvent;
        console.error('[WebViewContainer] Error:', description);

        // 토스페이먼츠 3D Secure 관련 에러는 무시 (WebView 내부에서 처리)
        if (description.includes('ansimclick') || description.includes('directLinkedOnlinePay')) {
          console.log('[WebViewContainer] TossPayments 3D Secure error ignored (handled by WebView)');
          return;
        }

        onError?.(description);
      },
      [onError]
    );

    /**
     * HTTP 에러 핸들러 (404, 500 등)
     */
    const handleHttpError = useCallback(
      (syntheticEvent: { nativeEvent: { url: string; statusCode: number; description: string } }) => {
        const { url, statusCode, description } = syntheticEvent.nativeEvent;

        // OAuth 콜백 에러는 상세 로깅
        if (url.includes('/oauth2/') && url.includes('/callback')) {
          console.error(`[WebViewContainer][DEBUG] ❌ OAuth callback HTTP ${statusCode} error`);
          console.error(`[WebViewContainer][DEBUG] URL: ${url}`);
          console.error(`[WebViewContainer][DEBUG] Description: ${description}`);
          console.error(`[WebViewContainer][DEBUG] Error Stack:`, new Error().stack);
        }

        // 토스페이먼츠 관련 HTTP 에러는 무시 (3D Secure 프로세스 중 발생 가능)
        if (url.includes('ansimclick') || url.includes('directLinkedOnlinePay')) {
          return;
        }

        // OAuth 로그인 에러는 무시 (백엔드에서 처리)
        if (url.includes('/oauth2/') && url.includes('/authorize')) {
          return;
        }

        // 5xx 서버 에러만 로깅 (4xx 클라이언트 에러는 무시)
        if (statusCode >= 500) {
          console.error(`[WebViewContainer] HTTP ${statusCode} error on ${url}`);
        }
      },
      []
    );

    return (
      <WebView
        ref={webViewRef}
        source={webviewSource}
        style={styles.webview}
        originWhitelist={['*']}
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
        injectedJavaScriptBeforeContentLoaded={generateInjectedJavaScript()}
        onMessage={handleMessage}
        onNavigationStateChange={handleNavigationStateChange}
        onLoadStart={() => {
          isWebViewLoaded.current = false;
          isWebViewInteractive.current = false;
          onLoadStart?.();
        }}
        onLoadEnd={() => {
          isWebViewLoaded.current = true;
          // 로드 완료되면 즉시 인터랙티브 상태로 간주 (백그라운드 상태가 아니라면)
          if (appState.current === 'active') {
            isWebViewInteractive.current = true;
            processMessageQueue();
          }
          onLoadEnd?.();
        }}
        onError={handleError}
        onHttpError={handleHttpError}
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
