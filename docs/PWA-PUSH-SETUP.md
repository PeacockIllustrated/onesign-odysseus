# PWA install + Web Push — setup

Odysseus is an installable PWA (Add to Home Screen) with Web Push notifications
that fire for every row inserted into `public.notifications` (the global "Needs
Attention" feed — new orders, artwork approvals/changes, shop-floor flags).

The code ships in the repo; the steps below are the one-time operational wiring.

## 1. Environment variables (Vercel)

| Var | Scope | Value |
|-----|-------|-------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public | VAPID public key (safe to expose) |
| `VAPID_PRIVATE_KEY` | Server | VAPID private key — **secret** |
| `VAPID_SUBJECT` | Server | `mailto:hello@onesignanddigital.com` (or your contact URL) |
| `PUSH_DISPATCH_SECRET` | Server | A long random string; also set as the webhook header (step 3) |

Generate a fresh VAPID keypair any time with:

```bash
node -e 'const{generateKeyPairSync}=require("crypto");const{publicKey,privateKey}=generateKeyPairSync("ec",{namedCurve:"prime256v1"});const pub=publicKey.export({format:"jwk"});const prv=privateKey.export({format:"jwk"});console.log("NEXT_PUBLIC_VAPID_PUBLIC_KEY="+Buffer.concat([Buffer.from([4]),Buffer.from(pub.x,"base64url"),Buffer.from(pub.y,"base64url")]).toString("base64url"));console.log("VAPID_PRIVATE_KEY="+Buffer.from(prv.d,"base64url").toString("base64url"));'
```

If push env vars are absent the feature cleanly no-ops (the Enable-notifications
pill hides; the dispatch route returns 503).

## 2. Database

Apply migration `069_push_subscriptions.sql` (creates the per-user subscription
table with RLS).

## 3. Notifications → dispatcher (wired in SQL — migration 070)

Already implemented as `070_push_notification_trigger.sql`: a `pg_net`
`AFTER INSERT` trigger on `public.notifications` POSTs each new row to
`https://onesign-odysseus.vercel.app/api/push/dispatch` with
`Authorization: Bearer <push_dispatch_secret>`. `/api/push/dispatch` verifies
the secret and fans the row out to every subscribed device, pruning any that
return 404/410. The trigger is exception-guarded, so a pg_net/Vault hiccup can
never roll back a notification insert.

**Only manual step:** store the Bearer token in **Supabase Vault** under the
name `push_dispatch_secret` (must equal `PUSH_DISPATCH_SECRET` in the app env).
Until it's set, the trigger reads NULL and safely no-ops.

- **Vault UI:** Project → Vault → New secret → name `push_dispatch_secret`,
  value = your `PUSH_DISPATCH_SECRET`.
- **or SQL editor:** `select vault.create_secret('<PUSH_DISPATCH_SECRET>', 'push_dispatch_secret');`

> If the production domain changes, update the URL inside `notify_push_dispatch()`
> (migration 070).

## 4. Install + enable (per device)

- **Android / desktop Chrome:** visit the app → install prompt / ⋮ → *Install*.
  Then tap **🔔 Enable notifications**.
- **iOS (16.4+):** Safari → Share → **Add to Home Screen**, open from the home
  screen, then tap **Enable notifications**. iOS only allows Web Push from an
  *installed* PWA.

## Notes / limits

- The `notifications` feed is global, so a push goes to **every** opted-in staff
  device (no per-user routing yet — a future enhancement if needed).
- The app icon (`app/api/icon`, `app/apple-icon.tsx`) is a generated placeholder
  mark; drop in commissioned PNG art when ready.
- The service worker (`public/sw.js`) handles push + click only — no offline
  caching, since the app is server-rendered.
