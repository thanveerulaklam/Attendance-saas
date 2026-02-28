const GRACE_DAYS = 7;

/**
 * Compute subscription status from company (matches backend logic).
 * @param {{ is_active?: boolean, subscription_end_date?: string|null }} company
 * @returns {{ allowed: boolean, expired: boolean, inGrace: boolean, daysLeft: number|null, endDate: string|null }}
 */
export function getSubscriptionStatus(company) {
  if (!company) {
    return { allowed: false, expired: true, inGrace: false, daysLeft: null, endDate: null };
  }
  if (company.is_active === false) {
    return { allowed: false, expired: true, inGrace: false, daysLeft: null, endDate: company.subscription_end_date || null };
  }
  const endDate = company.subscription_end_date;
  if (!endDate) {
    return { allowed: true, expired: false, inGrace: false, daysLeft: null, endDate: null };
  }
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const graceEnd = new Date(end);
  graceEnd.setDate(graceEnd.getDate() + GRACE_DAYS);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (today > graceEnd) {
    return { allowed: false, expired: true, inGrace: false, daysLeft: 0, endDate };
  }
  if (today > end) {
    const daysLeft = Math.ceil((graceEnd - today) / (24 * 60 * 60 * 1000));
    return { allowed: true, expired: true, inGrace: true, daysLeft, endDate };
  }
  const daysLeft = Math.ceil((end - today) / (24 * 60 * 60 * 1000));
  return { allowed: true, expired: false, inGrace: false, daysLeft, endDate };
}
