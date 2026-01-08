/**
 * useDeepLink - 딥링크 처리 훅
 * URL 스킴: camter://, camterapp://, camterguest://, kakao{appkey}://
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

// 딥링크 파라미터 타입
export interface DeepLinkParams {
  productId?: string;
  eventId?: string;
  programId?: string;
  postId?: string;
  reservationId?: string;
  screen?: string;
  // OAuth 관련
  code?: string;
  state?: string;
  error?: string;
}

// 딥링크 결과 타입
export interface DeepLinkResult {
  url: string | null;
  path: string | null;
  params: DeepLinkParams;
  webViewPath: string | null;
}

// 지원하는 URL 스킴
const SUPPORTED_SCHEMES = [
  'camter://',
  'camterapp://',
  'camterguest://',
  'exp://', // Expo 개발 모드
];

// 카카오 앱키 (환경변수에서 가져오거나 기본값 사용)
const KAKAO_JS_APP_KEY = process.env.EXPO_PUBLIC_KAKAO_APP_KEY || 'b0892b60f070bd0742c5cb6f792dac5d';
// 카카오 Native App Key (OAuth용)
const KAKAO_NATIVE_APP_KEY = '1a11067057bb6fcf187e925d406f9386';

/**
 * URL에서 파라미터 파싱
 */
const parseUrlParams = (url: string): DeepLinkParams => {
  const params: DeepLinkParams = {};

  try {
    // URL 객체 생성이 실패할 수 있으므로 수동 파싱도 지원
    let searchParams: URLSearchParams;

    if (url.includes('?')) {
      const queryString = url.split('?')[1];
      searchParams = new URLSearchParams(queryString);
    } else {
      // 쿼리 파라미터 없는 경우
      return params;
    }

    // 각 파라미터 추출
    if (searchParams.has('productId')) {
      params.productId = searchParams.get('productId') || undefined;
    }
    if (searchParams.has('eventId')) {
      params.eventId = searchParams.get('eventId') || undefined;
    }
    if (searchParams.has('programId')) {
      params.programId = searchParams.get('programId') || undefined;
    }
    if (searchParams.has('postId')) {
      params.postId = searchParams.get('postId') || undefined;
    }
    if (searchParams.has('reservationId')) {
      params.reservationId = searchParams.get('reservationId') || undefined;
    }
    if (searchParams.has('screen')) {
      params.screen = searchParams.get('screen') || undefined;
    }
    // OAuth 파라미터
    if (searchParams.has('code')) {
      params.code = searchParams.get('code') || undefined;
    }
    if (searchParams.has('state')) {
      params.state = searchParams.get('state') || undefined;
    }
    if (searchParams.has('error')) {
      params.error = searchParams.get('error') || undefined;
    }
  } catch (error) {
    console.error('[useDeepLink] URL parsing error:', error);
  }

  return params;
};

/**
 * 딥링크 URL을 WebView 경로로 변환
 */
const convertToWebViewPath = (url: string, params: DeepLinkParams): string | null => {
  if (!url) return null;

  try {
    // URL 경로 추출
    let path = '';

    // 스킴 제거
    for (const scheme of SUPPORTED_SCHEMES) {
      if (url.startsWith(scheme)) {
        path = url.replace(scheme, '');
        break;
      }
    }

    // 카카오 스킴 처리 (JS Key 또는 Native Key)
    if (url.startsWith(`kakao${KAKAO_JS_APP_KEY}://`)) {
      path = url.replace(`kakao${KAKAO_JS_APP_KEY}://`, '');
    } else if (url.startsWith(`kakao${KAKAO_NATIVE_APP_KEY}://`)) {
      path = url.replace(`kakao${KAKAO_NATIVE_APP_KEY}://`, '');
    }

    // 호스트 제거 (있는 경우)
    if (path.includes('/')) {
      const parts = path.split('/');
      // 첫 번째가 호스트인 경우 제거
      if (parts[0] && !parts[0].includes('=')) {
        path = '/' + parts.slice(1).join('/');
      }
    }

    // 쿼리 파라미터가 있는 경우 경로와 분리
    const [basePath] = path.split('?');

    // 파라미터 기반 경로 생성
    if (params.productId) {
      return `/product/${params.productId}`;
    }
    if (params.eventId) {
      return `/event/${params.eventId}`;
    }
    if (params.programId) {
      return `/program/${params.programId}`;
    }
    if (params.postId) {
      return `/community/post/${params.postId}`;
    }
    if (params.reservationId) {
      return `/reservation-detail/${params.reservationId}`;
    }

    // OAuth 콜백 처리
    if (params.code) {
      const oauthPath = basePath || '/oauth/callback';
      return `${oauthPath}?code=${params.code}${params.state ? `&state=${params.state}` : ''}`;
    }

    // 기본 경로 반환
    return basePath || '/';
  } catch (error) {
    console.error('[useDeepLink] Path conversion error:', error);
    return null;
  }
};

