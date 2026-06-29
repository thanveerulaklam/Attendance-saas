# International client onboarding (UAE)

## Billing model

| | India (`IN`) | UAE (`AE`) |
|--|--------------|------------|
| Setup fee | One-time (per plan) | **None** |
| Recurring | Annual AMC | **Annual subscription only** |
| Tax note | excl. GST | excl. VAT (5%) |

UAE plan tiers match India (same `plan_code` and employee caps). Amounts are in **AED/year** — see `frontend/src/constants/pricingPlans.js` → `PRICING_PLANS_AE`.

## SuperAdmin setup

1. Create company → **Country = United Arab Emirates**
2. Pick plan — dropdown shows yearly AED price (no OTC/AMC split)
3. Set access window (start + end dates)
4. ADMS device setup — same as India (`punchpay.in`, SN in Devices)

## Tenant-facing labels

UAE companies see **Annual subscription** and **Renewal due** in Settings (not one-time fee / AMC).
