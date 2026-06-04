# Project Plan

## Product Scope

Claim to Fame is a dark-mode GOODSTUPH internal web app for employee claims. Claims cover Accommodation, Courier & Delivery, Grooming, Equipment purchase, 3rd party vendor, Meals, Media buy, Mobile, Office supplies, Production, Software subscription, and Transport.

Each claim is a single line item with required title, category, vendor/merchant, amount, currency, date incurred, Job No., business purpose, and at least one receipt/invoice upload. Notes are optional.

## Roles

- Employee: submits claims, saves drafts, edits Draft or Needs Changes claims, cancels Draft claims, views own claim details/status.
- Manager: all Employee abilities, plus approves/rejects/requests changes for assigned employee claims.
- Super Admin: sees all claims, manages users/categories, edits submitted claims, final approves, marks paid, permanently deletes, exports approved claims, and reviews audit logs.

## Workflow

```text
Draft
  ↓
Submitted
  ↓
Manager Approved
  ↓
Admin Approved
  ↓
Paid
```

Alternative states:

- Needs Changes
- Rejected
- Cancelled

Manager-submitted claims skip Submitted manager review and move straight to Manager Approved for Super Admin review.

## Dashboards

Employee:

- New claim form
- Drafts
- Submitted claims
- Needs Changes
- Approved/Paid history
- Rejected history

Manager:

- Pending approvals
- Approval history via claim history
- Own claims

Super Admin:

- All claims
- Pending final approvals
- Paid/unpaid/admin-approved totals
- Search and filtering
- Monthly export
- User/category settings
- Audit log

## Data Model

Core tables:

- `profiles`
- `claim_categories`
- `claims`
- `claim_receipts`
- `approval_events`
- `audit_logs`

Storage:

- Private Supabase bucket: `claim-receipts`

Security:

- Supabase Auth with Google OAuth
- `@goodstuph.org` email domain check
- Row Level Security for employees, managers, and Super Admins
- Server-only Netlify functions for exports, invites, and digests

## Email Digests

Daily weekday digest at 9:00 AM Asia/Jakarta:

- Employees receive own claim updates.
- Managers receive claims waiting for their approval.
- Super Admins receive final-approval queue and approved/paid summaries.
- Emails group counts by category and direct users to log in for details.

## Export

Super Admins can export Admin Approved claims by month only.

The export is a ZIP:

```text
GOODSTUPH-approved-claims-YYYY-MM.zip
├── claims.csv
└── receipts/
    ├── employee@goodstuph.org/
    └── another.employee@goodstuph.org/
```

Receipt names use:

```text
employee-date-amount-originalfilename
```
