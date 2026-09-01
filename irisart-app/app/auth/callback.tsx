import { Redirect } from 'expo-router';

/** OAuth deep link target (`irisartapp://auth/callback`). Session is set in AuthProvider. */
export default function AuthCallbackScreen() {
  return <Redirect href="/account" />;
}
