import React, { useEffect, useRef } from 'react';
import {
    StyleSheet,
    View,
    Text,
    Image,
    Animated,
    Dimensions,
    Platform,
} from 'react-native';

interface Props {
    visible: boolean;
}

/**
 * Android Double Back Exit Snackbar
 * Flutter 앱(Client)의 HomeNotificationUtil.showBottomToast 디자인 스펙을 따름
 */
export default function AppExitSnackbar({ visible }: Props) {
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }).start();
        } else {
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
            }).start();
        }
    }, [visible, fadeAnim]);

    // Pointer events 'none' when not visible to allow clicks through
    if (!visible) {
        return null;
    }

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    opacity: fadeAnim,
                    transform: [
                        {
                            translateY: fadeAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [20, 0], // Slight slide up effect
                            }),
                        },
                    ],
                },
            ]}
            pointerEvents="none"
        >
            <View style={styles.contentContainer}>
                <Image
                    source={require('../../assets/icon.png')}
                    style={styles.icon}
                    resizeMode="cover"
                />
                <Text style={styles.text}>'뒤로' 버튼을 한번 더 누르면 종료됩니다.</Text>
            </View>
        </Animated.View>
    );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        // Flutter: bottom: MediaQuery.of(context).size.height * 0.15
        bottom: height * 0.15,
        // Flutter: left: MediaQuery.of(context).size.width * 0.1
        left: width * 0.1, // This centers it if width is 0.8
        right: width * 0.1, // Added for easier centering than just left
        alignItems: 'center',
        zIndex: 9999,
    },
    contentContainer: {
        // Flutter: width: MediaQuery.of(context).size.width * 0.85
        // But we are setting left/right margins, so we can use flex or width: '100%' within the container
        width: '100%',
        flexDirection: 'row',
        alignItems: 'flex-start', // Flutter: CrossAxisAlignment.start
        // Flutter: padding: const EdgeInsets.fromLTRB(20, 16, 20, 16)
        paddingHorizontal: 20,
        paddingVertical: 16,
        // Flutter: color: Colors.black.withOpacity(0.8)
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        // Flutter: borderRadius: 8
        borderRadius: 8,
        // Flutter: boxShadow
        ...Platform.select({
            ios: {
                shadowColor: 'black',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
            },
            android: {
                elevation: 6,
            },
        }),
    },
    icon: {
        // Flutter: width: 24, height: 24, borderRadius: 4
        width: 24,
        height: 24,
        borderRadius: 4,
        marginRight: 14, // Flutter: SizedBox(width: 14)
    },
    text: {
        flex: 1,
        // Flutter: fontFamily: 'Pretendard', fontSize: 16, fontWeight: 500, color: white
        // Note: react-native fontWeight '500' works, fontFamily might need to be checked if available
        fontSize: 16,
        fontWeight: '500',
        color: '#FFFFFF',
        // Flutter: textAlign: TextAlign.left
        textAlign: 'left',
    },
});
