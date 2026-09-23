import { PublicShell, LegalSection, BackToApp } from "@/components/PublicShell";

export default function Privacy() {
  return (
    <PublicShell
      title="Privacy Policy"
      path="/privacy"
      description="What KYNEX collects, why it is collected, how long it is kept, and the controls you have over your academic data."
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        Last updated: September 23, 2026. This policy explains how KYNEX ("KYNEX", "we") handles
        your data when you use the Academic Intelligence OS at kynex.app.
      </p>

      <LegalSection heading="1. What we collect">
        <p>
          <strong className="text-foreground">Account data.</strong> Your email address and display
          name, provided by you or your sign-in provider, used to create and secure your account.
          Authentication is handled server-side; sessions are stored in a dedicated server session
          table with expiration, and signing out revokes the session and its refresh tokens
          immediately.
        </p>
        <p>
          <strong className="text-foreground">Academic records.</strong> The subjects, courses,
          credit hours and grades you enter in the GPA Lab, plus your mastery scores, quiz answers,
          mistakes, recall-card reviews, study sessions, missions and goals. These exist only to
          power your own analytics and recommendations.
        </p>
        <p>
          <strong className="text-foreground">Uploaded materials.</strong> Documents, links, pasted
          text and other sources you add to your Vault, plus the extracted text and structured
          analysis (concepts, definitions, formulas, questions) generated from them. Your materials
          are treated strictly as data: they are never used to instruct the system and cannot
          override application rules.
        </p>
        <p>
          <strong className="text-foreground">AI conversations.</strong> Questions you ask the
          Professor and the responses it produces, so your chat history survives between sessions.
          You can delete any conversation, which removes its messages permanently.
        </p>
        <p>
          <strong className="text-foreground">Operational telemetry.</strong> Technical reliability
          signals such as provider latency samples, circuit-breaker state changes, sanitized client
          crash reports (message, route, correlation ID; never stack traces) and rate-limit events.
          Telemetry contains no user content and is not exposed through any public query.
        </p>
      </LegalSection>

      <LegalSection heading="2. What we never collect">
        <p>
          No advertising identifiers. No cross-site trackers. No behavioral profiles shared with
          third parties. No selling of personal or academic data. Client-side telemetry is limited
          to the sanitized error sink described above; there are no third-party analytics scripts.
        </p>
      </LegalSection>

      <LegalSection heading="3. How AI features use your data">
        <p>
          When you chat, generate a quiz, or request an exam evaluation, the relevant excerpts of
          your own materials, your question, and the conversation context are sent to the AI
          provider to produce a response. Requests are scoped to your account and include only the
          minimum material needed. Two hard rules apply everywhere:
        </p>
        <p>
          <strong className="text-foreground">Grounding.</strong> The Professor answers only from
          your uploaded material and flags the answer's source. If your question falls outside the
          material, it says so explicitly instead of inventing facts.
        </p>
        <p>
          <strong className="text-foreground">Isolation.</strong> Uploaded documents are framed as
          untrusted data. Text inside a document cannot change system rules, override grading
          logic, or access another student's data.
        </p>
        <p>
          Provisional exam marks are rubric estimates, clearly labelled as such. They are never
          presented as official university grades.
        </p>
      </LegalSection>

      <LegalSection heading="4. Who can see your data">
        <p>
          Only you. Every query and mutation runs a server-side ownership check against your
          authenticated identity, so one account cannot read or write another account's materials,
          scores, mistakes, or conversations. Malformed or foreign identifiers return "not found"
          rather than confirming that a resource exists. Access-control denials are logged as
          security events without personal content.
        </p>
      </LegalSection>

      <LegalSection heading="5. Retention">
        <p>
          Your academic data and materials are retained for as long as your account is active
          because the product is useless without them. Deleting content removes it: deleting a
          conversation deletes its messages; deleting a material deletes its extracted text and
          flashcards, and the review history of those flashcards is removed with them so no orphaned
          evidence remains. Rate-limit and audit records are kept as minimal, content-free rows.
        </p>
      </LegalSection>

      <LegalSection heading="6. Your controls">
        <p>
          From the Security page you can review every active session and revoke any of them
          instantly. From within the product you can delete conversations, materials, and mistakes.
          If you want everything removed, delete your account content and stop using the service;
          contact paths for full erasure requests are provided in the product's plan and account
          screens.
        </p>
      </LegalSection>

      <LegalSection heading="7. Changes to this policy">
        <p>
          Material changes will be announced in the product before they take effect. The date at
          the top of this page reflects the latest revision.
        </p>
      </LegalSection>

      <BackToApp />
    </PublicShell>
  );
}
