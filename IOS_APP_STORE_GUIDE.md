# iOS App Store Setup Guide — Notico Max

## Step 1: Apple Developer Account

1. Go to https://developer.apple.com/account
2. Sign in with your Apple ID (or create one)
3. Enroll in the **Apple Developer Program** ($99/year)
   - Individual or Organization (individual is faster to approve)
   - Takes 24-48 hours to process payment and activate
4. Once enrolled, you'll have access to:
   - App Store Connect (https://appstoreconnect.apple.com)
   - Certificates, Identifiers & Profiles (https://developer.apple.com/account/resources)

---

## Step 2: Create App Identifier (Bundle ID)

1. Go to https://developer.apple.com/account/resources/identifiers/list
2. Click the **+** button to register a new identifier
3. Select **App IDs** > **App**
4. Fill in:
   - **Description**: Notico Max
   - **Bundle ID**: Select "Explicit" and enter `com.noticomax.app`
5. Under **Capabilities**, enable:
   - [x] Push Notifications
   - [x] Associated Domains (for deep links, optional)
6. Click **Continue** > **Register**

---

## Step 3: Create Signing Certificate

### Option A: Let Xcode Handle It (Recommended)
1. Open the project in Xcode: `npx cap open ios`
2. Select the **App** target > **Signing & Capabilities** tab
3. Check **Automatically manage signing**
4. Select your **Team** from the dropdown
5. Xcode will create the certificate and provisioning profile automatically

### Option B: Manual Certificate
1. Go to https://developer.apple.com/account/resources/certificates/list
2. Click **+** to create a new certificate
3. Select **Apple Distribution** (for App Store submissions)
4. Follow the instructions to create a Certificate Signing Request (CSR) from Keychain Access on your Mac:
   - Open **Keychain Access** > Certificate Assistant > Request a Certificate from a Certificate Authority
   - Enter your email, leave CA Email blank, select "Saved to disk"
5. Upload the CSR file
6. Download and double-click the `.cer` file to install it in Keychain

---

## Step 4: Create Push Notification Key (APNs)

This is needed for native push notifications to work.

1. Go to https://developer.apple.com/account/resources/authkeys/list
2. Click **+** to create a new key
3. **Key Name**: NoticoMax Push Key
4. Enable **Apple Push Notifications service (APNs)**
5. Click **Continue** > **Register**
6. **IMPORTANT — Download the `.p8` key file immediately**. You can only download it once.
7. Note down:
   - **Key ID** (shown on the key details page, e.g., `ABC123DEFG`)
   - **Team ID** (shown at top right of developer portal, e.g., `TEAM1234`)

Save these securely — you'll need them if you set up server-side push later.

---

## Step 5: Create App in App Store Connect

1. Go to https://appstoreconnect.apple.com/apps
2. Click **+** > **New App**
3. Fill in:
   - **Platforms**: iOS
   - **Name**: Notico Max (must be unique on the App Store)
   - **Primary Language**: English (U.S.)
   - **Bundle ID**: Select `com.noticomax.app` from dropdown
   - **SKU**: `noticomax` (internal reference, any unique string)
   - **User Access**: Full Access
4. Click **Create**

---

## Step 6: App Store Listing Metadata

In App Store Connect, go to your app and fill in these required fields:

### App Information Tab
- **Category**: Productivity
- **Secondary Category**: Utilities (optional)
- **Content Rights**: Does not contain third-party content (or declare if it does)
- **Age Rating**: Click "Set Up" and answer the questionnaire (likely 4+ with no objectionable content)

### Pricing and Availability Tab
- **Price**: Free
- **Availability**: All territories (or select specific ones)

### App Privacy Tab (REQUIRED)
- Click **Get Started** and declare your data practices:
  - **Contact Info** (email): Collected, linked to identity, for app functionality
  - **Name**: Collected, linked to identity, for app functionality
  - **User Content** (notes): Collected, linked to identity, for app functionality
  - **Identifiers** (user ID): Collected, linked to identity, for app functionality
  - **Diagnostics** (crash data): Not collected (unless you add analytics)
- You must also provide a **Privacy Policy URL** (e.g., `https://www.noticomax.com/privacy`)

### Version Information (iOS App 1.0 page)
- **Screenshots** (REQUIRED — at least one set):
  - iPhone 6.7" display (1290 x 2796 px) — iPhone 15 Pro Max / 16 Pro Max
  - iPhone 6.5" display (1284 x 2778 px) — iPhone 14 Plus / 15 Plus (optional but recommended)
  - iPad Pro 12.9" (2048 x 2732 px) — optional unless you support iPad
  - Take 3-5 screenshots showing key features: dashboard, notes, study mode, reminders, settings
- **Description** (max 4000 chars):
  ```
  Notico Max is your all-in-one smart notes app. Save notes, bookmarks,
  and reminders — all in one place. Works offline, syncs across devices.

  Features:
  - Create and organize notes with Markdown support
  - Save URLs and bookmarks with one tap
  - Set reminders with native notifications
  - Study mode with flashcards and quizzes
  - Organize with folders, tags, and colors
  - Full-text search across all your content
  - Dark mode support
  - Works completely offline
  - Cloud sync across all devices (Pro)
  - Biometric lock for privacy
  ```
- **Keywords** (max 100 chars, comma-separated):
  ```
  notes,bookmarks,reminders,study,flashcards,productivity,offline,sync,organize,markdown
  ```
- **Support URL**: `https://www.noticomax.com` (or a support/contact page)
- **Marketing URL**: `https://www.noticomax.com` (optional)
- **Promotional Text** (max 170 chars, can be updated without new build):
  ```
  Save notes, bookmarks, and reminders. Study with flashcards. Works offline.
  ```
- **What's New in This Version**:
  ```
  Initial release of Notico Max for iOS.
  ```

### App Review Information
- **Contact Information**: Your name, phone, email
- **Sign-in Required**: Yes
- **Demo Account**: Provide a test email/password that the reviewer can use to sign in
  - Create a test account before submission (e.g., `review@noticomax.com` / `TestPassword123`)
- **Notes for Reviewer**:
  ```
  This app connects to our web backend at https://www.noticomax.com.

  Native features beyond web:
  - Push notifications via APNs
  - Haptic feedback on interactions
  - Biometric authentication (Face ID / Touch ID) for app lock
  - Native local notifications for reminders
  - Deep link support via noticomax:// URL scheme

  Test account credentials provided above. The app requires an internet
  connection for initial sign-in, then works offline.
  ```

---

## Step 7: Build and Upload from Xcode

### Prerequisites on your Mac
```bash
# Pull latest code
git pull origin master

# Install dependencies
npm install

# Sync Capacitor
npx cap sync

# Open in Xcode
npx cap open ios
```

### In Xcode
1. Select **App** target > **General** tab:
   - **Display Name**: Notico Max
   - **Bundle Identifier**: `com.noticomax.app` (should already be set)
   - **Version**: `1.0.0`
   - **Build**: `1`
2. Select **Signing & Capabilities** tab:
   - Team: Your Apple Developer team
   - Check "Automatically manage signing"
   - Click **+ Capability** > Add **Push Notifications**
   - Click **+ Capability** > Add **Background Modes** > Check "Remote notifications"
3. Select a **physical device** or "Any iOS Device (arm64)" as build target
4. **Product** > **Archive**
5. Once archive completes, the Organizer window opens
6. Click **Distribute App**
7. Select **App Store Connect** > **Upload**
8. Follow prompts (leave default options)
9. Wait for upload to complete

### After Upload
- Go to App Store Connect > Your App > TestFlight
- The build will appear after Apple processes it (5-30 minutes)
- You'll get an email about "Export Compliance" — click it and confirm the app doesn't use non-exempt encryption (we set `ITSAppUsesNonExemptEncryption = false` in Info.plist)

---

## Step 8: Submit for Review

1. In App Store Connect, go to your app's **iOS App 1.0** page
2. Under **Build**, click **+** and select your uploaded build
3. Make sure all required fields are filled (screenshots, description, privacy, etc.)
4. Click **Add for Review**
5. Click **Submit to App Review**

### Review Timeline
- First submission: typically 24-48 hours
- If rejected, read the rejection reason carefully, fix the issue, upload a new build, and resubmit
- Common rejection reasons:
  - **4.2 Minimum Functionality**: Ensure native features (push, haptics, biometric) are working
  - **5.1.1 Data Collection**: Make sure privacy policy URL works and covers all data types
  - **2.1 Performance**: App must not crash during review

---

## Checklist Summary

### Apple Developer Portal (developer.apple.com)
- [ ] Enrolled in Apple Developer Program ($99/year)
- [ ] Created App ID: `com.noticomax.app` with Push Notifications enabled
- [ ] Created APNs Key (`.p8` file downloaded and saved securely)
- [ ] Noted Key ID and Team ID

### App Store Connect (appstoreconnect.apple.com)
- [ ] Created new app with bundle ID `com.noticomax.app`
- [ ] Set category to Productivity
- [ ] Completed Age Rating questionnaire
- [ ] Set pricing to Free
- [ ] Completed App Privacy declarations
- [ ] Added Privacy Policy URL
- [ ] Uploaded screenshots (at least iPhone 6.7")
- [ ] Filled in description, keywords, support URL
- [ ] Created demo/review account credentials
- [ ] Added App Review notes explaining native features

### Xcode
- [ ] Set Team and automatic signing
- [ ] Added Push Notifications capability
- [ ] Added Background Modes > Remote notifications capability
- [ ] Version set to 1.0.0, Build set to 1
- [ ] Archived and uploaded to App Store Connect

### Before Submission
- [ ] Privacy Policy page live at your URL
- [ ] Demo account working and accessible
- [ ] Tested on a physical device (or simulator) that the app loads and functions
- [ ] Tested sign-in, note creation, reminder with notification
