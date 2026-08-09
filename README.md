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

## Next

- Etsy OAuth via Cloud Functions
- Tracking refresh jobs
- Extension sync against the same Firestore account

## Related

- Chrome extension: `order-tracker-hub` (separate repo)
