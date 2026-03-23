import { Link } from 'react-router-dom';
import ToolPageLayout, { useSeo } from './ToolPageLayout';

const tools = [
  {
    name: 'Take-Home Salary Calculator',
    description: 'Calculate in-hand salary after PF, ESI, and TDS in seconds.',
    path: '/tools/salary-calculator',
  },
  {
    name: 'PF + ESI Calculator',
    description: 'Instantly compute statutory deductions for employees and employers.',
    path: '/tools/pf-esi-calculator',
  },
  {
    name: 'Payslip Generator',
    description: 'Generate professional payslips and download them as PDF.',
    path: '/tools/payslip-generator',
  },
  {
    name: 'Manual Payroll Cost Calculator',
    description: 'See how much manual payroll processing is costing your business.',
    path: '/tools/payroll-cost-calculator',
  },
];

export default function ToolsHomePage() {
  useSeo(
    'Free HR & Payroll Tools for Indian Businesses | PunchPay',
    'Free HR and payroll calculators for Indian SMBs. Calculate salary, PF/ESI, generate payslips, and compare manual payroll costs.'
  );

  return (
    <ToolPageLayout toolName="Tools Home">
      <section className="mb-6">
        <h1 className="text-2xl font-bold md:text-3xl">Free HR & Payroll Calculators</h1>
        <p className="mt-2 text-slate-600">Built for Indian businesses. No signup required.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {tools.map((tool) => (
          <article key={tool.path} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">{tool.name}</h2>
            <p className="mt-2 text-sm text-slate-600">{tool.description}</p>
            <Link
              to={tool.path}
              className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Use Free Tool {'->'}
            </Link>
          </article>
        ))}
      </section>
    </ToolPageLayout>
  );
}
