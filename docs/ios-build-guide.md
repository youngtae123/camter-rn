# iOS 빌드 가이드

## 사전 요구사항

| 항목 | 설명 |
|------|------|
| macOS | 필수 |
| Xcode | App Store에서 설치 (무료) |
| Command Line Tools | `xcode-select --install` |
| CocoaPods | `sudo gem install cocoapods` |

---

## 빌드 순서

### 1단계: CocoaPods 의존성 설치

```bash
cd /Users/gim-yeongtae/Downloads/camter_poooling/camter-rn/ios
pod install
```

> 처음 실행 시 시간이 좀 걸립니다 (2-5분)

---

### 2단계: 빌드 방법 선택

#### 방법 A: 명령어로 빌드 (시뮬레이터용)

```bash
cd /Users/gim-yeongtae/Downloads/camter_poooling/camter-rn/ios

# 시뮬레이터용 빌드
xcodebuild -workspace camterrn.xcworkspace \
  -scheme camterrn \
  -configuration Release \
  -sdk iphonesimulator \
  -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO
```

**빌드 결과물:**
```
ios/build/Build/Products/Release-iphonesimulator/camterrn.app
```

#### 방법 B: Xcode에서 빌드 (GUI)

```bash
# Xcode로 프로젝트 열기
open /Users/gim-yeongtae/Downloads/camter_poooling/camter-rn/ios/camterrn.xcworkspace
```

Xcode에서:
1. 상단 좌측에서 시뮬레이터 선택 (예: iPhone 15)
2. `⌘ + B` (빌드)
3. `⌘ + R` (실행)

---

## 시뮬레이터에서 실행

### 사용 가능한 시뮬레이터 확인
```bash
xcrun simctl list devices available
```

### 시뮬레이터 실행 및 앱 설치
```bash
# 시뮬레이터 부팅
xcrun simctl boot "iPhone 15"

# 시뮬레이터 앱 열기
open -a Simulator

# 앱 설치
xcrun simctl install booted /Users/gim-yeongtae/Downloads/camter_poooling/camter-rn/ios/build/Build/Products/Release-iphonesimulator/camterrn.app

# 앱 실행
xcrun simctl launch booted com.camter.start_app
```

---

## 실제 기기용 빌드 (IPA)

> ⚠️ Apple Developer 계정 필요 ($99/년)

### 1. Xcode에서 설정
1. `camterrn.xcworkspace` 열기
2. 프로젝트 선택 → Signing & Capabilities
3. Team 선택 (Apple Developer 계정)
4. Bundle Identifier: `com.camter.start_app`

### 2. Archive 생성
```bash
xcodebuild -workspace camterrn.xcworkspace \
  -scheme camterrn \
  -configuration Release \
  -sdk iphoneos \
  -archivePath build/camterrn.xcarchive \
  archive
```

### 3. IPA 추출
Xcode → Window → Organizer → Archives → Distribute App

---

## 트러블슈팅

### CocoaPods 에러
```bash
# CocoaPods 캐시 정리
cd ios
pod deintegrate
pod cache clean --all
pod install
```

### 빌드 에러 시
```bash
# 클린 빌드
cd ios
rm -rf build
rm -rf Pods
rm Podfile.lock
pod install
```

### 시뮬레이터가 안 보일 때
```bash
# Xcode 시뮬레이터 런타임 설치
xcodebuild -downloadPlatform iOS
```

---

## 앱 정보

| 항목 | 값 |
|------|-----|
| 앱 이름 | 캠터 |
| Bundle ID | com.camter.start_app |
| 버전 | 1.0.0 |
| 웹뷰 URL | https://camter-client.vercel.app/ |

---

## 빠른 명령어 모음

```bash
# 1. 의존성 설치
cd /Users/gim-yeongtae/Downloads/camter_poooling/camter-rn/ios && pod install

# 2. 시뮬레이터용 빌드
xcodebuild -workspace camterrn.xcworkspace -scheme camterrn -configuration Release -sdk iphonesimulator -derivedDataPath build CODE_SIGNING_ALLOWED=NO

# 3. 시뮬레이터 실행
open -a Simulator

# 4. 앱 설치 및 실행
xcrun simctl install booted build/Build/Products/Release-iphonesimulator/camterrn.app
xcrun simctl launch booted com.camter.start_app
```
