# Auth & cloud iris gallery

Generated iris images are saved to the user’s **Supabase account** (table `user_irises` + Storage bucket `user-irises`). Guests can still run the generator; **Galerie save/list requires login**.

## App setup

Already wired in the Expo app:

- Session persistence via `@react-native-async-storage/async-storage`
- Email/password + Google OAuth on screen `/account`
- Galerie header **Login / Account** button

Deep-link scheme (from `app.json`): `irisartapp`  
OAuth redirect used by the app: `irisartapp://auth/callback` (via `Linking.createURL('auth/callback')`).

## Supabase Dashboard (required)

### 1) Apply migration

Run the SQL in:

- `supabase/migrations/20260425120000_user_irises.sql`
- `supabase/migrations/20260425130000_user_irises_analysis.sql` (stores Color Analyzer results so gallery never re-runs Gemini; analysis is written to the account on first run)

(via `supabase db push`, SQL Editor, or your usual migration path).

### 2) Email / password

1. **Authentication → Providers → Email**: enable.
2. For faster MVP testing, turn **Confirm email** off (you can re-enable later).
3. Optionally set Site URL / redirect allow-list to include your app redirects.

### 3) Google provider

1. Google Cloud Console → OAuth client (Web) → Client ID + Secret.
2. Supabase → **Authentication → Providers → Google**: paste Client ID + Secret, enable.
3. Supabase → **Authentication → URL configuration**:
   - Add redirect URL: `irisartapp://auth/callback`
   - If using Expo Go / tunnel redirects, also add the exact URL printed by `Linking.createURL('auth/callback')` on device.
4. In Google Cloud OAuth client, add the **Supabase callback** URL shown in the Google provider settings (typically `https://<project-ref>.supabase.co/auth/v1/callback`).

### 4) Verify Storage

Bucket `user-irises` should exist (private). Policies restrict objects to folder `{auth.uid()}/…`.

### 5) Account deletion (App Store 5.1.1(v))

In-app delete lives on `/account` (two-step confirm). It calls Edge Function **`delete-account`**, which:

1. Verifies the user’s session (`GET /auth/v1/user`)
2. Removes Storage objects under `{uid}/` in bucket `user-irises`
3. Deletes `user_irises` rows
4. Deletes the Auth user (`DELETE /auth/v1/admin/users/{uid}`)

Deploy (JWT required — do **not** use `--no-verify-jwt`):

```bash
supabase functions deploy delete-account
```

Secret: **`SUPABASE_SERVICE_ROLE_KEY`** (same as other admin functions). `eye_profiles` is an anonymous image-hash cache and is **not** wiped per user.

Completed print orders at Stripe / merchOne are business records and may remain where legally required; the confirmation copy in the app states this.

## Behaviour summary

| State | Generator | Galerie |
|-------|-----------|---------|
| Logged out | Works | Empty + login CTA; no cloud save |
| Logged in | Works + auto-save on successful enhance | Lists cloud irises |

## Troubleshooting

- **Google cancelled / no session**: check redirect URLs match exactly; rebuild/reload Expo after scheme changes.
- **Edge Function HTTP 401** (`iris-enhance` / `iris-analyze`): the app calls these with the **anon key**. Use the legacy **anon public** JWT (`eyJ…`) from Project Settings → API as `EXPO_PUBLIC_SUPABASE_ANON_KEY` (not only a `sb_publishable_…` key). Redeploy functions so `supabase/config.toml` (`verify_jwt = false`) applies: `supabase functions deploy iris-enhance`.
- **Upload fails**: confirm user is authenticated and migration + storage policies are applied.
- **Empty signed URLs**: signed URL creation may fail if the storage path is wrong or the object was deleted.
- **Konto löschen schlägt fehl / 404**: Function `delete-account` deployen (`supabase functions deploy delete-account`). 401: User-JWT senden, nicht den Anon-Key.
