# Client/ vs camter-rn/ 크로스체크 리포트

## 개요

이 문서는 Flutter 기반 `Client/` 프로젝트의 딥링크, 알림(FCM), 모바일 권한 구현이 React Native 기반 `camter-rn/` 프로젝트에 올바르게 반영되었는지 상세하게 비교 분석한 결과입니다.

---

## 1. 딥링크 (Deep Linking) 비교

### 1.1 URL Scheme 비교

| Scheme | Client (Flutter) | camter-rn (React Native) | 상태 |
|--------|------------------|--------------------------|------|
| `camter://` | ✅ 구현됨 | ✅ 구현됨 | ✅ 일치 |
| `camterapp://` | ✅ 구현됨 | ❌ 미구현 | ⚠️ 누락 |
| `camteropen://` | ✅ 구현됨 | ❌ 미구현 | ⚠️ 누락 |
| `camterguest://` | ✅ 구현됨 | ❌ 미구현 | ⚠️ 누락 |
| `com.camter.app://` | ❌ 없음 | ✅ 구현됨 (iOS만) | ℹ️ 신규 추가 |

### 1.2 Client (Flutter) 딥링크 상세

**파일 위치:**
- Android: `/Client/android/app/src/main/AndroidManifest.xml`
- iOS: `/Client/ios/Runner/Info.plist`
- 핸들러: `/Client/lib/presentation/views/user_main/user_main_view.dart`

**구현된 스킴 및 기능:**
```dart
// user_main_view.dart (lines 56-98)
appLinks.uriLinkStream.listen((uri) async {
  if (uri.scheme == "camterapp") {
    // 파트너/판매자 예약 관리로 이동
    await viewModel.navigateToMyPageReservationPartnerView();
  }
  if (uri.scheme == "camterguest") {
    // 게스트 예약 관리로 이동
    Navigator.pushReplacement(context, MyPageReservationGuestView);
  }
  if (uri.scheme == "camter") {
    // 홈 페이지로 이동 (카카오톡 알림용)
    viewModel.setIndex(0);
  }
});
```

**OAuth 연동 스킴:**
- `kakao1a11067057bb6fcf187e925d406f9386://oauth` - 카카오 로그인
- `camternaver://` - 네이버 로그인
- `signinwithapple://callback` - Apple 로그인

### 1.3 camter-rn (React Native) 딥링크 상세

**파일 위치:**
- Android: `/camter-rn/android/app/src/main/AndroidManifest.xml`
- iOS: `/camter-rn/ios/app/Info.plist`
- iOS 핸들러: `/camter-rn/ios/app/AppDelegate.swift`

**iOS 구현:**
```swift
// AppDelegate.swift (lines 35-52)
// URL Scheme 처리
public override func application(
  _ app: UIApplication,
  open url: URL,
  options: [UIApplication.OpenURLOptionsKey: Any] = [:]
) -> Bool {
  return RCTLinkingManager.application(app, open: url, options: options)
}

// Universal Links 처리
public override func application(
  _ application: UIApplication,
  continue userActivity: NSUserActivity,
  restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
) -> Bool {
  return RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
}
```

**iOS Info.plist:**
```xml
<key>CFBundleURLSchemes</key>
<array>
  <string>camter</string>
  <string>com.camter.app</string>
</array>
```

### 1.4 딥링크 누락 항목 상세

| 항목 | 설명 | 영향도 | 권장 조치 |
|------|------|--------|----------|
| `camterapp://` | 파트너/판매자 예약 관리 진입점 | 🔴 높음 | Android/iOS 스킴 추가 필요 |
| `camteropen://` | 앱 기본 열기 | 🟡 중간 | 필요시 추가 |
| `camterguest://` | 게스트 예약 관리 진입점 | 🔴 높음 | Android/iOS 스킴 추가 필요 |
| OAuth 스킴 | 카카오/네이버/Apple 로그인 | 🔴 높음 | 소셜 로그인 사용시 필수 |
| 딥링크 핸들러 | JS/TS 핸들러 코드 | 🔴 높음 | `useDeepLink.ts` 구현 필요 |

