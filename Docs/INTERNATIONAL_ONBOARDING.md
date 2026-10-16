# International client onboarding (UAE)

## Billing model

| | India (`IN`) | UAE (`AE`) |
|--|--------------|------------|
| Setup fee | One-time (legacy OTC) | **None** |
| Recurring | Yearly / 3-year (or legacy AMC) | **Yearly (`annual`) or 3-year (`triennial`) subscription** |
| Tax note | excl. GST | excl. VAT (5%) |

UAE plan tiers use the same `plan_code` values as India subscriptions (`micro` … `professional`). Amounts are in **AED** — see `frontend/src/constants/pricingPlans.js` → `PRICING_PLANS_AE`. These are the prices to the UAE partner (and for direct sales); the partner adds his own margin.

| Plan code | Employees | AED / year | AED / 3 years | AED / employee / month (1-yr · 3-yr) |
|-----------|-----------|-----------:|--------------:|-------------------------------------:|
| micro | Up to 5 | 299 | 699 | 4.98 · 3.88 |
| base | Up to 10 | 499 | 1,149 | 4.16 · 3.19 |
| starter | Up to 25 | 1,199 | 2,699 | 4.00 · 3.00 |
| growth | Up to 50 | 2,199 | 4,999 | 3.67 · 2.78 |
| business | Up to 100 | 3,999 | 8,999 | 3.33 · 2.50 |
| professional | Up to 200 | 6,999 | 15,999 | 2.92 · 2.22 |
| enterprise | 200+ | Custom | Custom | — |

All prices excl. 5% VAT.

## SuperAdmin setup

1. Create company → **Country = United Arab Emirates**
2. Pick **Billing type** (Yearly or 3-year package), then plan — dropdown shows the AED price for that term (no OTC/AMC split)
3. Access end defaults to start + 1 or 3 years (editable)
4. ADMS device setup — same as India (`punchpay.in`, SN in Devices)

## Tenant-facing labels

UAE companies see **Annual subscription** or **3-year subscription** and **Renewal due** in Settings (not one-time fee / AMC).
