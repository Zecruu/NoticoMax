import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — NOTICO MAX",
  description: "How NOTICO MAX collects, uses, and protects your data.",
};

const LAST_UPDATED = "May 8, 2026";

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <section className="mt-8 space-y-4 text-sm leading-relaxed">
        <p>
          Nexulon LLC (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates NOTICO MAX
          (the &ldquo;App&rdquo;) on iOS, macOS, Windows, and the web. This
          policy explains what data we collect, how we use it, and the choices
          you have.
        </p>

        <h2 className="text-xl font-semibold mt-8">1. Data We Collect</h2>

        <h3 className="text-base font-semibold mt-4">Account Information</h3>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Email address</strong> — used to create and authenticate your account.</li>
          <li><strong>Password</strong> — stored only as a salted hash; we never see your plaintext password.</li>
          <li><strong>Apple user identifier</strong> — when you Sign in with Apple, we store the opaque user ID Apple provides so we can match returning sign-ins.</li>
        </ul>

        <h3 className="text-base font-semibold mt-4">User Content</h3>
        <ul className="list-disc pl-6 space-y-1">
          <li>Notes, URLs, reminders, folders, tags, study sets, passwords, and environment variables you create.</li>
          <li>Custom device names you assign so you can identify your devices across the app.</li>
        </ul>

        <h3 className="text-base font-semibold mt-4">Purchase Information</h3>
        <ul className="list-disc pl-6 space-y-1">
          <li>Subscription status and renewal dates for NOTICO MAX Pro, processed by Apple and provided to us by RevenueCat for receipt validation.</li>
          <li>We never receive your full payment information; that is handled entirely by Apple.</li>
        </ul>

        <h3 className="text-base font-semibold mt-4">Advertising and Tracking (free tier only)</h3>
        <ul className="list-disc pl-6 space-y-1">
          <li>If you use the free tier, we display ads from Google AdMob.</li>
          <li>On iOS, we ask for your permission via the App Tracking Transparency prompt before AdMob can use your Identifier for Advertisers (IDFA) for personalized ads. If you decline, you still see ads, but they are non-personalized.</li>
          <li>NOTICO MAX Pro removes all ads and any associated tracking.</li>
        </ul>

        <h3 className="text-base font-semibold mt-4">Diagnostic Data</h3>
        <ul className="list-disc pl-6 space-y-1">
          <li>Crash reports and basic performance metrics may be collected to fix bugs and improve stability.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-8">2. How We Use Your Data</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>To provide, maintain, and sync the App across your devices.</li>
          <li>To authenticate you and protect your account.</li>
          <li>To process your subscription and grant access to Pro features.</li>
          <li>To display ads and measure their effectiveness in the free tier.</li>
          <li>To diagnose and fix crashes or other issues.</li>
        </ul>
        <p>
          We do not sell your personal data, and we do not share your notes,
          reminders, passwords, or other user content with any third party for
          advertising.
        </p>

        <h2 className="text-xl font-semibold mt-8">3. Service Providers</h2>
        <p>We share data with the following processors strictly for the purposes listed:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>MongoDB Atlas</strong> — encrypted database hosting.</li>
          <li><strong>Railway</strong> — application hosting.</li>
          <li><strong>Apple</strong> — Sign in with Apple, In-App Purchases, push notifications.</li>
          <li><strong>RevenueCat</strong> — subscription receipt validation.</li>
          <li><strong>Google AdMob</strong> — ad serving for the free tier (with your consent on iOS).</li>
        </ul>

        <h2 className="text-xl font-semibold mt-8">4. Data Retention</h2>
        <p>
          We retain your account and content as long as your account exists. If
          you delete your account from inside the App (Settings → Delete
          Account), we permanently delete your account record and all
          associated cloud-synced content (notes, folders, reminders, skills,
          shared items) within 30 days. Subscription receipts may be retained
          longer where required for tax and accounting purposes.
        </p>

        <h2 className="text-xl font-semibold mt-8">5. Account Deletion</h2>
        <p>
          You can permanently delete your account at any time from inside the
          App: <strong>Settings → Delete Account</strong>. The flow requires
          you to confirm by typing DELETE and re-entering your password (or
          confirming through Sign in with Apple). After confirmation, your
          server-side data is removed and you are signed out everywhere. If
          you have an active subscription, cancel it from your App Store
          account settings before deleting — deleting your account here does
          not cancel App Store billing.
        </p>

        <h2 className="text-xl font-semibold mt-8">6. Security</h2>
        <p>
          All traffic between your device and our servers is encrypted using
          HTTPS/TLS. Passwords are hashed using PBKDF2 with a per-user salt.
          Subscription tokens and API keys are never logged.
        </p>

        <h2 className="text-xl font-semibold mt-8">7. Children</h2>
        <p>
          NOTICO MAX is not directed to children under 13. We do not knowingly
          collect data from children. If you believe a child has provided us
          with personal data, contact us and we will delete it.
        </p>

        <h2 className="text-xl font-semibold mt-8">8. Your Rights</h2>
        <p>
          Depending on where you live, you may have the right to access,
          correct, export, or delete the personal data we hold about you. To
          exercise these rights, email us at{" "}
          <a href="mailto:nomnk5138@gmail.com" className="text-primary underline">
            nomnk5138@gmail.com
          </a>{" "}
          or use the Delete Account option inside the App.
        </p>

        <h2 className="text-xl font-semibold mt-8">9. Changes to This Policy</h2>
        <p>
          We may update this policy from time to time. The &ldquo;Last
          updated&rdquo; date at the top reflects the most recent change.
          Material changes will be communicated in the App or by email.
        </p>

        <h2 className="text-xl font-semibold mt-8">10. Contact</h2>
        <p>
          Nexulon LLC<br />
          Email:{" "}
          <a href="mailto:nomnk5138@gmail.com" className="text-primary underline">
            nomnk5138@gmail.com
          </a>
        </p>
      </section>
    </main>
  );
}