### 1.5 딥링크 Android 설정 비교

**Client (Flutter) AndroidManifest.xml:**
```xml
<!-- camterapp:// -->
<intent-filter android:label="camterapp">
  <action android:name="android.intent.action.VIEW"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <category android:name="android.intent.category.BROWSABLE"/>
  <data android:scheme="camterapp" android:host="action"/>
</intent-filter>

<!-- camterguest:// -->
<intent-filter android:label="camterguest">
  <action android:name="android.intent.action.VIEW"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <category android:name="android.intent.category.BROWSABLE"/>
  <data android:scheme="camterguest" android:host="action"/>
</intent-filter>

<!-- camter:// (카카오톡용) -->
<intent-filter android:label="camter">
  <action android:name="android.intent.action.VIEW"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <category android:name="android.intent.category.BROWSABLE"/>
  <data android:scheme="camter"/>
</intent-filter>
```

**camter-rn AndroidManifest.xml:**
```xml
<!-- 딥링크 intent-filter 없음! -->
<queries>
  <intent>
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.BROWSABLE"/>
    <data android:scheme="https"/>
  </intent>
</queries>
```

---

## 2. FCM 알림 (Push Notifications) 비교

### 2.1 전체 구현 상태 비교

| 기능 | Client (Flutter) | camter-rn (React Native) | 상태 |
|------|------------------|--------------------------|------|
| Firebase 프로젝트 설정 | ✅ 구현됨 | ❌ 미구현 | 🔴 누락 |
| google-services.json | ✅ 있음 | ❌ 없음 | 🔴 누락 |
| GoogleService-Info.plist | ✅ 있음 | ❌ 없음 | 🔴 누락 |
| FCM 토큰 관리 | ✅ 구현됨 | ❌ 미구현 | 🔴 누락 |
| 포그라운드 메시지 핸들러 | ✅ 구현됨 | ❌ 미구현 | 🔴 누락 |
| 백그라운드 메시지 핸들러 | ✅ 구현됨 | ❌ 미구현 | 🔴 누락 |
| 알림 권한 요청 | ✅ 구현됨 | ❌ 미구현 | 🔴 누락 |
| 알림 클릭 네비게이션 | ✅ 구현됨 | ❌ 미구현 | 🔴 누락 |

### 2.2 Client (Flutter) FCM 구현 상세

**Firebase 설정 파일:**
- `/Client/lib/firebase_options.dart` - Firebase 설정
- `/Client/android/app/google-services.json` - Android Firebase 설정
- `/Client/ios/Runner/GoogleService-Info.plist` - iOS Firebase 설정

**Firebase 프로젝트 정보:**
- Project ID: `camter`
- GCM Sender ID: `722950935647`
- Bundle ID: `com.camter.startApp`

**Dependencies (pubspec.yaml):**
```yaml
firebase_core: ^3.13.1
firebase_messaging: ^15.2.6
firebase_analytics: ^11.4.6
firebase_crashlytics: ^4.3.6
firebase_remote_config: ^5.4.4
```

**FCM 서비스 구현:**
```dart
// firebase_message_service.dart
class FirebaseMessageService {
  Future<void> init() async {
    // 알림 권한 요청
    await messaging.requestPermission(provisional: true);

    // FCM 토큰 획득 및 저장
    String? token = await messaging.getToken();
    LocalStorage.setFcmToken(token);

    // 토큰 갱신 리스너
    messaging.onTokenRefresh.listen((newToken) {
      LocalStorage.setFcmToken(newToken);
    });

    // 포그라운드 메시지 핸들러
    FirebaseMessaging.onMessage.listen(onMessage);

    // 백그라운드 메시지 클릭 핸들러
    FirebaseMessaging.onMessageOpenedApp.listen(onMessageOpenedApp);
  }

  void onMessage(RemoteMessage message) {
    // postId, notificationUuid 추출
    // 커뮤니티 포스트 상세 페이지로 이동
    CommunityNavigationUtil.navigateToPostDetailWithNotification(postId, notificationUuid);
  }
}
```

