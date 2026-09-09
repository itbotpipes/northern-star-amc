# Northern Star — Customer Mobile App (React Native / Expo)

The **customer app** for the Northern Star AMC platform, built with **Expo (React Native, SDK 51)** —
**one codebase for both Android and iOS**. It covers the full customer portal: contracts, visits &
ratings, quotations, complaints, notifications, journey timeline, and profile.

## Requirements
- **Node.js 18+** and npm (install on the developer's machine)
- The **Expo Go** app on your phone (iOS App Store / Google Play), OR an Android/iOS emulator

## Run
```bash
npm install
npx expo start        # scan the QR code with Expo Go, or press a (Android) / i (iOS)
```

## Point it at the backend
Edit `src/api/client.js` → `API_BASE`:
- **Production (default):** `https://app-amc-three.vercel.app/api/v1`
- **Physical phone, local server:** `http://<your-computer-LAN-IP>:5055/api/v1`
- **Android emulator:** `http://10.0.2.2:5055/api/v1`
- **iOS simulator:** `http://127.0.0.1:5055/api/v1`

The backend JSON API lives in the main project at `nse/blueprints/api.py` (prefix `/api/v1`).
Log in with a customer phone number — the OTP is auto-filled in dev (returned by the API until an
SMS gateway is wired up). Demo customer: **9876543210**.

## What's in the app
Bottom-tab navigation (Home · Quotations · Notifications · Complaints · Profile) with detail screens
pushed on top:

```
App.js                        tab + stack navigation, auth-gated
src/api/client.js             fetch wrapper, token storage, ALL endpoints
src/context/AuthContext.js    session state (restores token on launch, refresh())
src/theme.js                  brand tokens, status-pill map, ₹/date formatters
src/components/ui.js          shared UI kit: Card, Pill, Btn, Row, Field, Loading, Empty…
src/screens/
  LoginScreen.js              phone -> request OTP
  VerifyScreen.js             OTP -> token -> sign in
  HomeScreen.js               dashboard: counts, quick actions, contract cards
  ContractScreen.js           contract detail: facts, safety score, roadmap, visits, actions
  VisitScreen.js              visit detail + checklist + material quotes + 5-star rating
  QuotationsScreen.js         service-quotation list
  QuotationDetailScreen.js    line items + accept / request-a-change (negotiate)
  MaterialQuoteScreen.js      visit-linked material quote: approve / decline-with-waiver
  RequestsScreen.js           emergency / NOC requests + refill orders
  TicketsScreen.js            complaints list + "new complaint"
  RaiseTicketScreen.js        raise a complaint (title, description, priority)
  TicketDetailScreen.js       complaint status, staff reply, 24h re-trigger
  NotificationsScreen.js      notifications + mark-all-read
  JourneyScreen.js            customer journey timeline
  ProfileScreen.js            view/edit profile + sign out
  AgreementScreen.js          scroll-to-accept AMC agreement
  ReferScreen.js              refer a friend
```

## Backend endpoints this app uses (all under `/api/v1`)
`POST /auth/otp/request` · `POST /auth/otp/verify` · `GET/PUT /me` · `GET /dashboard` ·
`GET /contracts` · `GET /contracts/<id>` · `POST /contracts/<id>/renew` · `.../refer` ·
`GET /contracts/<id>/agreement` (+`/accept`) · `GET /visits/<id>` · `POST /visits/<id>/rate` ·
`GET /service-quotations` (+`/<id>`, `/accept`, `/negotiate`) · `GET /quotations/<id>` (+`/decide`) ·
`GET /requests` · `GET/POST /tickets` (+`/<id>`, `/retrigger`) · `GET /journey` ·
`GET /notifications` (+`/read`) · `GET /plans`.

All are defined in `nse/blueprints/api.py` in the main project.

## Add a new feature (the recipe)
1. Add a JSON route to `nse/blueprints/api.py` (reuse the queries in `nse/blueprints/portal.py`).
2. Add a method to `src/api/client.js`.
3. Add a screen in `src/screens/` and register it in `App.js`.

## Build for the app stores
```bash
npm install -g eas-cli
eas build --platform android     # .aab for Play Store
eas build --platform ios         # .ipa for App Store
```
Bundle IDs are set in `app.json` (`com.northernstar.amc`). Supports current Android (7.0+ / API 24+,
per Expo SDK 51) and iOS (13.4+).

See `MOBILE_APP.md` in the main project for the full architecture + roadmap.
