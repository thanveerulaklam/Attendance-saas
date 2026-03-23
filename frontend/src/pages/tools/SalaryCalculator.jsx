import { useMemo, useState } from 'react';
import ToolPageLayout, { formatCurrency, useSeo } from './ToolPageLayout';

export default function SalaryCalculator() {
  useSeo(
    'Take-Home Salary Calculator India 2025 | Free | PunchPay',
    'Calculate exact in-hand salary after PF, ESI and TDS. Free salary calculator for Indian employees and employers.'
  );

  const [ctc, setCtc] = useState(50000);
  const [basicPercent, setBasicPercent] = useState(50);
  const [pfApplicable, setPfApplicable] = useState(true);
  const [esiOptIn, setEsiOptIn] = useState(false);
  const [tds, setTds] = useState(0);
  const [isMetro, setIsMetro] = useState(true);

  const values = useMemo(() => {
    const monthlyCtc = Math.max(Number(ctc) || 0, 0);
    const basic = monthlyCtc * (Number(basicPercent) / 100);
    const hra = basic * (isMetro ? 0.4 : 0.2);
    const gross = monthlyCtc;
    const esiApplicable = gross <= 21000 ? true : esiOptIn;

    const pfEmployee = pfApplicable ? basic * 0.12 : 0;
    const pfEmployer = pfApplicable ? basic * 0.13 : 0;
    const esiEmployee = esiApplicable ? gross * 0.0075 : 0;
    const esiEmployer = esiApplicable ? gross * 0.0325 : 0;
    const tdsValue = Math.max(Number(tds) || 0, 0);

    const totalDeductions = pfEmployee + esiEmployee + tdsValue;
    const takeHome = monthlyCtc - totalDeductions - pfEmployer - esiEmployer;
    const totalCompanyCost = monthlyCtc + pfEmployer + esiEmployer;

    return {
      monthlyCtc,
      basic,
      hra,
      pfEmployee,
      pfEmployer,
      esiEmployee,
      esiEmployer,
      tdsValue,
      totalDeductions,
      takeHome,
      totalCompanyCost,
      esiApplicable,
    };
  }, [ctc, basicPercent, pfApplicable, esiOptIn, tds, isMetro]);

  return (
    <ToolPageLayout toolName="Salary Calculator">
      <h1 className="text-2xl font-bold md:text-3xl">Take-Home Salary Calculator India 2025</h1>
      <p className="mt-2 text-sm text-slate-600">
        Calculate exact in-hand salary after PF, ESI, and TDS deductions in real time.
      </p>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Monthly CTC (₹)</span>
            <input
              type="number"
              min="0"
              value={ctc}
              onChange={(e) => setCtc(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Basic Salary % of CTC: {basicPercent}%</span>
            <input
              type="range"
              min="40"
              max="60"
              value={basicPercent}
              onChange={(e) => setBasicPercent(e.target.value)}
              className="w-full"
            />
          </label>

          <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <span className="text-sm font-medium">PF applicable?</span>
            <input type="checkbox" checked={pfApplicable} onChange={() => setPfApplicable((v) => !v)} />
          </label>

          <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <span className="text-sm font-medium">ESI applicable? {values.monthlyCtc <= 21000 ? '(Auto Yes)' : ''}</span>
            <input
              type="checkbox"
              checked={values.esiApplicable}
              disabled={values.monthlyCtc <= 21000}
              onChange={() => setEsiOptIn((v) => !v)}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Location</span>
            <select
              value={isMetro ? 'metro' : 'non-metro'}
              onChange={(e) => setIsMetro(e.target.value === 'metro')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="metro">Metro (HRA 40%)</option>
              <option value="non-metro">Non-metro (HRA 20%)</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">TDS monthly estimate (₹)</span>
            <input
              type="number"
              min="0"
              value={tds}
              onChange={(e) => setTds(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold tracking-wide text-slate-700">SALARY BREAKDOWN</h2>
          <div className="mt-3 space-y-2 text-sm">
            <Row label="Monthly CTC" value={values.monthlyCtc} />
            <Row label="Basic Salary" value={values.basic} />
            <Row label="HRA" value={values.hra} />
          </div>

          <h3 className="mt-5 border-t border-slate-200 pt-4 text-sm font-bold tracking-wide text-slate-700">DEDUCTIONS</h3>
          <div className="mt-2 space-y-2 text-sm">
            <Row label="PF (Employee 12%)" value={values.pfEmployee} />
            <Row label="ESI (Employee 0.75%)" value={values.esiEmployee} />
            <Row label="TDS (estimated)" value={values.tdsValue} />
          </div>

          <h3 className="mt-5 border-t border-slate-200 pt-4 text-sm font-bold tracking-wide text-slate-700">EMPLOYER COST</h3>
          <div className="mt-2 space-y-2 text-sm">
            <Row label="PF (Employer 13%)" value={values.pfEmployer} />
            <Row label="ESI (Employer 3.25%)" value={values.esiEmployer} />
          </div>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <Row label="TAKE-HOME SALARY" value={values.takeHome} strong />
            <Row label="TOTAL COST TO CO." value={values.totalCompanyCost} strong />
          </div>
        </div>
      </section>
    </ToolPageLayout>
  );
}

function Row({ label, value, strong = false }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? 'font-bold text-slate-900' : 'text-slate-600'}>{label}</span>
      <span className={strong ? 'font-bold text-slate-900' : 'font-semibold text-slate-900'}>{formatCurrency(value)}</span>
    </div>
  );
}
