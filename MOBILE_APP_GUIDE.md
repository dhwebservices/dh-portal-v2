# 📱 DH Staff Portal - Mobile App Guide

## ✅ Setup Complete!

Your portal is now configured as a mobile app for iOS and Android!

---

## 🚀 Quick Start

### **Open iOS Project in Xcode:**
```bash
npm run mobile:ios
```

This will:
1. Build the web assets
2. Sync them to the iOS project
3. Open Xcode automatically

### **Open Android Project in Android Studio:**
```bash
npm run mobile:android
```

---

## 📱 App Configuration

**App Name:** DH Staff Portal
**Bundle ID:** uk.co.dhwebsiteservices.staff
**Server URL:** https://staff.dhwebsiteservices.co.uk

---

## 🎯 Next Steps

### **1. Configure iOS App in Xcode**

Once Xcode opens:

1. **Select a Development Team:**
   - Click on the "App" target in the left sidebar
   - Go to "Signing & Capabilities" tab
   - Under "Team", select your Apple Developer account
   - If you don't see it, click "Add Account" and sign in

2. **Update Bundle Identifier (if needed):**
   - Currently set to: `uk.co.dhwebsiteservices.staff`
   - Change if you want a different ID

3. **Configure Push Notifications:**
   - In "Signing & Capabilities" tab
   - Click "+ Capability"
   - Add "Push Notifications"
   - Add "Background Modes" and check:
     - ✅ Remote notifications
     - ✅ Background fetch

4. **Run on Your iPhone:**
   - Connect your iPhone via USB
   - Select your iPhone from the device dropdown (top center)
   - Click the ▶️ Play button
   - Your app will install and launch!

---

### **2. Configure Android App in Android Studio**

Once Android Studio opens:

1. **Wait for Gradle sync** to complete (first time takes 5-10 min)

2. **Run on Android Device:**
   - Connect Android phone via USB
   - Enable Developer Mode on phone:
     - Settings → About Phone → Tap "Build Number" 7 times
     - Settings → Developer Options → Enable USB Debugging
   - Click the ▶️ Run button
   - Select your device
   - App will install!

---

## 🔔 Firebase Setup (For Push Notifications)

### **Step 1: Create Firebase Project**

1. Go to https://console.firebase.google.com
2. Click "Add Project"
3. Name: "DH Staff Portal"
4. Click "Continue" through the setup

### **Step 2: Add iOS App**

1. In Firebase console, click "Add app" → iOS
2. **iOS bundle ID**: `uk.co.dhwebsiteservices.staff`
3. **App nickname**: DH Staff Portal
4. Download `GoogleService-Info.plist`
5. **Add to Xcode:**
   - Drag `GoogleService-Info.plist` into Xcode
   - Put it in: `ios/App/App/` folder
   - Make sure "Copy items if needed" is checked

### **Step 3: Add Android App**

1. In Firebase console, click "Add app" → Android
2. **Android package name**: `uk.co.dhwebsiteservices.staff`
3. **App nickname**: DH Staff Portal
4. Download `google-services.json`
5. **Add to Android Studio:**
   - Copy `google-services.json` to: `android/app/`

### **Step 4: Get FCM Server Key**

1. In Firebase console → Project Settings → Cloud Messaging tab
2. Under "Cloud Messaging API (Legacy)"
3. Copy the **Server Key** (starts with `AAAA...`)
4. **Add to Cloudflare:**
   - Go to Cloudflare Pages → dh-portal-v2 → Settings → Environment variables
   - Add: `FCM_SERVER_KEY` = `your-server-key-here`

---

## 🛠️ Development Commands

### **Sync Changes to Mobile:**
```bash
npm run mobile:sync
```
Run this after making changes to your web code.

### **Build for Production:**

**iOS:**
1. In Xcode: Product → Archive
2. Distribute App → App Store Connect
3. Upload to TestFlight

**Android:**
1. In Android Studio: Build → Generate Signed Bundle / APK
2. Upload to Google Play Console

---

## 📋 App Store Submission Checklist

### **Apple App Store:**

**Before Submission:**
- [ ] Apple Developer Account active ($99/year)
- [ ] App icons created (1024x1024px)
- [ ] Screenshots taken (iPhone & iPad)
- [ ] Privacy policy URL ready
- [ ] App description written
- [ ] Keywords chosen

**In App Store Connect:**
1. Go to https://appstoreconnect.apple.com
2. Click "My Apps" → "+" → "New App"
3. Fill in app information
4. Upload build from Xcode (via Archive)
5. Submit for review

**Review Time:** 1-3 days

---

### **Google Play Store:**

**Before Submission:**
- [ ] Google Play Developer account ($25 one-time)
- [ ] App icon created (512x512px)
- [ ] Screenshots taken (multiple sizes)
- [ ] Privacy policy URL ready
- [ ] App description written

**In Google Play Console:**
1. Go to https://play.google.com/console
2. Click "Create app"
3. Fill in app details
4. Upload signed APK/AAB
5. Submit for review

**Review Time:** 1-7 days

---

## 🎨 App Icons & Splash Screens

### **Generate App Icons:**

Use a tool like:
- https://www.appicon.co
- https://icon.kitchen

Upload a 1024x1024px logo and it generates all required sizes.

### **Add to Xcode:**
1. Open `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
2. Drag generated icons into Xcode

### **Add to Android:**
1. Copy icons to `android/app/src/main/res/mipmap-*/`

---

## 🔧 Troubleshooting

### **"No Development Team" Error (iOS)**
- Solution: Sign in to Xcode with your Apple ID
- Xcode → Preferences → Accounts → Add Apple ID

### **"Module not found" Error**
- Solution: Sync Capacitor
- Run: `npm run mobile:sync`

### **App won't install on device**
- iOS: Make sure device is registered in Apple Developer portal
- Android: Make sure USB debugging is enabled

### **Push notifications not working**
- Check Firebase setup
- Verify `GoogleService-Info.plist` (iOS) is in correct location
- Verify `google-services.json` (Android) is in correct location
- Check FCM_SERVER_KEY is set in Cloudflare

---

## 📱 Test on Your Device NOW!

**iOS:**
```bash
npm run mobile:ios
```
Then in Xcode:
1. Select your iPhone from device dropdown
2. Click ▶️ Run

**Android:**
```bash
npm run mobile:android
```
Then in Android Studio:
1. Connect phone via USB
2. Click ▶️ Run

---

## 🎯 What's Next?

1. **Test on your devices** - Install and run now!
2. **Set up Firebase** - For push notifications
3. **Create app icons** - Make it look professional
4. **Submit to App Stores** - Once Apple Developer account is active

---

## 📞 App Features Ready to Build:

Once this is running on your phone, I can add:

- ✅ Push notifications for leave requests
- ✅ Biometric login (Face ID / Fingerprint)
- ✅ GPS-based clock in/out
- ✅ Camera for expense receipts
- ✅ Offline mode
- ✅ Xero payroll integration
- ✅ Mobile-optimized UI

**The app shell is ready - test it on your phone now!** 🚀
