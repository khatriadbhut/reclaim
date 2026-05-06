import { legalPath } from "../legalNav.js";
import LegalLayout, { LEGAL_LAST_UPDATED } from "./LegalLayout.jsx";

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p className="muted">
        This Privacy Policy explains how Reclaim (&quot;we,&quot; &quot;us&quot;) collects, uses, and shares information
        when you use our Chrome extension, web dashboards, and related services (the &quot;Service&quot;). It should be
        read together with our{" "}
        <a href={legalPath("/terms")}>Terms of Service</a>
        .
      </p>

      <h2>1. Information we collect</h2>
      <p>Depending on how you use the Service, we may collect:</p>
      <ul>
        <li>
          <strong>Account &amp; authentication.</strong> When you sign in with Google (or another provider we
          support), we receive identifiers and profile details such as your <strong>name, email address,</strong> and
          profile image URL as permitted by that provider. We use these to operate your account and link your data across
          devices.
        </li>
        <li>
          <strong>Browsing signals (extension).</strong> Subject to in-product onboarding and your consent, the extension
          may process information about pages you visit, including <strong>domain</strong>, <strong>time spent</strong>,
          inferred <strong>category</strong>, and derived <strong>page signals</strong> such as brands, products, price
          cues, search queries where detectable, scroll depth, and similar metadata. We do not need your legal name for
          these signals; they are tied to your account using technical and pseudonymous identifiers.
        </li>
        <li>
          <strong>Profile &amp; demographics.</strong> Information you provide during onboarding or in the dashboard,
          such as <strong>age range, gender, and occupation</strong>.
        </li>
        <li>
          <strong>Approximate location.</strong> <strong>City-level</strong> location derived from device GPS if you
          grant permission, or from <strong>IP-based</strong> estimation if you do not. We do not use this for
          street-level tracking in the product experience described in onboarding.
        </li>
        <li>
          <strong>Technical &amp; operational data.</strong> Logs, diagnostics, timestamps, and security-related
          information needed to run the Service and prevent abuse.
        </li>
      </ul>

      <h2>2. How we use information</h2>
      <p>We use the information above to:</p>
      <ul>
        <li>Provide, secure, and improve the Service (including sync, dashboards, and modeled value displays).</li>
        <li>Build <strong>anonymized or aggregated audience segments</strong> for analytics, market research, and advertising-related use cases by business customers.</li>
        <li>Communicate with you about the Service, compliance, or safety.</li>
        <li>Comply with law and enforce our Terms.</li>
      </ul>
      <p>
        <strong>We do not sell your real name, email address, or raw IP address</strong> to buyers as part of packaged
        audience segments. Buyers receive outputs that are designed to be <strong>privacy-safe and non-identifying</strong>{" "}
        relative to those fields, as described in onboarding. (Statutory definitions of &quot;sale&quot; or
        &quot;sharing&quot; vary by region; if you are in California or another jurisdiction with specific rights, see
        Section 7.)
      </p>

      <h2>3. Legal bases (EEA / UK users)</h2>
      <p>
        If data protection law in your region requires a &quot;legal basis,&quot; we rely on <strong>contract</strong>{" "}
        (to provide the Service), <strong>legitimate interests</strong> (to secure and improve the product, and to
        commercialize aggregated insights in line with your consent), and <strong>consent</strong> where we explicitly
        ask for it (for example, during extension onboarding or optional permissions).
      </p>

      <h2>4. Third-party services</h2>
      <p>The Service may integrate with providers such as:</p>
      <ul>
        <li>
          <strong>Google</strong> for sign-in and account profile (subject to Google&apos;s policies).
        </li>
        <li>
          <strong>Location / network APIs</strong> used to resolve city-level location (for example, IP geolocation or
          reverse geocoding services), as implemented in our extension.
        </li>
        <li>
          <strong>Hosting, analytics, or security vendors</strong> we use to operate the backend and dashboards.
        </li>
      </ul>
      <p>
        Those providers process information under their terms and our agreements with them. We do not list every
        subprocess or subprocessor here; we will update this policy as our stack stabilizes for production.
      </p>

      <h2>5. Retention</h2>
      <p>
        We retain information for as long as your account is active and as needed to provide the Service, comply with
        law, resolve disputes, and enforce our agreements. Aggregated or de-identified data may be retained longer.
        Specific retention windows may vary by data category and will be aligned with our production data architecture.
      </p>

      <h2>6. Security</h2>
      <p>
        We use administrative, technical, and organizational measures designed to protect information. No method of
        transmission or storage is 100% secure; we encourage you to use a strong, unique account and keep your device
        updated.
      </p>

      <h2>7. Your choices &amp; rights</h2>
      <p>Depending on where you live, you may have rights to:</p>
      <ul>
        <li>Access, correct, or delete certain personal information.</li>
        <li>Object to or restrict certain processing.</li>
        <li>Withdraw consent where processing is consent-based.</li>
        <li>Lodge a complaint with a supervisory authority (EEA/UK).</li>
        <li>Opt out of certain disclosures that qualify as &quot;sale&quot; or &quot;sharing&quot; under U.S. state laws, where applicable.</li>
      </ul>
      <p>
        You can stop many forms of collection by <strong>removing the extension</strong> and discontinuing use of the
        Service. To exercise other rights, contact us using the support channel published on our website or store
        listing (add a dedicated privacy request inbox before production if required in your jurisdictions).
      </p>

      <h2>8. Children</h2>
      <p>
        The Service is not directed at children under the age where parental consent is required in your region. If you
        believe we have collected a child&apos;s information improperly, contact us and we will take appropriate steps.
      </p>

      <h2>9. International transfers</h2>
      <p>
        We may process information in countries other than where you live. Where required, we use appropriate safeguards
        (such as standard contractual clauses) for cross-border transfers.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        We will update this Privacy Policy from time to time. We will post the new version here and revise the
        &quot;Last updated&quot; date. If changes are material, we will provide additional notice as appropriate.
      </p>

      <h2>11. Contact</h2>
      <p>
        For privacy questions or requests, contact us using the channel published on the Reclaim website or Chrome Web
        Store listing. (Add a privacy-specific email before production if you operate in regulated regions.)
      </p>

      <p className="muted" style={{ marginTop: "28px" }}>
        This policy reflects the Service as understood on {LEGAL_LAST_UPDATED}. Have qualified privacy counsel review it
        before launch, especially for GDPR, UK GDPR, CPRA, and Chrome Web Store requirements.
      </p>
    </LegalLayout>
  );
}
