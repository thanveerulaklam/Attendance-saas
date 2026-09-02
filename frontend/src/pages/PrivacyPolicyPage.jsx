import { Link } from 'react-router-dom';
import { useSeo } from './tools/ToolPageLayout';

export default function PrivacyPolicyPage() {
  useSeo(
    'Privacy Policy | PunchPay',
    'How PunchPay collects, uses, and stores attendance and payroll data for businesses using the web app and PunchPay Admin mobile app.'
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-xl font-extrabold text-slate-900">
            PunchPay
          </Link>
          <Link to="/login" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
            Login
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-10 space-y-8 text-sm leading-6 text-slate-700">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
          <p className="mt-2 text-slate-500">Last updated: 1 September 2026</p>
        </div>

        <p>
          PunchPay is an attendance and payroll product operated by MZone Technologies
          (&quot;PunchPay&quot;, &quot;we&quot;, &quot;us&quot;). This policy explains what we collect when you use
          punchpay.in, the PunchPay Admin mobile app, and related office kiosk software.
        </p>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Who this is for</h2>
          <p>
            PunchPay is a business product. Company admins and HR users sign in to manage their
            organization&apos;s employees, attendance, and payroll. Employees may punch attendance
            through company devices or kiosks configured by their employer.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Information we collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Account details: name, email, hashed password, and role (admin, HR, or employee).</li>
            <li>Company profile: business name, contact details, branches, shifts, and subscription status.</li>
            <li>Attendance records: punch in/out times, device or kiosk identifiers, and related work-hour calculations.</li>
            <li>Payroll data that the company chooses to store, such as salary components, advances, and payment records.</li>
            <li>On the PunchPay Admin app: a login token stored securely on the device so you stay signed in.</li>
            <li>Technical logs needed to operate the service, such as IP address, timestamps, and error reports.</li>
          </ul>
          <p>
            The PunchPay Admin mobile app does not use the camera, microphone, or location.
            Face enrollment and kiosk attendance, when enabled by a company, are handled by the
            separate PunchPay Kiosk app.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">How we use information</h2>
          <p>We use this information only to provide PunchPay: authentication, attendance, payroll, support, billing, and product security. We do not sell personal data.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Sharing</h2>
          <p>
            Data stays within the customer&apos;s company account. We may share information with
            infrastructure providers that host PunchPay, or when required by law. Company admins
            control which HR users can see their organization&apos;s records.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Retention</h2>
          <p>
            We keep account and attendance data for as long as the company subscription is active
            and as needed for payroll, legal, or security purposes. Admins can request deletion of
            a company account by contacting us.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Security</h2>
          <p>
            Passwords are hashed. API access uses a time-limited login token. The Admin app stores
            that token in the device&apos;s secure storage. You should sign out on shared phones.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Your choices</h2>
          <p>
            Admins and HR users can sign out of the mobile app at any time. To correct or delete
            company data, use the PunchPay website or email us. App Store users can also request
            account deletion by contacting the email below.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Children</h2>
          <p>PunchPay is not directed at children under 16 and is intended for workplace use by businesses.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Contact</h2>
          <p>
            MZone Technologies<br />
            Email: <a className="text-blue-700 underline" href="mailto:info@mzonetechnologies.com">info@mzonetechnologies.com</a><br />
            Web: <a className="text-blue-700 underline" href="https://punchpay.in">punchpay.in</a>
          </p>
        </section>
      </main>
    </div>
  );
}
