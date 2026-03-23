import { useEffect, useMemo, useState } from 'react';
import ToolPageLayout, { formatCurrency, useSeo } from './ToolPageLayout';

export default function PFESICalculator() {
  useSeo(
    'PF and ESI Calculator India 2025 | Free | PunchPay',
    'Calculate PF and ESI deductions instantly. Employee and employer contribution calculator for Indian businesses.'
  );

  const [basic, setBasic] = useState(15000);
  const [gross, setGross] = useState(15000);
  const [employees, setEmployees] = useState(10);
  const [isGrossTouched, setIsGrossTouched] = useState(false);

  useEffect(() => {
    if (!isGrossTouched) {
      setGross(basic);
    }
  }, [basic, isGrossTouched]);

  const computed = useMemo(() => {
    const basicValue = Math.max(Number(basic) || 0, 0);
    const grossValue = Math.max(Number(gross) || 0, 0);
    const count = Math.max(Number(employees) || 0, 0);

    const pfBase = Math.min(basicValue, 15000);
    const employeePf = pfBase * 0.12;
    const employerPf = pfBase * 0.13;
    const esiEligible = grossValue <= 21000;
    const employeeEsi = esiEligible ? grossValue * 0.0075 : 0;
    const employerEsi = esiEligible ? grossValue * 0.0325 : 0;

    const totalPfLiability = (employeePf + employerPf) * count;
    const totalEsiLiability = (employeeEsi + employerEsi) * count;
    const totalCompliance = totalPfLiability + totalEsiLiability;

    return {
      employeePf,
      employerPf,
      employeeEsi,
      employerEsi,
      totalPfLiability,
      totalEsiLiability,
      totalCompliance,
      esiEligible,
    };
  }, [basic, gross, employees]);

  return (
    <ToolPageLayout toolName="PF ESI Calculator">
      <h1 className="text-2xl font-bold md:text-3xl">PF and ESI Calculator India 2025</h1>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Basic Salary (₹)</span>
            <input
              type="number"
              min="0"
              value={basic}
              onChange={(e) => setBasic(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Gross Salary (₹)</span>
            <input
              type="number"
              min="0"
              value={gross}
              onChange={(e) => {
                setIsGrossTouched(true);
                setGross(e.target.value);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Number of employees</span>
            <input
              type="number"
              min="1"
              value={employees}
              onChange={(e) => setEmployees(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            <p>ESI applicable only when gross ≤ ₹21,000/month.</p>
            <p className="mt-1">PF applicable on first ₹15,000 of basic salary.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold tracking-wide text-slate-700">PER EMPLOYEE</h2>
            <div className="mt-3 space-y-2 text-sm">
              <Row label="Employee PF" value={computed.employeePf} />
              <Row label="Employer PF" value={computed.employerPf} />
              <Row label="Employee ESI" value={computed.employeeEsi} />
              <Row label="Employer ESI" value={computed.employerEsi} />
            </div>
            {!computed.esiEligible && (
              <p className="mt-3 text-xs text-slate-500">ESI is shown as ₹0 because gross salary is above ₹21,000.</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold tracking-wide text-slate-700">TOTAL FOR ALL EMPLOYEES</h2>
            <div className="mt-3 space-y-2 text-sm">
              <Row label="Total PF liability" value={computed.totalPfLiability} />
              <Row label="Total ESI liability" value={computed.totalEsiLiability} />
              <Row label="Total statutory compliance cost" value={computed.totalCompliance} strong />
            </div>
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
