# Claim to Fame

Claim to Fame is a GOODSTUPH internal claims submission app for employee reimbursements, production costs, contractor/vendor payments, travel, meals, and similar agency expenses.

It is built for:

- Netlify frontend hosting
- Supabase authentication, database, storage, and security
- Google Workspace login for `@goodstuph.org`
- Weekday 9:00 AM Asia/Jakarta email digests

## Project Structure

```text
.
├── public/
│   └── goodstuph-logo.png
├── src/
│   ├── components/
│   ├── lib/
│   ├── styles/
│   ├── App.jsx
│   └── main.jsx
├── supabase/
│   └── schema.sql
├── netlify/
│   └── functions/
│       ├── daily-digest.js
│       ├── export-approved.js
│       └── invite-user.js
├── docs/
│   ├── deployment.md
│   └── project-plan.md
├── netlify.toml
├── package.json
└── .env.example
```

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in the values.

3. Start the app:

```bash
npm run dev
```

4. Open the local URL shown in the terminal.

## Key Rules

- Employees can submit claims and see only their own claims.
- Managers can submit their own claims and approve claims assigned to them.
- Manager claims skip manager approval and go to Super Admin final approval.
- Super Admins can see all claims, manage users/categories, approve, mark paid, delete, and export.
- Employees can edit claims only while Draft or Needs Changes.
- Receipts are required, private, and limited to PDF/JPG/PNG/HEIC up to 5 MB each.
- Monthly exports include Admin Approved claims only, grouped by employee.
