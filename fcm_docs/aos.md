# FCM (Firebase Cloud Messaging) 설정 가이드 - Android

> `expo prebuild --clean` 등으로 네이티브 빌드 파일이 초기화된 경우 이 가이드를 따라 FCM을 다시 설정해주세요.

---

## 1. 사전 준비 사항

### 1.1 필수 파일 확인

- `google-services.json` 파일이 `camter-rn/` 루트에 있는지 확인
- 없다면 Firebase Console → 프로젝트 설정 → Android 앱에서 다운로드

```
camter-rn/
├── google-services.json  ← 여기에 있어야 함
├── android/
├── ios/
└── ...
```

### 1.2 패키지 설치

```bash
cd camter-rn
npm install @react-native-firebase/app @react-native-firebase/messaging
```

---

## 2. Android 네이티브 설정

### 2.1 android/build.gradle 수정

`buildscript > dependencies` 블록에 Google Services classpath 추가:

```gradle
buildscript {
  repositories {
    google()
    mavenCentral()
    maven { url 'https://devrepo.kakao.com/nexus/content/groups/public/' }
  }
  dependencies {
    classpath('com.android.tools.build:gradle')
    classpath('com.facebook.react:react-native-gradle-plugin')
    classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')
    classpath('com.google.gms:google-services:4.4.0')  // ← 이 줄 추가
  }
}
```

### 2.2 android/app/build.gradle 수정

파일 상단에 Google Services 플러그인 적용:

```gradle
apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"
apply plugin: "com.google.gms.google-services"  // ← 이 줄 추가

// ... 나머지 코드
```

### 2.3 google-services.json 위치 확인

`app.json`에서 `android.googleServicesFile` 설정이 올바른지 확인:

```json
{
  "expo": {
    "android": {
      "googleServicesFile": "./google-services.json"
    }
  }
}
```

---

## 3. 앱 재빌드

설정 완료 후 앱을 재빌드:

```bash
npx expo run:android
```

---

## 4. 확인 사항

### 4.1 성공 시 로그

앱 실행 후 Metro 콘솔에서 다음 로그가 나오면 성공:

```
[FCM] Fetching Device Push Token...
[FCM] Device Token obtained: eLx6pceXQiKRCSqh8tma...
[WebViewContainer] FCM token: obtained (eLx6pceXQiKRCSqh8tma...)
[WebViewContainer] Syncing FCM token to server...
[FCM] Token synced successfully
```

### 4.2 실패 시

#### Firebase 초기화 에러

```
Default FirebaseApp is not initialized in this process
```

**원인:** `google-services.json` 파일 누락 또는 플러그인 미적용
**해결:** 위 2.1, 2.2, 2.3 단계 다시 확인

---

## 5. 파일 변경 요약

| 파일 경로 | 변경 내용 |
|-----------|-----------|
| `android/build.gradle` | `classpath('com.google.gms:google-services:4.4.0')` 추가 |
| `android/app/build.gradle` | `apply plugin: "com.google.gms.google-services"` 추가 |
| `package.json` | `@react-native-firebase/app`, `@react-native-firebase/messaging` 의존성 |

---

## 6. 주의사항

- `expo prebuild --clean` 사용 시 `android/` 폴더가 완전히 재생성되므로 위 설정을 다시 해야 함
- `expo prebuild` (--clean 없이) 사용 시 기존 수정 사항 유지됨
- 변경 후 반드시 git 커밋하여 백업 권장
