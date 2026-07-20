import LegalLayout from './LegalLayout';

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      intro="Tefillah was built so the words you bring before God are kept sacred, not exploited. This policy explains, in plain language, what we collect, why, and what we will never do."
    >
      <h2>1. Information We Collect</h2>
      <p>
        We collect only what is needed to deliver your prayers and keep the
        platform safe and reliable:
      </p>
      <ul>
        <li>
          <strong>Account details</strong> — your name, email, phone number, and
          city. These let us verify your account, route prayers to a partner near
          you, and notify you when something needs your attention.
        </li>
        <li>
          <strong>Prayer content</strong> — the words you submit. This is the most
          sensitive thing we hold. It is encrypted in transit and stored only so we
          can deliver it to your assigned prayer partner and show it back to you in
          your history.
        </li>
        <li>
          <strong>Approximate location</strong> — used to assign your request to a
          prayer partner in your region.
        </li>
        <li>
          <strong>Profile photo</strong> — optional. If you add one, it is stored so
          it can be shown on your own profile. You can change or remove it at any time.
        </li>
        <li>
          <strong>Notification token</strong> — if you allow notifications, we store a
          device push token so we can alert you about your prayers. It is removed when
          you turn notifications off or delete your account.
        </li>
        <li>
          <strong>Technical metadata</strong> — request timestamps and device
          information needed to keep the service running and secure. This is never
          sold.
        </li>
      </ul>

      <h2>2. AI-Generated Comfort &amp; Scripture</h2>
      <p>
        When you submit a prayer, its text is sent to a third-party AI service to
        generate a short comfort message and a suggested Bible verse, and to sort the
        request into a general category. This processing is solely to serve those
        results back to you. We do not permit your prayer text to be used to train
        external or third-party models. AI responses are clearly labelled as
        AI-generated, and you can flag any response you find wrong or inappropriate.
      </p>

      <h2>3. How Your Prayers Are Seen</h2>
      <p>
        Every prayer is routed to a single vetted prayer partner. Submitting a
        prayer anonymously hides your name from that partner. Administrators can
        view prayers only when supporting an investigation — for example, an abuse
        report — and every such view is logged in an immutable audit trail.
      </p>

      <h2>4. How We Use Your Information</h2>
      <ul>
        <li>To deliver prayer requests to the right partner and back to your history.</li>
        <li>To send you notifications, verification, and account-recovery messages.</li>
        <li>To protect the community against abuse, spam, and fraud.</li>
        <li>To understand, in aggregate, how the platform is used so we can improve it.</li>
      </ul>

      <h2>5. What We Will Never Do</h2>
      <ul>
        <li>Sell your prayers or your contact information. Ever.</li>
        <li>Train external or third-party models on your prayer text.</li>
        <li>Share your personal data with advertisers.</li>
      </ul>

      <h2>6. The Bible Reader</h2>
      <p>
        The Bible is bundled inside the app, so reading works entirely offline and no
        request is sent to us when you open a chapter. <strong>We do not track,
        collect, or transmit what you read.</strong> Your reading position, bookmarks,
        highlights, chosen translation and text size stay in local storage on your own
        device — they are never uploaded to our servers and we cannot see them. Because
        they are device-local, they are removed if you uninstall the app or clear its
        storage, and they do not follow you to a new device.
      </p>

      <h2>7. Bible Content, Licensing and Attribution</h2>
      <p>
        Scripture texts are included under public-domain or open licences and remain the
        property of their respective rights holders; we claim no ownership of them.
      </p>
      <ul>
        <li>
          King James Version, American Standard Version, World English Bible and the
          Telugu Old Version — public domain. “World English Bible” is a trademark of
          eBible.org.
        </li>
        <li>Berean Standard Bible — released under CC0 by Berean Bible / Bible Hub.</li>
        <li>
          Hindi and Telugu Indian Revised Version (IRV) — Copyright © Bridge
          Connectivity Solutions, used under{' '}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noopener noreferrer"
          >
            CC BY-SA 4.0
          </a>
          .
        </li>
        <li>
          Cross-reference data — derived from OpenBible.info, used under a Creative
          Commons Attribution licence.
        </li>
      </ul>
      <p>
        Translations shown in the app as “coming soon” (such as ESV, NIV and NKJV) are
        not included and would require a licence from their publishers.
      </p>

      <h2>8. Data Security</h2>
      <p>
        All traffic is encrypted in transit over HTTPS. Passwords are hashed and
        never stored in plain text. Access to prayer content is restricted, logged,
        and limited to the minimum required to operate the service.
      </p>

      <h2>9. Your Rights</h2>
      <p>
        You can delete your account and associated data yourself at any time from{' '}
        <strong>Menu → Profile Settings → Delete account</strong> in the app or on the
        website, or from our{' '}
        <a href="/delete-account">account deletion page</a>. Deleting removes your
        profile, photo, notification token and notifications, and strips your identity
        from past prayer requests. You can also request a copy of your data, or ask us
        to delete it for you, by emailing{' '}
        <a href="mailto:admin@tefillah.in">admin@tefillah.in</a>; we will action
        your request within 30 days, except where retention is required by law.
      </p>

      <h2>10. Contact Us</h2>
      <p>
        Questions about this policy or how your data is handled can be sent to{' '}
        <a href="mailto:admin@tefillah.in">admin@tefillah.in</a> and we will
        respond as soon as we can.
      </p>
    </LegalLayout>
  );
}
