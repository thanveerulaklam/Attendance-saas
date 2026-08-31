# International client onboarding (UAE)

## Billing model

| | India (`IN`) | UAE (`AE`) |
|--|--------------|------------|
| Setup fee | One-time (per plan) | **None** |
| Recurring | Annual AMC | **Annual subscription only** |
| Tax note | excl. GST | excl. VAT (5%) |

UAE plan tiers share most India `plan_code` values, plus an AE-only **Base** tier (up to 10 employees). Amounts are in **AED/year** — see `frontend/src/constants/pricingPlans.js` → `PRICING_PLANS_AE`.

| Plan | Employees | AED / year (excl. VAT) | ~AED / employee |
|------|-----------|------------------------|-----------------|
| Base | Up to 10 | 499 | ~50 |
| Basic | Up to 25 | 1,149 | ~46 |
| Growth | Up to 50 | 2,149 | ~43 |
| Business | Up to 100 | 3,799 | ~38 |
| Professional | Up to 200 | 6,499 | ~32 |
| Enterprise | 200+ | Custom | — |

## SuperAdmin setup

1. Create company → **Country = United Arab Emirates**
2. Pick plan — dropdown shows yearly AED price (no OTC/AMC split)
3. Set access window (start + end dates)
4. ADMS device setup — same as India (`punchpay.in`, SN in Devices)

## Tenant-facing labels

UAE companies see **Annual subscription** and **Renewal due** in Settings (not one-time fee / AMC).
