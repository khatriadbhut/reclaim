import { legalPath } from "../legalNav.js";
import LegalLayout, { LEGAL_LAST_UPDATED } from "./LegalLayout.jsx";

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <p className="muted">
        These Terms of Service (&quot;Terms&quot;) govern your use of Reclaim&apos;s Chrome extension, web dashboards,
        and related services (collectively, the &quot;Service&quot;). By installing the extension, creating an account,
        or using the Service, you agree to these Terms.
      </p>

      <h2>1. The service</h2>
      <p>
        Reclaim provides an <strong>opt-in</strong> program that may collect browsing-related signals through a browser
        extension, combine them with profile information you provide, and use that information to operate the
        Service — including displaying modeled or estimated value in your dashboard and, where described in our{" "}
        <a href={legalPath("/privacy")}>Privacy Policy</a>
        , preparing anonymized or aggregated outputs for business customers. <strong>Cash payouts</strong> or on-chain
        settlement may be offered in the future; until then, any earnings shown are <strong>modeled or illustrative</strong>,
        not a guarantee of payment.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        You must be old enough to enter a binding contract where you live and have authority to agree to these Terms.
        If you use the Service on behalf of an organization, you represent that you have authority to bind that
        organization.
      </p>

      <h2>3. Accounts &amp; sign-in</h2>
      <p>
        We may use <strong>Google Sign-In</strong> (or other providers we add) to authenticate you. You agree to provide
        accurate information and to keep your account secure. Your <strong>name and email</strong> are used to operate
        your account (e.g. linking devices, support, and future payouts as described in our policies). As stated in
        onboarding and our Privacy Policy, your <strong>legal identity is not sold</strong> to buyers as part of
        audience packages.
      </p>

      <h2>4. Consent &amp; the data program</h2>
      <p>
        The extension collects categories of data disclosed during <strong>in-app onboarding</strong> (for example:
        domains visited, time on site, inferred categories, page signals such as brands, prices, or search queries where
        available, demographics you submit, and approximate location). You agree not to use the Service in a way that
        circumvents disclosure or interferes with collection after you have opted in. You may stop participation by{" "}
        <strong>removing the extension</strong> and, if you wish, asking us to delete account data as described in the
        Privacy Policy.
      </p>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Violate applicable law or third-party rights.</li>
        <li>Attempt to reverse engineer, scrape, or overload our systems; probe for vulnerabilities; or access data that is not yours.</li>
        <li>Misrepresent your identity, automate fraudulent installs, or abuse referral or incentive mechanics we may offer.</li>
        <li>Use the Service to distribute malware or interfere with other users&apos; devices.</li>
      </ul>
      <p>We may suspend or terminate access for violations or risk to the Service or other users.</p>

      <h2>6. Intellectual property</h2>
      <p>
        The Service, branding, and software are owned by Reclaim or its licensors. We grant you a limited, revocable,
        non-exclusive license to use the extension and dashboards for personal, non-commercial use in line with these
        Terms. You retain ownership of content you provide; you grant us the rights necessary to operate the Service as
        described in the Privacy Policy.
      </p>

      <h2>7. Disclaimers</h2>
      <p>
        The Service is provided <strong>&quot;as is&quot;</strong> without warranties of any kind, to the fullest extent
        permitted by law. We do not warrant uninterrupted or error-free operation. <strong>Modeled earnings</strong>{" "}
        are estimates only and depend on market demand, data quality, and product rules; they are not a promise of income.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Reclaim and its suppliers will not be liable for indirect, incidental,
        special, consequential, or punitive damages, or loss of profits, data, or goodwill. Our aggregate liability for
        claims relating to the Service is limited to the greater of (a) amounts you paid us in the twelve months before
        the claim (if any) or (b) fifty U.S. dollars (US$50), unless applicable law requires otherwise.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may modify the Service or these Terms. We will provide notice as appropriate (for example, in-product message,
        email, or updated &quot;Last updated&quot; date). Continued use after changes become effective constitutes
        acceptance, except where law requires explicit consent.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These Terms are governed by the laws of the jurisdiction in which Reclaim operates, without regard to conflict
        of law rules, except where mandatory consumer protections in your country apply.
      </p>

      <h2>11. Contact</h2>
      <p>
        For questions about these Terms, contact us using the support channel published on the Reclaim website or Chrome
        Web Store listing. (Replace this sentence with your legal contact email when you have one.)
      </p>

      <p className="muted" style={{ marginTop: "28px" }}>
        These Terms are provided for your product as of {LEGAL_LAST_UPDATED}. They are not a substitute for legal advice;
        have qualified counsel review them before a public launch, especially if you operate in the EU, UK, or California.
      </p>
    </LegalLayout>
  );
}
