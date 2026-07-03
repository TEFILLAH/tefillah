import React from 'react';
import { LegalPage } from '../../src/components/LegalPage';

const sections = [
  {
    title: 'A Sacred, Respectful Space',
    content:
      'Tefillah is a community of prayer. Treat every member — those who request prayer and those who pray — with kindness, dignity, and respect, regardless of background, denomination, or circumstance. Hostility, harassment, mockery, and discrimination have no place here.',
  },
  {
    title: 'Sincere Prayer Requests',
    content:
      'Share what is genuinely on your heart. Prayer requests should be authentic and offered in good faith. Do not use the platform for spam, advertising, solicitation, fundraising, or any non-prayer purpose.',
  },
  {
    title: 'Confidentiality',
    content:
      'Prayer requests are entrusted to vetted prayer partners for the sole purpose of prayer. Partners must hold every request in strict confidence and must never share, screenshot, or repeat a request outside the platform. Breaching confidentiality may result in immediate removal.',
  },
  {
    title: 'Protecting Identity & Safety',
    content:
      'You may submit requests anonymously to protect your identity, which is especially important in sensitive or restricted settings. Never share another person’s private information without consent, and never attempt to identify or contact an anonymous requester.',
  },
  {
    title: 'No Harmful or Unlawful Content',
    content:
      'Do not post content that is hateful, threatening, harassing, obscene, defamatory, or that promotes violence, self-harm, or illegal activity. Content that endangers a child, or that constitutes abuse or exploitation, is strictly prohibited and may be reported to the authorities.',
  },
  {
    title: 'Not a Substitute for Professional Help',
    content:
      'Tefillah offers spiritual support and encouragement — it is not medical, legal, financial, or psychological advice. In an emergency, or if you or someone else is in danger, contact your local emergency services or a qualified professional immediately.',
  },
  {
    title: 'Authentic Participation',
    content:
      'Use your real identity when registering and maintain only one account. Do not impersonate others, misrepresent your affiliation, or create accounts to evade a suspension.',
  },
  {
    title: 'Reporting & Moderation',
    content:
      'If you encounter content or behaviour that breaks these guidelines, please report it in the app or email admin@tefillah.in. We review reports in good faith and may remove content, issue warnings, or suspend accounts to keep the community safe.',
  },
  {
    title: 'Consequences',
    content:
      'Violating these guidelines may lead to content removal, a warning, temporary suspension, or permanent termination of your account, at our reasonable discretion and depending on the severity of the violation.',
  },
  {
    title: 'Contact',
    content:
      'Questions about these Community Guidelines can be sent to admin@tefillah.in. Grievances may be directed to grievance@tefillah.in.',
  },
];

export default function CommunityGuidelinesScreen() {
  return <LegalPage title="Community Guidelines" lastUpdated="June 12, 2026" sections={sections} />;
}
