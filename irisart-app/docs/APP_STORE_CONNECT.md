# App Store Connect checklist (IrisArt)

Fill these in [App Store Connect](https://appstoreconnect.apple.com) for app `app.irisart.mobile`.

## 1. Privacy Policy URL

**App Information → Privacy Policy URL**

```
https://irisart.app/privacy
```

Also available in-app: Account → Datenschutz.

Verify in a browser that the full policy text loads (not only a blank shell).

## 2. Support URL

**Version → Support URL**

```
https://irisart.app/support
```

Page shows operator contact email `contact@irisart.app` and a mailto button.
After deploying the web build that includes `/support`, confirm the URL opens.

## 3. App Privacy (nutrition labels)

**App Privacy → Get Started / Edit**

Declare honestly what IrisArt collects. Suggested answers for current product:

| Data type | Collect? | Linked to identity? | Used for |
|-----------|----------|---------------------|----------|
| **Photos or Videos** | Yes (iris photos / uploads) | Yes if signed in | App Functionality |
| **Camera** (if listed as sensor) | Used on device / photos from camera | Same | App Functionality |
| **Contact Info → Email Address** | Yes (account) | Yes | Account / App Functionality |
| **User ID** | Yes (auth user id) | Yes | App Functionality |
| **Purchase History** | Yes (via Stripe checkout) | Yes | App Functionality |
| **Other User Content** | Yes (generated iris art / gallery) | Yes if signed in | App Functionality |
| **Sensitive Info / Biometrics** | Treat iris images as sensitive / biometric-related **photo content for art**, not Face ID login | Yes if stored in account | App Functionality |
| **Name** | Optional (Apple Sign In may provide) | Yes | App Functionality |
| **Diagnostics / Crash** | Only if you add analytics later | — | — |
| **Tracking** | **No** (no ATT / no ad tracking currently) | — | — |

Notes for the questionnaire:

- Purpose: **App Functionality** (create art, account, orders) — not Advertising.
- Do **not** claim Face ID / fingerprint authentication.
- Iris photos are for entertainment/art; privacy policy already states no identity verification.
- Payment card numbers are handled by Stripe (third party); declare payment info / purchase history as applicable.
- **Third-party AI:** cropped iris images are sent to **Google Gemini** after an **in-app consent** screen (what/who/why). Privacy Policy §5 names Gemini. Note this in App Review Information when replying to AI-data-sharing rejections.

## 3b. App Review Information (AI data sharing reply)

Suggested note for App Store Connect → App Review Information:

```
IrisArt sends a cropped eye/iris image region to Google Gemini (Google AI) via our Supabase edge functions for AI enhancement and optional entertainment color analysis only — not for identity verification.

Before the first upload, the app shows a consent screen that discloses: (1) what data is sent, (2) that Google Gemini receives it, (3) the purpose, and requires the user to tap Agree. Decline cancels the flow.

The Privacy Policy (in-app and https://irisart.app/privacy) identifies this third-party AI processing under Storage and processors.
```

## 4. Age rating

**App Information → Age Ratings** → complete questionnaire.

Suggested answers for IrisArt (entertainment art + optional print shop, no UGC chat):

- No unrestricted web browsing
- No gambling
- No violence / horror / mature themes
- No sexual content
- Medical/treatment information: **No** (app is entertainment; do not market as medical)
- Unrestricted web access: No
- User-generated content: photos of own iris only — typically **Infrequent/Mild** or None for contested UGC categories; answer honestly for “Users Can Share / Contests”

Expected result: usually **4+** or **9+** depending on how Apple classifies photo upload / user content. Accept the computed rating.

## 5. Export Compliance

Already set in `app.json`:

```json
"ITSAppUsesNonExemptEncryption": false
```

In App Store Connect when asked about encryption:

- Uses encryption? **Yes** (HTTPS only / standard OS crypto)
- Exempt / only standard encryption? **Yes**
- Or: “App uses only exempt encryption” — matches `ITSAppUsesNonExemptEncryption: false`

You should not need a special export license for HTTPS-only apps.

## Review notes (when submitting)

Paste something like:

```
Demo account:
Email: <create a test account>
Password: <password>

Flow: Scan → crop → enhance → Shop templates → optional Color Analyzer.
Account optional for gallery. Physical prints via Stripe (not IAP).
Sign in with Apple + Google + email available.
Account deletion: Account screen → Konto löschen.
```
