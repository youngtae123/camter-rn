/**
 * 카카오 공유 서비스
 * @react-native-kakao/share 패키지 사용
 */

import { initializeKakaoSDK, getKeyHashAndroid } from '@react-native-kakao/core';
import { shareFeedTemplate, KakaoFeedTemplate } from '@react-native-kakao/share';
import { Platform } from 'react-native';

// 카카오 SDK 초기화 상태
let isKakaoInitialized = false;

// 카카오 앱 키
const KAKAO_APP_KEY = process.env.EXPO_PUBLIC_KAKAO_APP_KEY || '1a11067057bb6fcf187e925d406f9386';
console.log('[KakaoShare] Using KAKAO_APP_KEY:', KAKAO_APP_KEY, '(from env:', process.env.EXPO_PUBLIC_KAKAO_APP_KEY, ')');

/**
 * 카카오 SDK 초기화
 */
export async function initKakaoSDK(): Promise<boolean> {
  if (isKakaoInitialized) return true;

  try {
    await initializeKakaoSDK(KAKAO_APP_KEY);
    isKakaoInitialized = true;

    // Android에서만 KeyHash 출력
    if (Platform.OS === 'android') {
      const keyHash = await getKeyHashAndroid();
      console.log('[KakaoShare] SDK initialized successfully. Android KeyHash:', keyHash);
    } else {
      console.log('[KakaoShare] SDK initialized successfully. Platform:', Platform.OS);
    }

    return true;
  } catch (error) {
    console.error('[KakaoShare] SDK initialization failed:', error);
    return false;
  }
}

/**
 * 카카오 공유 데이터 타입
 */
export interface KakaoShareParams {
  title: string;
  description?: string;
  imageUrl?: string;
  webUrl: string;
  mobileWebUrl?: string;
  buttonTitle?: string;
  executionParams?: Record<string, string>;
}

/**
 * 카카오톡 피드 공유
 */
export async function shareKakaoFeed(params: KakaoShareParams): Promise<boolean> {
  console.log('[KakaoShare] shareKakaoFeed called with:', JSON.stringify(params));

  try {
    // SDK 초기화 확인
    if (!isKakaoInitialized) {
      console.log('[KakaoShare] Initializing SDK...');
      const initialized = await initKakaoSDK();
      if (!initialized) {
        throw new Error('Failed to initialize Kakao SDK');
      }
    }

    // executionParams가 없으면 webUrl에서 추출
    let executionParams = params.executionParams;
    if (!executionParams && params.webUrl) {
      const urlMatch = params.webUrl.match(/\/product\/(\d+)/);
      if (urlMatch) {
        executionParams = { productId: urlMatch[1] };
        console.log('[KakaoShare] Auto-generated executionParams from URL:', executionParams);
      }
    }

    // 피드 템플릿 생성
    const template: KakaoFeedTemplate = {
      content: {
        title: params.title,
        description: params.description || '',
        imageUrl: params.imageUrl || '',
        link: {
          webUrl: params.webUrl,
          mobileWebUrl: params.mobileWebUrl || params.webUrl,
          androidExecutionParams: executionParams,
          iosExecutionParams: executionParams,
        },
      },
      buttons: [
        {
          title: params.buttonTitle || '자세히 보기',
          link: {
            webUrl: params.webUrl,
            mobileWebUrl: params.mobileWebUrl || params.webUrl,
            androidExecutionParams: executionParams,
            iosExecutionParams: executionParams,
          },
        },
      ],
    };

    console.log('[KakaoShare] Sharing with template:', JSON.stringify(template));

    // 공유 실행 (카카오톡 미설치 시 웹 브라우저 사용)
    const response = await shareFeedTemplate({
      template,
      useWebBrowserIfKakaoTalkNotAvailable: true,
    });
    console.log('[KakaoShare] Share response:', response);

    return true;
  } catch (error) {
    console.error('[KakaoShare] Share failed:', error);
    throw error;
  }
}