**알림 API 엔드포인트:**
- `GET /v1/me/notifications` - 알림 목록 조회
- `PATCH /v1/me/notifications/{uuid}/read` - 읽음 처리
- `DELETE /v1/me/notifications/{uuid}` - 삭제
- `GET /v1/me/notifications/unread-exists` - 안읽은 알림 존재 여부

### 2.3 camter-rn (React Native) FCM 현황

**현재 상태:**
- `expo-notifications` 패키지만 설치됨 (Expo 기본 알림)
- Firebase/FCM 관련 패키지 미설치
- 모든 FCM 서비스 파일이 비어있음

**설치된 패키지:**
```json
{
  "expo-notifications": "~0.32.15"
}
```

**빈 파일들:**
- `/camter-rn/src/services/fcmService.ts` - 0 bytes
- `/camter-rn/src/hooks/usePushNotification.ts` - 0 bytes

### 2.4 FCM 누락 항목 상세

| 항목 | Client 파일 | camter-rn 필요 조치 | 영향도 |
|------|------------|-------------------|--------|
| Firebase 패키지 | firebase_core, firebase_messaging | @react-native-firebase/app, messaging 설치 | 🔴 필수 |
| google-services.json | `/android/app/google-services.json` | 동일 파일 복사 또는 새로 생성 | 🔴 필수 |
| GoogleService-Info.plist | `/ios/Runner/GoogleService-Info.plist` | 동일 파일 복사 또는 새로 생성 | 🔴 필수 |
| FCM 서비스 | `firebase_message_service.dart` | `fcmService.ts` 구현 | 🔴 필수 |
| 토큰 관리 | LocalStorage에 저장 | AsyncStorage에 저장 | 🔴 필수 |
| 알림 핸들러 | onMessage, onMessageOpenedApp | messaging().onMessage 등 | 🔴 필수 |
| 알림 API 연동 | community_alarm_api.dart | API 호출 구현 | 🔴 필수 |

---

## 3. 모바일 권한 (Permissions) 비교

### 3.1 Android 권한 비교

| 권한 | Client (Flutter) | camter-rn (RN) | 상태 |
|------|------------------|----------------|------|
| `INTERNET` | ✅ | ✅ | ✅ 일치 |
| `CAMERA` | ✅ (암시적) | ❌ | ⚠️ 누락 |
| `READ_EXTERNAL_STORAGE` | ✅ | ✅ | ✅ 일치 |
| `WRITE_EXTERNAL_STORAGE` | ✅ | ✅ | ✅ 일치 |
| `READ_MEDIA_IMAGES` | ❌ | ✅ | ℹ️ 신규 |
| `READ_MEDIA_VIDEO` | ❌ | ✅ | ℹ️ 신규 |
| `READ_MEDIA_AUDIO` | ❌ | ✅ | ℹ️ 신규 |
| `POST_NOTIFICATIONS` | ✅ | ❌ | 🔴 누락 |
| `RECEIVE_BOOT_COMPLETED` | ✅ | ❌ | ⚠️ 누락 |
| `VIBRATE` | ✅ | ✅ | ✅ 일치 |
| `WAKE_LOCK` | ✅ | ❌ | ⚠️ 누락 |
| `SYSTEM_ALERT_WINDOW` | ❌ | ✅ | ℹ️ 신규 |

### 3.2 iOS 권한 비교

