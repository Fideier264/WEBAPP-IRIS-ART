import * as AppleAuthentication from 'expo-apple-authentication';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useT } from '@/lib/i18n';

type Props = {
  onGoogle: () => void | Promise<void>;
  onApple: () => void | Promise<void>;
  disabled?: boolean;
};

function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </Svg>
  );
}

function AppleLogo({ size = 20, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
      />
    </Svg>
  );
}

function GoogleSignInButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.googleBtn,
        (pressed || disabled) && { opacity: 0.88 },
        disabled && styles.disabled,
      ]}>
      <GoogleLogo />
      <Text style={styles.googleText}>{label}</Text>
    </Pressable>
  );
}

function AppleSignInButtonWeb({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.appleBtn,
        (pressed || disabled) && { opacity: 0.88 },
        disabled && styles.disabled,
      ]}>
      <AppleLogo />
      <Text style={styles.appleText}>{label}</Text>
    </Pressable>
  );
}

/** Branded Google + Apple sign-in (Apple native button on iOS). */
export function SocialSignInButtons({ onGoogle, onApple, disabled }: Props) {
  const t = useT();
  const [appleNative, setAppleNative] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      setAppleNative(false);
      return;
    }
    void AppleAuthentication.isAvailableAsync().then(setAppleNative);
  }, []);

  const showApple = Platform.OS === 'ios' || Platform.OS === 'web';
  const appleLabel = t('account.continueApple');
  const googleLabel = t('account.continueGoogle');

  return (
    <View style={styles.root}>
      {showApple ? (
        appleNative ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={[styles.appleNative, disabled && styles.disabled]}
            onPress={() => {
              if (!disabled) void onApple();
            }}
          />
        ) : (
          <AppleSignInButtonWeb label={appleLabel} onPress={() => void onApple()} disabled={disabled} />
        )
      ) : null}

      <GoogleSignInButton label={googleLabel} onPress={() => void onGoogle()} disabled={disabled} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10, width: '100%' },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#747775',
    paddingHorizontal: 16,
  },
  googleText: {
    color: '#1F1F1F',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  appleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#000000',
    paddingHorizontal: 16,
  },
  appleText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  appleNative: {
    width: '100%',
    height: 50,
  },
  disabled: { opacity: 0.55 },
});
