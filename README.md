# Tracking Hub (Web)

Multi-shop order tracking dashboard. Companion to the **Order Tracker Hub** Chrome extension.

**Live:** https://engrsyednaqvi.github.io/tracking-hub-webapp/

## Stack

- React + TypeScript + Vite + Tailwind
- Firebase Auth + Firestore (multi-shop: `users/{uid}/shops`, `users/{uid}/orders`)
- Hosted free on GitHub Pages
- Demo mode when Firebase env vars are missing (site still loads)

## Develop

```bash
npm install
cp .env.example .env   # then fill Firebase web config
npm run dev
```

## Firebase setup (one-time)

1. Create a project at [Firebase Console](https://console.firebase.google.com/) (e.g. `tracking-hub-webapp`).
2. Enable **Authentication** → Sign-in method → **Google** + **Email/Password**.
3. Create a **Firestore** database (production mode), then deploy rules:

   ```bash
   npx firebase login
   npx firebase use --add   # select the project
   npx firebase deploy --only firestore:rules
   ```

4. Project settings → Your apps → Web app → copy config into `.env`:

   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   ```

5. Authentication → Settings → Authorized domains → add `engrsyednaqvi.github.io` and `localhost`.
6. For GitHub Pages builds, add the same six values as repository **Secrets** (Settings → Secrets and variables → Actions). Names must match `VITE_FIREBASE_*`.

## Deploy

Pushes to `main` deploy via GitHub Actions:

`https://engrsyednaqvi.github.io/tracking-hub-webapp/`

Without secrets, the live site stays in **demo mode**.

## Data model

```
users/{uid}/shops/{shopId}
users/{uid}/orders/{orderId}   # includes shopId for filtering
```

## Etsy connect (same developer app as the extension)

1. Upgrade the Firebase project to **Blaze** (required for Cloud Functions; free quota is usually enough).
2. Set secrets and deploy:

   ```bash
   npx firebase login
   npx firebase use tracking-hub-webapp-29401
   npx firebase functions:secrets:set ETSY_KEYSTRING
   npx firebase functions:secrets:set ETSY_SHARED_SECRET
   npx firebase functions:config:unset unused 2>nul
   npx firebase deploy --only functions,firestore:rules
   ```

3. In [Etsy Developers](https://www.etsy.com/developers/your-apps), set **Callback URL** to exactly:

   `https://us-central1-tracking-hub-webapp-29401.cloudfunctions.net/etsyOAuthCallback`

   (Etsy allows one callback per app — this replaces the extension `chromiumapp.org` URL until the extension is migrated to Firebase OAuth.)

4. Auth → Authorized domains: keep `localhost` and `engrsyednaqvi.github.io`.
5. On the live site → **Shops** → **Connect Etsy** → **Sync**.

## Next

- Migrate extension OAuth to the same Firebase callback
- Tracking refresh jobs
- Multi-account Etsy shops per user

## Related

- Chrome extension: `order-tracker-hub` (separate repo)