| 권한 (NSUsageDescription) | Client (Flutter) | camter-rn (RN) | 상태 |
|---------------------------|------------------|----------------|------|
| `NSCameraUsageDescription` | ✅ | ✅ | ✅ 일치 |
| `NSPhotoLibraryUsageDescription` | ✅ | ✅ | ✅ 일치 |
| `NSPhotoLibraryAddUsageDescription` | ❌ | ✅ | ℹ️ 신규 |
| `NSLocationWhenInUseUsageDescription` | ✅ | ❌ | ⚠️ 누락 |
| `NSMicrophoneUsageDescription` | ✅ (빈 값) | ❌ | ℹ️ 둘 다 미사용 |
| `NSFaceIDUsageDescription` | ✅ | ❌ | ⚠️ 누락 (결제시 필요) |
| `NSUserTrackingUsageDescription` | ✅ | ❌ | 🔴 누락 (ATT) |
| `UIBackgroundModes - remote-notification` | ✅ | ❌ | 🔴 누락 |
| `UIBackgroundModes - fetch` | ✅ | ❌ | ⚠️ 누락 |

### 3.3 Client (Flutter) 권한 구현 상세

**권한 라이브러리:**
```yaml
permission_handler: ^11.3.0
app_tracking_transparency: ^2.0.5
image_picker: ^1.1.1
```

**ATT (App Tracking Transparency) 구현:**
```dart
// att_service.dart
class AttService {
  static Future<void> init(MemberModel? member) async {
    if (!Platform.isIOS) return;

    // ATT 상태 확인
    final status = await AppTrackingTransparency.trackingAuthorizationStatus;

    // IDFA 획득
    final uuid = await AppTrackingTransparency.getAdvertisingIdentifier();

    // 권한 요청
    if (status == TrackingStatus.notDetermined) {
      await AppTrackingTransparency.requestTrackingAuthorization();
    }

    // 백엔드에 동의 상태 전송
    await MemberApi.updateTracking(agreeType);
  }
}
```

**이미지 권한 처리:**
```dart
// image_util.dart
class ImageUtil {
  static Future<File?> pickFile(ImageSource source) async {
    // image_picker가 자동으로 권한 처리
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: source);
    return picked != null ? File(picked.path) : null;
  }
}
```

### 3.4 camter-rn (React Native) 권한 현황

**설치된 패키지:**
```json
{
  "expo-media-library": "~18.2.1",
  "expo-notifications": "~0.32.15",
  "expo-file-system": "~19.0.21"
}
```

**권한 처리 방식:**
- Expo가 자동으로 권한 처리
- 커스텀 권한 요청 코드 없음
- `react-native-permissions` 미사용

### 3.5 권한 누락 항목 상세

| 항목 | Client 구현 | camter-rn 필요 조치 | 영향도 |
|------|------------|-------------------|--------|
| ATT (iOS) | `app_tracking_transparency` | `expo-tracking-transparency` 또는 직접 구현 | 🔴 높음 (광고/분석) |
| 위치 권한 | Info.plist 선언 | 필요시 추가 | 🟡 중간 |
| Face ID | Info.plist 선언 | 결제 기능 사용시 추가 | 🟡 중간 |
| 푸시 알림 권한 | POST_NOTIFICATIONS (Android 13+) | AndroidManifest.xml 추가 | 🔴 높음 |
| 백그라운드 알림 | UIBackgroundModes | Info.plist 추가 | 🔴 높음 |

---

## 4. 종합 비교 매트릭스

### 4.1 기능별 구현 상태

| 카테고리 | 기능 | Client | camter-rn | 격차 |
|----------|------|--------|-----------|------|
| **딥링크** | URL Scheme 정의 | 4개 | 2개 | -2 |
| | 딥링크 핸들러 | ✅ | ❌ | 미구현 |
| | OAuth 연동 | 3개 | 0개 | -3 |
| | Universal Links | ✅ | ✅ | 일치 |
| **FCM** | Firebase 설정 | ✅ | ❌ | 미구현 |
| | 토큰 관리 | ✅ | ❌ | 미구현 |
| | 메시지 핸들러 | ✅ | ❌ | 미구현 |
| | 알림 UI | ✅ | ❌ | 미구현 |
| **권한** | 카메라 | ✅ | ✅ | 일치 |
| | 갤러리 | ✅ | ✅ | 일치 |
| | 위치 | ✅ | ❌ | 미구현 |
| | ATT | ✅ | ❌ | 미구현 |
| | 푸시 알림 | ✅ | ❌ | 미구현 |

