# NexusLLM — Android App

A ChatGPT-style native Android client (Kotlin + Jetpack Compose) for **NexusLLM**.
Pure monochrome (black/white) UI, follows the system light/dark theme.

Every user connects with **their own** Base URL + API key — nothing is shared
and no developer key is baked in. The app lists the exact same models the
website exposes via `GET {baseUrl}/v1/models` (including **Auto** and **Fusion**),
streams replies over SSE, and shows a **thinking/reasoning** toggle (Low → Max)
for reasoning-capable models.

## Features
- Lightning-strike splash animation + onboarding
- Connect screen (Base URL + API key, stored locally via DataStore)
- ChatGPT-style chat: streaming, markdown-ish text, "thinking" trace
- History drawer (local, persisted), new chat, delete chat
- Model picker bottom sheet (all models from your endpoint)
- Reasoning toggle + intensity, driven by each model's capabilities

## Build the APK

You need **Android Studio** (Koala / 2024.1+) or the Android command-line SDK.

### Option A — Android Studio (recommended)
1. `File ▸ Open` and select this `LLMFree-App` folder.
2. Let Gradle sync (it downloads the Gradle wrapper + dependencies).
3. `Build ▸ Build Bundle(s) / APK(s) ▸ Build APK(s)`.
4. The debug APK lands in `app/build/outputs/apk/debug/app-debug.apk`.

For a shareable build: `Build ▸ Generate Signed Bundle / APK ▸ APK`.

### Option B — command line
```bash
# from the LLMFree-App folder (Android SDK + JDK 17 required)
gradle wrapper          # generates ./gradlew the first time
./gradlew assembleRelease
# unsigned release APK: app/build/outputs/apk/release/app-release-unsigned.apk
```

## Connecting
On first launch: Onboarding ▸ **Connect**. Enter the SAME Base URL + API key you
use on the NexusLLM website (e.g. `https://nexusllm-3x5q.onrender.com`). The app
appends `/v1/...` itself, so a trailing `/v1` is optional.

## Tech
- Kotlin 1.9, Jetpack Compose (Material 3), Navigation by simple route state
- OkHttp + okhttp-sse for streaming, kotlinx.serialization for JSON
- DataStore Preferences for settings + conversation history
- minSdk 26, targetSdk/compileSdk 34
