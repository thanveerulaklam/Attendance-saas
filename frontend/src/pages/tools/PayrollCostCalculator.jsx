import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ToolPageLayout, { formatCurrency, useSeo } from './ToolPageLayout';

export default function PayrollCostCalculator() {
  useSeo(
    "Manual Payroll Cost Calculator | See What You're Losing | PunchPay",
    'Calculate how much manual payroll costs your business every month. See your ROI from switching to automated payroll.'
  );

  const [employees, setEmployees] = useState(25);
  const [hours, setHours] = useState(8);
  const [hrSalary, setHrSalary] = useState(25000);
  const [errors, setErrors] = useState(2);
  const [errorCost, setErrorCost] = useState(500);

  const data = useMemo(() => {
    const employeeCount = Math.max(Number(employees) || 0, 0);
    const hourValue = Math.max(Number(hours) || 0, 0);
    const salary = Math.max(Number(hrSalary) || 0, 0);
    const errorCount = Math.max(Number(errors) || 0, 0);
    const perError = Math.max(Number(errorCost) || 0, 0);

    const hourlyCost = salary / 160;
    const timeCost = hourValue * hourlyCost;
    const monthlyErrorCost = errorCount * perError;
    const monthlyManualCost = timeCost + monthlyErrorCost;
    const annualCost = monthlyManualCost * 12;
    const punchPayMonthly = employeeCount * 50;
    const savings = Math.max(monthlyManualCost - punchPayMonthly, 0);
    const paybackMonths = savings > 0 ? (punchPayMonthly / savings).toFixed(1) : 'N/A';

    const maxBar = Math.max(monthlyManualCost, punchPayMonthly, 1);
    const manualBar = (monthlyManualCost / maxBar) * 100;
    const punchPayBar = (punchPayMonthly / maxBar) * 100;

    return {
      timeCost,
      monthlyErrorCost,
      monthlyManualCost,
      annualCost,
      punchPayMonthly,
      savings,
      paybackMonths,
      manualBar,
      punchPayBar,
    };
  }, [employees, hours, hrSalary, errors, errorCost]);

  return (
    <ToolPageLayout toolName="Payroll Cost Calculator">
      <h1 className="text-2xl font-bold md:text-3xl">How Much Does Manual Payroll Cost Your Business?</h1>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SliderField label={`Number of employees: ${employees}`} min={1} max={500} value={employees} onChange={setEmployees} />
          <SliderField
            label={`Hours spent on payroll per month: ${hours}`}
            min={1}
            max={40}
            value={hours}
            onChange={setHours}
          />

          <label className="block">
            <span className="mb-1 block text-sm font-medium">HR/accountant monthly salary (₹)</span>
            <input
              type="number"
              value={hrSalary}
              onChange={(e) => setHrSalary(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <SliderField
            label={`Number of payroll errors per month: ${errors}`}
            min={0}
            max={10}
            value={errors}
            onChange={setErrors}
          />

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Average cost per error (₹)</span>
            <input
              type="number"
              value={errorCost}
              onChange={(e) => setErrorCost(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold tracking-wide text-slate-700">YOUR MANUAL PAYROLL COSTS YOU</h2>
            <p className="mt-3 text-3xl font-extrabold text-red-600">{formatCurrency(data.monthlyManualCost)} / month</p>
            <p className="text-lg font-semibold text-red-700">{formatCurrency(data.annualCost)} / year</p>

            <div className="mt-4 space-y-2 text-sm">
              <Row label="HR time cost" value={data.timeCost} />
              <Row label="Error corrections" value={data.monthlyErrorCost} />
              <Row label="PunchPay cost" value={data.punchPayMonthly} />
              <Row label="YOU SAVE" value={data.savings} strong />
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Payback period</span>
                <span className="font-bold text-slate-900">{data.paybackMonths} months</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold tracking-wide text-slate-700">Monthly Cost Comparison</h3>
            <div className="space-y-3 text-sm">
              <div>
                <div className="mb-1 flex justify-between">
                  <span>Manual payroll</span>
                  <span className="font-semibold">{formatCurrency(data.monthlyManualCost)}</span>
                </div>
                <div className="h-4 rounded bg-red-100">
                  <div className="h-4 rounded bg-red-500" style={{ width: `${data.manualBar}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between">
                  <span>PunchPay</span>
                  <span className="font-semibold">{formatCurrency(data.punchPayMonthly)}</span>
                </div>
                <div className="h-4 rounded bg-blue-100">
                  <div className="h-4 rounded bg-blue-600" style={{ width: `${data.punchPayBar}%` }} />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-blue-600 p-5 text-white">
            <p className="text-lg font-bold">Start saving {formatCurrency(data.savings)} every month</p>
            <Link
              to="/register"
              onClick={() => console.log('Tool conversion:', 'Payroll Cost Calculator')}
              className="mt-3 inline-flex rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700"
            >
              Try PunchPay Free {'->'}
            </Link>
          </div>
        </div>
      </section>
    </ToolPageLayout>
  );
}

function SliderField({ label, min, max, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full"
      />
    </label>
  );
}

function Row({ label, value, strong = false }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? 'font-bold text-slate-900' : 'text-slate-600'}>{label}</span>
      <span className={strong ? 'font-bold text-emerald-700' : 'font-semibold text-slate-900'}>{formatCurrency(value)}</span>
    </div>
  );
}
