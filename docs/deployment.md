# Deployment Guide

## 1. Create Supabase Project

1. Go to Supabase and create a new project.
2. Open the SQL Editor.
3. Paste and run the full contents of `supabase/schema.sql`.
4. Go to Authentication, then Providers.
5. Enable Google.
6. Add your Google OAuth client ID and secret.
7. In Authentication URL settings, add:
   - Your Netlify site URL after deployment
   - Your local development URL if testing locally, usually `http://localhost:5173`

## 2. Create the First Super Admin

1. Sign in to the app once with your `@goodstuph.org` Google account.
2. In Supabase, open Table Editor, then `profiles`.
3. Find your row.
4. Set:
   - `role` to `super_admin`
   - `is_active` to `true`
5. Save.
6. Sign out and sign back in.

After this, Super Admins can invite and activate other users from inside the app.

## 3. Google Workspace Email

Use the dedicated Claim to Fame Google Workspace mailbox as the sender.

Recommended setup:

1. Create or confirm the Google Workspace mailbox exists.
2. Enable two-step verification for that account.
3. Create an App Password for mail sending.
4. Keep that password private. It goes into Netlify environment variables only.

If your Google Workspace policy blocks app passwords, use an SMTP relay or update the Netlify digest function to use the Gmail API.

## 4. Create Netlify Site

1. Push this folder to a Git repository.
2. In Netlify, create a new site from that repository.
3. Build command:

```text
npm run build
```

4. Publish directory:

```text
dist
```

Netlify will read `netlify.toml` automatically.

## 5. Add Netlify Environment Variables

Add these in Netlify Site Settings, Environment Variables:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
SMTP_USER
SMTP_PASS
APP_BASE_URL
```

Use Supabase Project Settings, API Keys, to find the Supabase URL, publishable key, and secret key.

The publishable key is returned to the browser at runtime by a Netlify function. The secret key is private and must only be added to Netlify environment variables for server-side functions.

## 6. Deploy

1. Trigger a Netlify deploy.
2. After the deploy finishes, copy the live Netlify URL.
3. Add that URL to Supabase Authentication URL settings.
4. Test Google login.
5. Invite one employee and one manager.
6. Submit a claim with a small test receipt.
7. Approve as manager, then final approve as Super Admin.
8. Export the approved month.

## 7. Scheduled Email Digest

The digest function is scheduled in `netlify/functions/daily-digest.js`:

```text
0 2 * * 1-5
```

That is 2:00 AM UTC, which is 9:00 AM Asia/Jakarta.

## 8. Important Notes

- The app starts empty except for default claim categories.
- Receipts are private.
- Employees cannot preview/download receipts after normal submission.
- Managers and Super Admins can access receipts for review.
- Permanent deletion is available to Super Admins.
- Audit logs keep before/after values for claim edits and status changes.
- Keep Netlify environment variables limited to the exact list above.
