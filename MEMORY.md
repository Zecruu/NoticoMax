# Planner memory

- 2026-06-23: Operator asked to pull from `main`, sign the NoticoMax iOS build, and upload it to Apple so they can submit it for review.
- `holy` is the available coder for this project and should execute repo/build/sign/upload work.
- Active release mission for `holy`: `0167517da22542839965543465a1b8f0` (`Sign and upload iOS build`).
- `holy` pulled `origin/main` and archived successfully to `dist-ios/App.xcarchive`; bundle `com.noticomax.app`, version `2.5.9`, build `11`. Export/upload blocked because Xcode Apple session for `nomnk5138@gmail.com` expired and no Apple/iOS Distribution identity is installed for team `XJ2JD24RGF`.
- Pull was fast-forward to `d78fefe`; `holy` aligned iOS `MARKETING_VERSION` from `2.5.2` to package version `2.5.9`; `CURRENT_PROJECT_VERSION` bumped `10` -> `11`.
