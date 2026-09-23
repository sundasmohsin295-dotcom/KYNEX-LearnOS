import { PublicShell, LegalSection, BackToApp } from "@/components/PublicShell";

export default function Terms() {
  return (
    <PublicShell
      title="Terms of Service"
      path="/terms"
      description="The agreement that governs your KYNEX account, acceptable academic use, and the limits of our liability."
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        Last updated: September 23, 2026. By creating a KYNEX account you agree to these terms.
        Please read them, especially the disclaimers in sections 4 and 6.
      </p>

      <LegalSection heading="1. Your account">
        <p>
          You must provide accurate sign-in information and are responsible for keeping your
          credentials and sessions secure. You may revoke any active session at any time from the
          Security page. You are responsible for activity that happens under your account. KYNEX
          offers guest and free tiers; paid tiers, where offered, are described on the plan page
          before purchase and can be cancelled there.
        </p>
      </LegalSection>

      <LegalSection heading="2. Your content">
        <p>
          You keep all rights to the materials you upload and the academic data you enter. You
          grant KYNEX the limited right to process that content to provide the service: extracting
          text, building your knowledge structures, generating practice and evaluations, and
          displaying your own analytics back to you. We do not use your content to advertise to
          others and we do not sell it.
        </p>
      </LegalSection>

      <LegalSection heading="3. Acceptable academic use">
        <p>
          KYNEX is a learning tool. You agree not to use it to cheat. Concretely: do not submit
          KYNEX-generated answers as your own work where your institution prohibits it, do not use
          the Examiner's provisional marks as official results, and do not upload materials you
          have no right to use, such as copyrighted textbooks you do not own or restricted exam
          papers. Do not attempt to access other students' data, probe the platform for
          vulnerabilities without authorization, or abuse the service through automated load,
          scraping, or attempts to bypass quotas and rate limits.
        </p>
      </LegalSection>

      <LegalSection heading="4. No fabrication, no guarantees of academic outcomes">
        <p>
          KYNEX is built to refuse inventing facts: when your question falls outside your uploaded
          material, the Professor says so. AI explanations, analysis, exam predictions and
          readiness estimates are generated assistance, not authoritative sources. You remain
          responsible for verifying anything you rely on for coursework or exams. KYNEX makes no
          guarantee of any grade outcome, exam result, or academic performance improvement.
          Where a mark or projection is shown, it is a modelled estimate and is labelled as such.
        </p>
      </LegalSection>

      <LegalSection heading="5. Availability and changes">
        <p>
          We work to keep the service reliable, and we monitor it with real telemetry rather than
          optimistic status pages, but we do not promise uninterrupted or error-free operation.
          Features, models and limits change as the product evolves. If a change is material, we
          will surface it in the product or by email before it affects you.
        </p>
      </LegalSection>

      <LegalSection heading="6. Limitation of liability">
        <p>
          To the maximum extent permitted by law, KYNEX is provided "as is" and "as available",
          and KYNEX's operators will not be liable for indirect, incidental, special,
          consequential or punitive damages, nor for lost grades, lost academic opportunities,
          lost data, or lost profits arising from your use of or inability to use the service.
          Your exclusive remedy for any claim relating to the service is to stop using it. If a
          paid subscription is involved, remedies are limited to the fees you paid for the
          current billing period. Nothing in these terms limits liability that cannot be limited
          by law.
        </p>
      </LegalSection>

      <LegalSection heading="7. Termination">
        <p>
          You may stop using KYNEX and delete your account content at any time. We may suspend or
          terminate accounts that violate these terms, notably sections 3, or that create security
          risk or unfair load for other students. Where practical, we will tell you why.
        </p>
      </LegalSection>

      <LegalSection heading="8. Governing terms">
        <p>
          These terms, together with the Privacy Policy, form the whole agreement between you and
          KYNEX regarding the service. If any provision is found unenforceable, the rest remains
          in force.
        </p>
      </LegalSection>

      <BackToApp />
    </PublicShell>
  );
}