/**
 * 딥링크 처리 훅
 */
export const useDeepLink = () => {
  const [deepLinkResult, setDeepLinkResult] = useState<DeepLinkResult>({
    url: null,
    path: null,
    params: {},
    webViewPath: null,
  });
  const [isReady, setIsReady] = useState(false);
  const processedUrls = useRef<Set<string>>(new Set());

  /**
   * URL 처리
   */
  const processUrl = useCallback((url: string | null) => {
    if (!url) {
      console.log('[useDeepLink] No URL to process');
      return;
    }

    // 이미 처리된 URL인지 확인 (중복 방지)
    if (processedUrls.current.has(url)) {
      console.log('[useDeepLink] URL already processed:', url);
      return;
    }

    console.log('[useDeepLink] Processing URL:', url);
    processedUrls.current.add(url);

    // 지원하는 스킴인지 확인
    const isSupported =
      SUPPORTED_SCHEMES.some((scheme) => url.startsWith(scheme)) ||
      url.startsWith(`kakao${KAKAO_JS_APP_KEY}://`) ||
      url.startsWith(`kakao${KAKAO_NATIVE_APP_KEY}://`);

    if (!isSupported) {
      console.log('[useDeepLink] Unsupported scheme:', url);
      return;
    }

    // 파라미터 파싱
    const params = parseUrlParams(url);
    console.log('[useDeepLink] Parsed params:', params);

    // WebView 경로 변환
    const webViewPath = convertToWebViewPath(url, params);
    console.log('[useDeepLink] WebView path:', webViewPath);

    setDeepLinkResult({
      url,
      path: url.replace(/^[a-z]+:\/\//, ''),
      params,
      webViewPath,
    });
  }, []);

  /**
   * 초기 URL 확인 (앱이 딥링크로 실행된 경우)
   */
  useEffect(() => {
    const getInitialUrl = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        console.log('[useDeepLink] Initial URL:', initialUrl);

        if (initialUrl) {
          processUrl(initialUrl);
        }

        setIsReady(true);
      } catch (error) {
        console.error('[useDeepLink] Initial URL error:', error);
        setIsReady(true);
      }
    };

    getInitialUrl();
  }, [processUrl]);

  /**
   * URL 변경 리스너 (앱이 실행 중일 때 딥링크 수신)
   */
  useEffect(() => {
    const subscription = Linking.addEventListener('url', (event) => {
      console.log('[useDeepLink] URL event:', event.url);
      processUrl(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [processUrl]);

  /**
   * 딥링크 결과 초기화 (처리 완료 후 호출)
   */
  const clearDeepLink = useCallback(() => {
    setDeepLinkResult({
      url: null,
      path: null,
      params: {},
      webViewPath: null,
    });
  }, []);

  /**
   * 특정 경로로 앱 내 딥링크 생성
   */
  const createDeepLink = useCallback((path: string, params?: Record<string, string>): string => {
    const scheme = Platform.OS === 'ios' ? 'camterapp://' : 'camter://';
    let url = `${scheme}${path}`;

    if (params && Object.keys(params).length > 0) {
      const queryString = new URLSearchParams(params).toString();
      url += `?${queryString}`;
    }

    return url;
  }, []);

  return {
    ...deepLinkResult,
    isReady,
    clearDeepLink,
    createDeepLink,
  };
};

export default useDeepLink;
