# Device test script (one Android phone + one iPhone, about 15 minutes each)

Purpose: the physical-device gate in [GA_RELEASE_GATE.md](GA_RELEASE_GATE.md).
Emulated phones in CI (Pixel 7 web, 198 browser tests on 26 Nov 2026) catch layout
and flow bugs; they do not prove native sign-in, deep links, camera/photo access or
push behaviour. Only this script does.

**Before you start**

- Builds (approved 26 Nov 2026): run `eas workflow:run .eas/workflows/device-test.yml`
  from a computer signed in to the `stuora` Expo account, on the commit under test.
  Android: install the APK from the EAS link or QR code (uninstall any
  Play-installed Stuora first). iOS: install from TestFlight once Apple has
  processed the upload. Both point at **staging**.
- Two GISMA test accounts: A on the phone, B on a laptop browser.
- Note per phone: model, OS version, app build number.

Mark each step ✅ / ❌ and write one line for every ❌ (what you saw, a screenshot).

## 1. Account (4 min)

| # | Do | Expect |
| --- | --- | --- |
| 1.1 | Fresh install → sign up with a new `@gisma-student.com` address | Confirmation email arrives; tapping it opens the **app**, signed in |
| 1.2 | Sign up with a non-GISMA address | Refused, or (if the GISMA-only signup hook is not active yet) signed in but shut out of every student feature with a clear message |
| 1.3 | Force-quit the app, reopen | Still signed in |
| 1.4 | Sign out → "Forgot password" → open the email on the phone | App opens on a set-new-password screen; new password works once; the link doesn't work twice |

## 2. City and feeds (4 min)

| # | Do | Expect |
| --- | --- | --- |
| 2.1 | City chip → type "Munich" → Check | München (Bavaria) first; footer "City data © GeoNames (CC BY 4.0)" opens geonames.org |
| 2.2 | Pick München | Header shows München; still München after force-quit and reopen |
| 2.3 | Events | Events in Munich (Ticketmaster may name it "Munich"); venue line not blank; tapping one opens Ticketmaster |
| 2.4 | City "Frankfurt" → Check | Frankfurt am Main and Frankfurt (Oder) both listed, Main first |
| 2.5 | City "Wien" → Events | Austrian events or "No external events", never German ones |
| 2.6 | Jobs | "External jobs aren't enabled yet" (correct while unlicensed) |
| 2.7 | Airplane mode → Events → Retry, then back online → Retry | Clear error offline; listings back online; no crash |

## 3. Listings and messaging (5 min)

| # | Do | Expect |
| --- | --- | --- |
| 3.1 | Phone (A): create a Housing listing with a photo from the gallery | Photo permission prompt once; listing appears with the photo |
| 3.2 | Look for a camera option when adding a photo | None offered (camera permission is off in this build), and the gallery still works |
| 3.3 | Laptop (B): find A's listing, send a message | Listing visible with photo |
| 3.4 | Phone (A): open the message, reply | Arrives on the laptop; survives app restart |
| 3.5 | Phone (A): Report on B's message | "Report sent" confirmation; reporting again says it was already reported |

## 4. Assistant and basics (2 min)

| # | Do | Expect |
| --- | --- | --- |
| 4.1 | Assistant: "student jobs in Berlin" | Honest answer, no invented listings |
| 4.2 | Rotate the phone; set system text size to largest | Nothing cut off or overlapping; buttons still reachable |
| 4.3 | Turn on VoiceOver (iOS) / TalkBack (Android), move through the city picker | Every control is read with a sensible name |
| 4.4 | Profile → Delete account (throwaway account only; needs the confirmation phrase and password) | Account gone; signing in again fails |

## Result

| Phone | Model / OS | Build | Pass? | Blocking ❌ |
| --- | --- | --- | --- | --- |
| Android | | | | |
| iPhone | | | | |

GA needs both rows passed with no blocking ❌. A ❌ in sections 1 or 3 blocks
launch. A ❌ in 2.5 or 4.2–4.3 can ship as a known issue, if you decide so in writing.
