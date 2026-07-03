import React from 'react';
import { LegalPage } from '../../src/components/LegalPage';

const sections = [
  {
    title: 'Acceptance of Terms',
    content:
      'By accessing or using the Tefillah application, you agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use the application.',
  },
  {
    title: 'Description of Service',
    content:
      'Tefillah is a prayer request platform that connects individuals seeking prayer support with dedicated prayer partners. The service includes prayer request submission, prayer partner management, AI-generated comfort messages, and Bible verse recommendations.',
  },
  {
    title: 'User Accounts',
    content:
      'You must provide accurate and complete information when creating an account. You are responsible for maintaining the confidentiality of your account credentials. You must notify us immediately of any unauthorized access to your account. One person may maintain only one account.',
  },
  {
    title: 'Acceptable Use',
    content:
      'You agree to use Tefillah only for its intended purpose of submitting and praying for prayer requests. You must not use the platform to submit harmful, offensive, or inappropriate content. You must not attempt to access other users\' accounts or data. You must not use the service for commercial purposes or spam.',
  },
  {
    title: 'Objectionable Content & Zero Tolerance',
    content:
      'There is zero tolerance for objectionable content or abusive behaviour. Prayer partners can report any request, and members can flag AI-generated responses; we review reports and act within 24 hours, removing violating content and banning abusing users. By using Tefillah you agree not to post content that is hateful, harassing, threatening, sexually explicit, or otherwise objectionable, and you accept that violations may result in immediate removal of content and termination of your account.',
  },
  {
    title: 'Prayer Requests',
    content:
      'Prayer requests you submit may be shared with prayer partners for the purpose of prayer. Anonymous requests will not include your identifying information. You retain ownership of the content you submit. By submitting content, you grant Tefillah permission to store and share it with prayer partners as part of the service.',
  },
  {
    title: 'Prayer Partners',
    content:
      'Prayer partners are volunteers who commit to praying for submitted requests. Prayer partners must maintain confidentiality of all prayer requests they receive. Prayer partner status may be revoked for violations of these terms or fellowship guidelines.',
  },
  {
    title: 'AI-Generated Content',
    content:
      'Tefillah uses AI language models to generate comfort messages and Bible verse recommendations. These are provided for encouragement and should not be considered as professional counseling, medical advice, or theological doctrine.',
  },
  {
    title: 'Intellectual Property',
    content:
      'The Tefillah application, including its design, code, and branding, is the property of the Tefillah team. Bible verses are sourced from publicly available translations. You may not copy, modify, or distribute any part of the application without written permission.',
  },
  {
    title: 'Limitation of Liability',
    content:
      'Tefillah is provided "as is" without warranties of any kind. We are not responsible for the actions of prayer partners or other users. We do not guarantee the availability or uptime of the service. Our liability is limited to the maximum extent permitted by law.',
  },
  {
    title: 'Termination',
    content:
      'We reserve the right to suspend or terminate your account for violations of these terms. You may delete your account and all associated data at any time directly in the app from Menu → Profile Settings → Delete account, or from tefillah.in/delete-account (emailing admin@tefillah.in is also available as a fallback). Upon termination, your data will be handled in accordance with our Privacy Policy.',
  },
  {
    title: 'Changes to Terms',
    content:
      'We may modify these terms at any time. Significant changes will be communicated through the app. Continued use of Tefillah after changes constitutes acceptance of the updated terms.',
  },
  {
    title: 'Contact',
    content:
      'For questions about these Terms and Conditions, contact us at admin@tefillah.in.',
  },
];

export default function TermsScreen() {
  return <LegalPage title="Terms & Conditions" lastUpdated="March 15, 2026" sections={sections} />;
}