### 4.2 아키텍처 차이점

| 측면 | Client (Flutter) | camter-rn (React Native) |
|------|------------------|--------------------------|
| **프레임워크** | Flutter/Dart | React Native/TypeScript |
| **앱 구조** | 네이티브 앱 | WebView 래퍼 |
| **딥링크 패키지** | `app_links` | `expo-linking` |
| **알림 패키지** | `firebase_messaging` | `expo-notifications` (FCM 아님) |
| **권한 패키지** | `permission_handler` | Expo 자동 처리 |
| **상태 관리** | Stacked MVVM | 미구현 (WebView 위임) |

---

## 5. 권장 구현 우선순위

### 5.1 P0 (Critical) - 즉시 구현 필요

1. **FCM 전체 구현**
   - Firebase 프로젝트 연결
   - `@react-native-firebase/app`, `@react-native-firebase/messaging` 설치
   - `google-services.json`, `GoogleService-Info.plist` 추가
   - FCM 서비스 구현 (`fcmService.ts`)
   - 토큰 관리 및 백엔드 연동

2. **딥링크 스킴 추가**
   - Android: `camterapp://`, `camterguest://` intent-filter 추가
   - iOS: Info.plist URL schemes 추가
   - 딥링크 핸들러 구현 (`useDeepLink.ts`)

3. **알림 권한**
   - Android: `POST_NOTIFICATIONS` 권한 추가
   - iOS: `UIBackgroundModes - remote-notification` 추가

### 5.2 P1 (High) - 기능 완성도

1. **OAuth 딥링크** (소셜 로그인 사용시)
   - 카카오, 네이버, Apple 로그인 스킴 추가

2. **ATT 구현** (광고/분석 사용시)
   - `expo-tracking-transparency` 설치
   - ATT 권한 요청 로직 구현
   - 백엔드 동의 상태 연동

3. **WebView 브릿지**
   - `webviewBridge.ts` 구현
   - 네이티브 ↔ 웹앱 통신 구현

### 5.3 P2 (Medium) - 향후 개선

1. **위치 권한** (위치 기반 기능 추가시)
2. **Face ID 권한** (생체인증 결제시)
3. **백그라운드 fetch** (백그라운드 데이터 동기화시)

---

## 6. 구현 가이드

### 6.1 FCM 구현 가이드

**1. 패키지 설치:**
```bash
npm install @react-native-firebase/app @react-native-firebase/messaging
```

**2. Android 설정:**
```groovy
// android/build.gradle
buildscript {
  dependencies {
    classpath 'com.google.gms:google-services:4.4.0'
  }
}

// android/app/build.gradle
apply plugin: 'com.google.gms.google-services'
```

**3. iOS 설정:**
- `GoogleService-Info.plist` 추가
- `Info.plist`에 백그라운드 모드 추가

**4. FCM 서비스 구현 예시:**
```typescript
// src/services/fcmService.ts
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const initFCM = async () => {
  // 권한 요청
  const authStatus = await messaging().requestPermission();

  // 토큰 획득
  const token = await messaging().getToken();
  await AsyncStorage.setItem('fcmToken', token);

  // 포그라운드 메시지 핸들러
  messaging().onMessage(async remoteMessage => {
    console.log('FCM Message:', remoteMessage);
  });

  // 백그라운드 메시지 클릭 핸들러
  messaging().onNotificationOpenedApp(remoteMessage => {
    console.log('Notification opened:', remoteMessage);
  });
};
```

### 6.2 딥링크 구현 가이드

