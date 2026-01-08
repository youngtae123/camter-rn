#!/bin/bash

# 캠터 앱 빌드 스크립트
# 사용법: ./build.sh [android|ios|all] [debug|release]

set -e

PROJECT_DIR="/Users/gim-yeongtae/Downloads/camter_poooling/camter-rn"
ANDROID_DIR="$PROJECT_DIR/android"
IOS_DIR="$PROJECT_DIR/ios"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 로그 함수
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Android 빌드
build_android() {
    local build_type=${1:-release}

    log_info "Android $build_type 빌드 시작..."

    cd "$PROJECT_DIR"

    # android 폴더 없으면 prebuild
    if [ ! -d "$ANDROID_DIR" ]; then
        log_info "Android 프로젝트 생성 중..."
        npx expo prebuild --platform android
    fi

    # local.properties 확인
    if [ ! -f "$ANDROID_DIR/local.properties" ]; then
        log_info "local.properties 생성 중..."
        echo "sdk.dir=$HOME/Library/Android/sdk" > "$ANDROID_DIR/local.properties"
    fi

    cd "$ANDROID_DIR"

    if [ "$build_type" = "debug" ]; then
        ./gradlew assembleDebug
        APK_PATH="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
    else
        ./gradlew assembleRelease
        APK_PATH="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
    fi

    if [ -f "$APK_PATH" ]; then
        log_success "Android 빌드 완료!"
        log_info "APK 위치: $APK_PATH"

        # 빌드 결과물을 output 폴더로 복사
        mkdir -p "$PROJECT_DIR/build-output"
        cp "$APK_PATH" "$PROJECT_DIR/build-output/"
        log_info "복사됨: $PROJECT_DIR/build-output/"
    else
        log_error "APK 파일을 찾을 수 없습니다."
        return 1
    fi
}

# iOS 빌드
build_ios() {
    local build_type=${1:-release}

    log_info "iOS $build_type 빌드 시작..."

    # macOS 확인
    if [[ "$OSTYPE" != "darwin"* ]]; then
        log_error "iOS 빌드는 macOS에서만 가능합니다."
        return 1
    fi

    # Xcode 확인
    if ! command -v xcodebuild &> /dev/null; then
        log_error "Xcode가 설치되어 있지 않습니다."
        return 1
    fi

    cd "$PROJECT_DIR"

    # ios 폴더 없으면 prebuild
    if [ ! -d "$IOS_DIR" ]; then
        log_info "iOS 프로젝트 생성 중..."
        npx expo prebuild --platform ios
    fi

    cd "$IOS_DIR"

    # CocoaPods 설치 확인
    if [ ! -d "Pods" ]; then
        log_info "CocoaPods 의존성 설치 중..."
        if ! command -v pod &> /dev/null; then
            log_warning "CocoaPods가 설치되어 있지 않습니다. 설치 중..."
            sudo gem install cocoapods
        fi
        pod install
    fi

    # 빌드 설정
    local config="Release"
    if [ "$build_type" = "debug" ]; then
        config="Debug"
    fi

    log_info "시뮬레이터용 빌드 중... (config: $config)"

    # workspace 파일 찾기
    WORKSPACE=$(find "$IOS_DIR" -name "*.xcworkspace" -maxdepth 1 | head -1)
    WORKSPACE_NAME=$(basename "$WORKSPACE" .xcworkspace)

    if [ -z "$WORKSPACE" ]; then
        log_error "xcworkspace 파일을 찾을 수 없습니다."
        return 1
    fi

    log_info "Workspace: $WORKSPACE_NAME"

    xcodebuild -workspace "$WORKSPACE" \
        -scheme "$WORKSPACE_NAME" \
        -configuration "$config" \
        -sdk iphonesimulator \
        -derivedDataPath build \
        CODE_SIGNING_ALLOWED=NO \
        -quiet

    APP_PATH="$IOS_DIR/build/Build/Products/$config-iphonesimulator/$WORKSPACE_NAME.app"

    if [ -d "$APP_PATH" ]; then
        log_success "iOS 빌드 완료!"
        log_info "App 위치: $APP_PATH"

        # 빌드 결과물을 output 폴더로 복사
        mkdir -p "$PROJECT_DIR/build-output"
        cp -R "$APP_PATH" "$PROJECT_DIR/build-output/"
        log_info "복사됨: $PROJECT_DIR/build-output/"
    else
        log_error "App 파일을 찾을 수 없습니다."
        return 1
    fi
}

# 클린 빌드
clean_build() {
    log_info "빌드 캐시 정리 중..."

    # Android 클린
    if [ -d "$ANDROID_DIR" ]; then
        cd "$ANDROID_DIR"
        ./gradlew clean 2>/dev/null || true
    fi

    # iOS 클린
    if [ -d "$IOS_DIR/build" ]; then
        rm -rf "$IOS_DIR/build"
    fi

    # output 폴더 정리
    rm -rf "$PROJECT_DIR/build-output"

    log_success "클린 완료!"
}

# 도움말
show_help() {
    echo ""
    echo "캠터 앱 빌드 스크립트"
    echo ""
    echo "사용법: ./build.sh [명령] [옵션]"
    echo ""
    echo "명령:"
    echo "  android [debug|release]  Android APK 빌드 (기본: release)"
    echo "  ios [debug|release]      iOS 앱 빌드 (기본: release)"
    echo "  all [debug|release]      Android + iOS 모두 빌드"
    echo "  clean                    빌드 캐시 정리"
    echo "  help                     이 도움말 표시"
    echo ""
    echo "예시:"
    echo "  ./build.sh android           # Android Release 빌드"
    echo "  ./build.sh android debug     # Android Debug 빌드"
    echo "  ./build.sh ios               # iOS Release 빌드"
    echo "  ./build.sh all               # 모두 Release 빌드"
    echo "  ./build.sh clean             # 빌드 캐시 정리"
    echo ""
    echo "빌드 결과물: $PROJECT_DIR/build-output/"
    echo ""
}

# 메인 로직
main() {
    local command=${1:-help}
    local build_type=${2:-release}

    echo ""
    echo "========================================"
    echo "       캠터 앱 빌드 스크립트"
    echo "========================================"
    echo ""

    case $command in
        android)
            build_android "$build_type"
            ;;
        ios)
            build_ios "$build_type"
            ;;
        all)
            build_android "$build_type"
            echo ""
            build_ios "$build_type"
            echo ""
            log_success "모든 빌드 완료!"
            log_info "결과물 위치: $PROJECT_DIR/build-output/"
            ;;
        clean)
            clean_build
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "알 수 없는 명령: $command"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
