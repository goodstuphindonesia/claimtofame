export const CLAIM_STATUSES = [
  'draft',
  'submitted',
  'needs_changes',
  'manager_approved',
  'admin_approved',
  'rejected',
  'paid',
  'cancelled',
];

export const STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Submitted',
  needs_changes: 'Needs Changes',
  manager_approved: 'Manager Approved',
  admin_approved: 'Admin Approved',
  rejected: 'Rejected',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

export const ROLES = {
  employee: 'Employee',
  manager: 'Manager',
  super_admin: 'Super Admin',
};

export const CURRENCIES = ['IDR', 'SGD', 'USD'];

export const ACCEPTED_RECEIPT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
];

export const MAX_FILE_SIZE = 5 * 1024 * 1024;

export const DEFAULT_CATEGORIES = [
  'Accommodation',
  'Courier & Delivery',
  'Grooming',
  'Equipment purchase',
  '3rd party vendor',
  'Meals',
  'Media buy',
  'Mobile',
  'Office supplies',
  'Production',
  'Software subscription',
  'Transport',
];