**1. Android intent-filter 추가:**
```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<intent-filter android:label="camterapp">
  <action android:name="android.intent.action.VIEW"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <category android:name="android.intent.category.BROWSABLE"/>
  <data android:scheme="camterapp" android:host="action"/>
</intent-filter>

<intent-filter android:label="camterguest">
  <action android:name="android.intent.action.VIEW"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <category android:name="android.intent.category.BROWSABLE"/>
  <data android:scheme="camterguest" android:host="action"/>
</intent-filter>
```

**2. iOS URL schemes 추가:**
```xml
<!-- ios/app/Info.plist -->
<key>CFBundleURLSchemes</key>
<array>
  <string>camter</string>
  <string>camterapp</string>
  <string>camterguest</string>
  <string>camteropen</string>
</array>
```

**3. 딥링크 핸들러 구현:**
```typescript
// src/hooks/useDeepLink.ts
import { useEffect } from 'react';
import * as Linking from 'expo-linking';

export const useDeepLink = () => {
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const url = new URL(event.url);

      switch (url.protocol.replace(':', '')) {
        case 'camterapp':
          // 파트너 예약 관리로 이동
          break;
        case 'camterguest':
          // 게스트 예약 관리로 이동
          break;
        case 'camter':
          // 홈으로 이동
          break;
      }
    };

    Linking.addEventListener('url', handleDeepLink);

    // 초기 URL 처리
    Linking.getInitialURL().then(url => {
      if (url) handleDeepLink({ url });
    });
  }, []);
};
```

---

## 7. 파일 매핑 참조

### 7.1 Client (Flutter) 주요 파일

| 기능 | 파일 경로 |
|------|----------|
| 딥링크 핸들러 | `/lib/presentation/views/user_main/user_main_view.dart` |
| FCM 서비스 | `/lib/core/utils/services/notification/firebase_message_service.dart` |
| 앱 초기화 | `/lib/core/utils/services/init_service.dart` |
| ATT 서비스 | `/lib/core/utils/services/att_service.dart` |
| 이미지 권한 | `/lib/core/utils/image_util.dart` |
| Firebase 설정 | `/lib/firebase_options.dart` |
| 알림 API | `/lib/data/data_source/community/community_alarm_api.dart` |
| 알림 네비게이션 | `/lib/presentation/views/lounge/community/community_alarm/community_navigation_util.dart` |

### 7.2 camter-rn (React Native) 파일 (구현 필요)

| 기능 | 파일 경로 | 상태 |
|------|----------|------|
| 딥링크 핸들러 | `/src/hooks/useDeepLink.ts` | ❌ 빈 파일 |
| FCM 서비스 | `/src/services/fcmService.ts` | ❌ 빈 파일 |
| 푸시 알림 훅 | `/src/hooks/usePushNotification.ts` | ❌ 빈 파일 |
| WebView 브릿지 | `/src/utils/webviewBridge.ts` | ❌ 빈 파일 |
| WebView 컨테이너 | `/src/components/WebViewContainer.tsx` | ❌ 빈 파일 |

---

## 8. 결론

### 8.1 현재 상태 요약

`camter-rn` 프로젝트는 현재 **WebView 래퍼** 형태로 최소한의 구현만 되어있으며, `Client` (Flutter) 프로젝트의 핵심 네이티브 기능들이 대부분 미구현 상태입니다.

### 8.2 구현 완성도

| 카테고리 | 구현 완성도 |
|----------|------------|
| 딥링크 | 🟡 30% (기본 스킴만 설정) |
| FCM 알림 | 🔴 0% (완전 미구현) |
| 모바일 권한 | 🟡 40% (기본 권한만 설정) |

### 8.3 예상 작업량

| 작업 | 예상 난이도 | 파일 수 |
|------|------------|---------|
| FCM 전체 구현 | 높음 | 5-7개 |
| 딥링크 완성 | 중간 | 3-4개 |
| 권한 추가 | 낮음 | 2-3개 |
| WebView 브릿지 | 중간 | 2-3개 |

---

*이 리포트는 2026-01-08 기준으로 작성되었습니다.*
