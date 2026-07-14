export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-200">
      <header className="border-b border-slate-700 bg-slate-900/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-4.724A1 1 0 013 14.382V5a1 1 0 011-1h5m0 16v-5a1 1 0 011-1h4a1 1 0 011 1v5m0 0h5a1 1 0 001-1V5a1 1 0 00-1-1h-5m-4 0V3a1 1 0 011-1h2a1 1 0 011 1v1m-4 0h4" />
              </svg>
            </div>
            <span className="font-bold text-white text-lg">RxRouteOptimizer</span>
          </div>
          <a
            href="/"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            ← Back to App
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-slate-400 mb-10">
          Effective Date: June 7, 2026 &nbsp;·&nbsp; Last Updated: June 7, 2026
        </p>

        <div className="space-y-10 text-slate-300 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Overview</h2>
            <p>
              RxRouteOptimizer ("we," "our," or "us") operates a delivery management
              platform designed for licensed pharmacies. This Privacy Policy explains how
              we collect, use, disclose, and protect information when you use our web
              application at <strong className="text-white">rxrouteoptimizer.com</strong>.
            </p>
            <p className="mt-3">
              Because our platform is used by pharmacies to coordinate prescription
              deliveries, we handle information that may be considered Protected Health
              Information (PHI) under the Health Insurance Portability and
              Accountability Act (HIPAA). We take that responsibility seriously.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Information We Collect</h2>
            <h3 className="text-base font-medium text-slate-100 mb-2">Account &amp; Operational Data</h3>
            <ul className="list-disc list-inside space-y-1 text-slate-300 ml-2">
              <li>Usernames, hashed passwords, and role assignments (admin, dispatcher, driver)</li>
              <li>Pharmacy names, addresses, phone numbers, and email addresses</li>
              <li>Driver names, contact numbers, and real-time GPS location data (while on duty)</li>
              <li>Delivery batch details, route plans, and stop sequences</li>
            </ul>

            <h3 className="text-base font-medium text-slate-100 mt-5 mb-2">Delivery &amp; Patient Data</h3>
            <ul className="list-disc list-inside space-y-1 text-slate-300 ml-2">
              <li>Patient delivery addresses and recipient names</li>
              <li>Prescription (Rx) numbers and fill dates uploaded by pharmacy staff</li>
              <li>Delivery status updates and completion timestamps</li>
              <li>Delivery proof: signatures and photographs captured at point of delivery</li>
            </ul>

            <h3 className="text-base font-medium text-slate-100 mt-5 mb-2">Usage &amp; Technical Data</h3>
            <ul className="list-disc list-inside space-y-1 text-slate-300 ml-2">
              <li>Session identifiers and authentication tokens</li>
              <li>API request logs and audit trail entries</li>
              <li>Browser type, device type, and IP address</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>To plan, optimize, and track prescription delivery routes</li>
              <li>To provide real-time driver location visibility to authorized pharmacy staff</li>
              <li>To generate delivery confirmations, proof-of-delivery records, and reports</li>
              <li>To enforce role-based access and maintain audit logs for compliance purposes</li>
              <li>To improve platform reliability, diagnose technical issues, and enhance features</li>
              <li>To send billing invoices to pharmacy accounts</li>
            </ul>
            <p className="mt-3">
              We do not sell patient data, Rx data, or any personally identifiable
              information to third parties. We do not use patient data for advertising.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. HIPAA Compliance</h2>
            <p>
              RxRouteOptimizer acts as a <strong className="text-white">Business Associate</strong> to
              licensed pharmacies (Covered Entities) under HIPAA. We enter into a
              Business Associate Agreement (BAA) with each pharmacy that uses our
              platform. Our safeguards include:
            </p>
            <ul className="list-disc list-inside space-y-2 mt-3 ml-2">
              <li>Encryption of data in transit (TLS) and at rest</li>
              <li>Role-based access control limiting data visibility to authorized users</li>
              <li>Audit logging of all access to patient delivery records</li>
              <li>Automatic session timeouts and secure credential storage</li>
              <li>Minimum necessary data principle — we collect only what is required for delivery operations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Data Sharing &amp; Third-Party Services</h2>
            <p>We use the following third-party services to operate the platform:</p>
            <ul className="list-disc list-inside space-y-2 mt-3 ml-2">
              <li>
                <strong className="text-slate-100">Google Maps Platform</strong> — used for
                address geocoding and route optimization. Delivery addresses are transmitted
                to Google only for these purposes and are governed by Google's privacy policy.
              </li>
              <li>
                <strong className="text-slate-100">OpenStreetMap / Nominatim</strong> — used
                as a fallback geocoding service for map navigation searches.
              </li>
              <li>
                <strong className="text-slate-100">Replit (cloud infrastructure)</strong> — our
                platform is hosted on Replit's infrastructure. Data is stored in a
                PostgreSQL database and object storage within our Replit environment.
              </li>
            </ul>
            <p className="mt-3">
              We do not share PHI with any third party beyond what is necessary to
              perform delivery operations, and only under an appropriate data processing
              agreement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Data Retention</h2>
            <p>
              Delivery records, audit logs, and proof-of-delivery files are retained for
              a minimum of <strong className="text-white">six (6) years</strong> from the
              date of creation, in line with HIPAA record retention requirements. Pharmacy
              accounts and associated data are retained for the duration of the customer
              relationship and for the required period thereafter.
            </p>
            <p className="mt-3">
              Driver GPS location data is retained only while a delivery session is
              active and is not stored long-term beyond what is included in route logs.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Your Rights</h2>
            <p>
              Pharmacy administrators may request access to, correction of, or deletion
              of their account data by contacting us. For requests involving patient PHI,
              those rights are exercised through the patient's pharmacy (the Covered
              Entity), not directly through RxRouteOptimizer.
            </p>
            <p className="mt-3">
              Drivers may request deletion of their account and associated personal
              information by contacting their pharmacy administrator or reaching us
              directly at the address below.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Security</h2>
            <p>
              We implement industry-standard security measures including HTTPS
              encryption, bcrypt password hashing, server-side session management, rate
              limiting on authentication endpoints, and input validation throughout the
              application. No system is completely secure; in the event of a data breach
              involving PHI, we will notify affected Covered Entities as required by the
              HIPAA Breach Notification Rule.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Children's Privacy</h2>
            <p>
              RxRouteOptimizer is a business-to-business platform intended solely for
              use by pharmacy staff, dispatchers, and drivers. It is not directed at
              children under 13, and we do not knowingly collect personal information
              from children.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. When we do, we will
              update the "Last Updated" date at the top of this page and, for material
              changes, notify pharmacy administrators via email or an in-app notice.
              Continued use of the platform after changes are posted constitutes
              acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">11. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy or our data practices,
              please contact us:
            </p>
            <div className="mt-3 bg-slate-800/60 border border-slate-700 rounded-lg px-5 py-4 space-y-1 text-slate-300">
              <p className="font-medium text-white">RxRouteOptimizer</p>
              <p>Website: <a href="https://rxrouteoptimizer.com" className="text-blue-400 hover:underline">rxrouteoptimizer.com</a></p>
            </div>
          </section>

        </div>

        <div className="mt-16 pt-8 border-t border-slate-700 text-slate-500 text-sm">
          © {new Date().getFullYear()} RxRouteOptimizer. All rights reserved.
        </div>
      </main>
    </div>
  );
}
