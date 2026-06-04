import { format } from 'date-fns';

export function formatMoney(amount, currency) {
  const value = Number(amount || 0);
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'IDR' ? 0 : 2,
  }).format(value);
}

export function formatDate(date) {
  if (!date) return '-';
  return format(new Date(date), 'dd MMM yyyy');
}

export function monthValue(date = new Date()) {
  return format(date, 'yyyy-MM');
}

export function humanStatus(status, labels) {
  return labels[status] || status;
}
