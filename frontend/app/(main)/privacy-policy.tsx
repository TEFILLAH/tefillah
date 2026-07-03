import React from 'react';
import { LegalPage } from '../../src/components/LegalPage';

const sections = [
  {
    title: 'Information We Collect',
    content:
      'We collect information you provide when creating an account, including your name, email address, phone number, and city. When you submit prayer requests, the content of those requests is stored securely. With your permission, we also collect your approximate location to route your prayer to a partner in your region, an optional profile photo, and — if you allow notifications — a device push token so we can alert you about your prayers. We also collect usage data such as app interaction patterns and device information to improve our services.',
  },
  {
    title: 'How We Use Your Information',
    content:
      'Your information is used to: provide and maintain the Tefillah prayer service; connect your prayer requests with prayer partners; send verification emails and important account notifications; improve and personalize your experience; and generate anonymized analytics to enhance our platform.',
  },
  {
    title: 'Prayer Request Privacy',
    content:
      'Prayer requests submitted anonymously will never have your identity disclosed to prayer partners. Non-anonymous requests may include your name to prayer partners for personalized prayer. All prayer content is treated as confidential and is never shared publicly or used for marketing purposes.',
  },
  {
    title: 'Data Storage and Security',
    content:
      'Your data is stored on secure servers with encryption at rest and in transit. Passwords are hashed using industry-standard bcrypt algorithms. We implement rate limiting, input sanitization, and access controls to protect your information. Authentication tokens are stored securely on your device.',
  },
  {
    title: 'Third-Party Services',
    content:
      'We use the following third-party services: Firebase Authentication for secure sign-in and push notifications; Resend for transactional emails; and AI language models for generating comfort messages and Bible verses from your prayer text. AI responses are clearly labelled as AI-generated and you can flag any response you find wrong or inappropriate. We do not permit your prayer text to be used to train external models. These services have their own privacy policies and we encourage you to review them.',
  },
  {
    title: 'Your Rights',
    content:
      'You can delete your account and all associated data yourself at any time from Menu → Profile Settings → Delete account. Deleting removes your profile, photo, notification token and notifications, and strips your identity from past prayer requests. You also have the right to access your personal data, request correction of inaccurate data, opt out of non-essential communications, and export your prayer history. To exercise these rights, contact us at admin@tefillah.in.',
  },
  {
    title: 'Data Retention',
    content:
      'Account data is retained as long as your account is active. Prayer requests are retained for the purpose of maintaining your prayer history. You may request deletion of your account and all associated data at any time by contacting our support team.',
  },
  {
    title: 'Children\'s Privacy',
    content:
      'Tefillah is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If we discover that a child under 13 has provided us with personal data, we will promptly delete it.',
  },
  {
    title: 'Changes to This Policy',
    content:
      'We may update this Privacy Policy from time to time. We will notify you of any significant changes through the app or via email. Your continued use of Tefillah after changes constitutes acceptance of the updated policy.',
  },
  {
    title: 'Contact Us',
    content:
      'If you have questions or concerns about this Privacy Policy or our data practices, please contact us at admin@tefillah.in.',
  },
];

export default function PrivacyPolicyScreen() {
  return <LegalPage title="Privacy Policy" lastUpdated="March 15, 2026" sections={sections} />;
}
