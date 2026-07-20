import LegalLayout from './LegalLayout';

/**
 * Tefillah — Terms and Conditions of Service.
 * Sourced from the legal counsel-drafted Tefillah_Terms_and_Conditions.docx.
 * 26 sections preserved verbatim, with a short plain-English intro added on top
 * for users who don't want to read the full legal text.
 */
export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms and Conditions"
      intro="The agreement that governs your use of Tefillah. Please read it carefully — by using the platform you accept these terms in full."
    >
      <div
        className="not-prose rounded-xl p-5 mb-8 border"
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-border-strong)',
        }}
      >
        <p className="eyebrow mb-3">In plain English</p>
        <ul style={{ marginLeft: '1rem', listStyle: 'disc' }}>
          <li>You must meet the minimum age your local laws require for using online services; if you're a minor, use Tefillah with a parent or guardian's supervision and consent.</li>
          <li>You own what you write. You give us permission to display and store it so we can deliver the service.</li>
          <li>Be kind and lawful. We can remove content or accounts that aren't.</li>
          <li>Tefillah is a spiritual community — not medical, legal, financial, or therapeutic advice. In emergencies, call local emergency services.</li>
          <li>Your privacy is governed by the Privacy Policy.</li>
          <li>India law applies. Disputes go to arbitration in India.</li>
          <li>Questions: <a href="mailto:admin@tefillah.in">admin@tefillah.in</a>. Grievances: <a href="mailto:grievance@tefillah.in">grievance@tefillah.in</a>.</li>
        </ul>
        <p className="mt-3 text-xs italic" style={{ color: 'var(--color-text-muted)' }}>
          The summary above is non-binding. The full legal terms below are what govern your use of Tefillah.
        </p>
      </div>

      <p className="font-semibold">
        PLEASE READ THESE TERMS CAREFULLY BEFORE ACCESSING OR USING THE TEFILLAH PLATFORM.
        BY ACCESSING OR USING THE SERVICES IN ANY MANNER, YOU ACKNOWLEDGE THAT YOU HAVE READ,
        UNDERSTOOD, AND IRREVOCABLY AGREE TO BE BOUND BY THESE TERMS AND OUR PRIVACY POLICY.
      </p>

      <h2>1. Definitions</h2>
      <p>
        As used in these Terms and Conditions ("Terms"), the following terms shall have the
        meanings ascribed to them below. Terms not otherwise defined herein shall bear their
        ordinary meaning in context.
      </p>
      <p><strong>1.1</strong> "Tefillah," "Company," "Platform," "we," "us," or "our" refers to Tefillah, its subsidiaries, officers, directors, employees, agents, licensors, and successors in interest, operating the Services described herein.</p>
      <p><strong>1.2</strong> "You," "User," or "Member" means any natural person or legal entity who accesses, registers on, or utilises the Services in any capacity, including as a visitor, registered member, prayer agent, group administrator, or any other designated role.</p>
      <p><strong>1.3</strong> "Services" means the Tefillah website, mobile application(s), application programming interfaces (APIs), and all related features, tools, content, software, communications, and offerings made available by Tefillah from time to time.</p>
      <p><strong>1.4</strong> "User Content" or "Content" means any and all text, images, audio, video, messages, prayer requests, testimonies, profile data, annotations, feedback, and other materials submitted, posted, transmitted, or otherwise made available by Users through or in connection with the Services.</p>
      <p><strong>1.5</strong> "Account" means a registered user profile created by a User to access certain features of the Services, protected by authentication credentials.</p>
      <p><strong>1.6</strong> "Intellectual Property Rights" means all patents, copyrights, trademarks, service marks, trade secrets, database rights, design rights, moral rights, and all other intellectual or industrial property rights of any nature, whether registered or unregistered, including all applications and renewals thereof.</p>
      <p><strong>1.7</strong> "Applicable Law" means all statutes, regulations, rules, orders, directives, standards, and other legal requirements of any governmental or regulatory authority having jurisdiction over the Services or either party, including but not limited to the Information Technology Act, 2000 (India) and rules thereunder, the Digital Personal Data Protection Act, 2023 (India), and any other applicable data protection, consumer protection, or telecommunications laws.</p>

      <h2>2. Acceptance, Scope, and Incorporated Policies</h2>
      <p><strong>2.1 Binding Agreement.</strong> These Terms constitute a legally binding agreement between you and Tefillah. By accessing or using the Services — including by creating an Account, submitting Content, clicking an acceptance button, or simply browsing — you represent that you have read, understood, and unconditionally agree to be bound by these Terms, including all policies incorporated by reference.</p>
      <p><strong>2.2 Incorporated Policies.</strong> These Terms incorporate and must be read together with: (a) the Privacy Policy; (b) the Community Guidelines; (c) the Cookie Policy; (d) any supplemental terms applicable to specific features or promotional offers; and (e) any other guidelines or policies published by Tefillah on the Services from time to time. In the event of any conflict between these Terms and an incorporated policy, these Terms shall prevail unless a supplemental policy expressly states that it supersedes a specific provision herein.</p>
      <p><strong>2.3 Entire Agreement.</strong> These Terms, together with all incorporated policies, constitute the entire and exclusive agreement between you and Tefillah with respect to the Services and supersede all prior negotiations, representations, warranties, and understandings of any kind.</p>

      <h2>3. Eligibility and Capacity</h2>
      <p><strong>3.1 Minimum Age.</strong> You must meet the minimum age, if any, required by Applicable Law in your jurisdiction to access online services of this nature and to enter into a binding agreement. Tefillah does not impose a specific minimum age beyond what Applicable Law mandates; however, you remain responsible for ensuring that your use of the Services complies with the laws of the territory in which you reside or from which you access the Services.</p>
      <p><strong>3.2 Minors.</strong> If you are a minor under Applicable Law, you may use the Services only with the documented consent and active supervision of a parent or legal guardian, who by permitting such use agrees to be bound by these Terms on your behalf and accepts liability for your use.</p>
      <p><strong>3.3 Legal Capacity.</strong> By using the Services, you represent and warrant that: (a) you have full legal capacity and authority to enter into these Terms; (b) you are not barred from receiving the Services under Applicable Law; and (c) if acting on behalf of a legal entity, you are duly authorised to bind that entity.</p>
      <p><strong>3.4 Compliance with Local Laws.</strong> You are solely responsible for ensuring that your use of the Services complies with all laws, regulations, and local ordinances applicable to you. Tefillah makes no representation that the Services are lawful, appropriate, or available in every jurisdiction.</p>

      <h2>4. Account Registration and Security</h2>
      <p><strong>4.1 Registration.</strong> Certain features of the Services require the creation of an Account. You agree to provide accurate, current, and complete information during registration and to promptly update such information to maintain its accuracy. Submission of false or misleading information constitutes a material breach of these Terms.</p>
      <p><strong>4.2 Account Security.</strong> You are solely and exclusively responsible for: (a) maintaining the strict confidentiality of your Account credentials (including password and any multi-factor authentication tokens); (b) all activities, transactions, and communications that occur under your Account, whether authorised or not; and (c) ensuring that you log out of your Account at the end of each session on shared or public devices.</p>
      <p><strong>4.3 Unauthorised Access.</strong> You must notify Tefillah immediately at <a href="mailto:admin@tefillah.in">admin@tefillah.in</a> upon becoming aware of any actual or suspected unauthorised access to, or use of, your Account or credentials. Tefillah will act on authenticated requests and shall not be liable for any loss or damage arising from your failure to comply with the foregoing obligations or from your failure to promptly notify us.</p>
      <p><strong>4.4 No Account Transfer.</strong> Accounts are personal and non-transferable. You may not sell, sublicense, transfer, or otherwise assign your Account or Account rights to any third party without prior written consent from Tefillah. Any purported transfer in violation of this provision is null and void.</p>
      <p><strong>4.5 One Account Per User.</strong> Unless expressly authorised, each User may maintain only one registered Account. Tefillah reserves the right to merge, suspend, or terminate duplicate Accounts.</p>

      <h2>5. User Content: Ownership, Licence, and Representations</h2>
      <p><strong>5.1 Ownership Retained.</strong> You retain all pre-existing Intellectual Property Rights in User Content that you submit. Tefillah does not claim ownership of your Content by virtue of submission.</p>
      <p><strong>5.2 Licence Granted to Tefillah.</strong> By submitting, posting, or transmitting User Content through the Services, you hereby grant Tefillah a worldwide, perpetual (subject to Section 5.3), irrevocable during the Term, non-exclusive, royalty-free, fully paid-up, transferable, and sublicensable licence to: host, store, reproduce, copy, process, adapt, modify, translate, create derivative works from, publish, transmit, distribute, publicly display, publicly perform, and otherwise use such Content for the purposes of: (a) operating, maintaining, and improving the Services; (b) personalising your experience and that of other Users; (c) promoting and marketing the Services (in anonymised or non-personally-identifiable form, unless you have provided separate consent); (d) ensuring security, conducting backups, and archival purposes; and (e) complying with legal obligations. This licence does not transfer ownership of your Content to Tefillah.</p>
      <p><strong>5.3 Revocation of Licence.</strong> The licence in Section 5.2 survives deletion of your Account or Content to the extent that: (a) copies have been distributed or embedded by other Users and technical removal is not feasible; (b) archival or backup copies exist and their deletion would be technically impractical; or (c) Tefillah is required by Applicable Law to retain such Content. Subject to the foregoing, Tefillah will use commercially reasonable efforts to remove accessible copies within a reasonable time following deletion.</p>
      <p><strong>5.4 Representations and Warranties.</strong> You represent, warrant, and undertake that: (a) you own or have obtained all necessary rights, licences, permissions, consents, and clearances required to submit the Content and to grant the licence in Section 5.2; (b) the Content does not infringe, misappropriate, or violate any Intellectual Property Rights, rights of publicity, privacy rights, or other rights of any third party; (c) the Content does not violate any Applicable Law; and (d) the Content is true and accurate to the best of your knowledge.</p>
      <p><strong>5.5 No Obligation to Host.</strong> Tefillah is under no obligation to host, publish, display, or distribute any User Content, and may remove or restrict access to any Content at any time, with or without notice, in accordance with Section 7.</p>

      <h2>6. Acceptable Use and Prohibited Conduct</h2>
      <p><strong>6.1 Permitted Use.</strong> You may use the Services only for lawful purposes and in accordance with these Terms, Applicable Law, and the Community Guidelines. The Services are intended for spiritual support, community prayer, and related religious activities.</p>
      <p><strong>6.2 Prohibited Activities.</strong> You agree that you will NOT use the Services to:</p>
      <ul>
        <li>Violate any Applicable Law, statute, ordinance, regulation, rule, or third-party right, including applicable data protection laws;</li>
        <li>Submit, post, transmit, or distribute Content that is defamatory, libellous, obscene, pornographic, indecent, sexually explicit, abusive, threatening, harassing, hateful, discriminatory, or otherwise objectionable in Tefillah's reasonable discretion;</li>
        <li>Impersonate any person or entity, falsely state or misrepresent your affiliation with any person or organisation, or create a false impression of your identity or authority;</li>
        <li>Solicit, promote, or facilitate illegal activity, fraud, gambling, or the provision, sale, or distribution of illegal goods or services;</li>
        <li>Transmit unsolicited commercial communications (spam), chain letters, pyramid or Ponzi schemes, phishing communications, or any other form of unauthorised solicitation;</li>
        <li>Upload, transmit, or introduce malware, viruses, Trojan horses, ransomware, spyware, adware, or any other malicious or disruptive code or programme;</li>
        <li>Interfere with, disrupt, disable, overburden, or impair the integrity, performance, or security of the Services or any related systems, networks, or servers;</li>
        <li>Attempt to gain unauthorised access to any part of the Services, other Accounts, or Tefillah's or third-party computer systems, whether by hacking, password mining, or any other means;</li>
        <li>Reverse engineer, decompile, disassemble, or otherwise attempt to derive the source code, algorithms, or underlying ideas of any part of the Services;</li>
        <li>Scrape, crawl, index, or otherwise collect data from the Services using automated tools, bots, or scripts, except as expressly authorised in writing by Tefillah;</li>
        <li>Harvest, collect, or store personal information about other Users without their explicit consent or in violation of Applicable Law;</li>
        <li>Use the Services in any manner that could harm Tefillah's reputation, bring Tefillah into disrepute, or expose Tefillah to legal liability;</li>
        <li>Engage in any conduct that, in Tefillah's sole and reasonable discretion, restricts or inhibits any other User from using or enjoying the Services.</li>
      </ul>
      <p><strong>6.3 Consequences.</strong> Without limiting any other remedy available to Tefillah, violation of this Section may result in immediate removal of Content, suspension or permanent termination of your Account, referral to law enforcement authorities, and civil or criminal legal action.</p>

      <h2>7. Content Moderation, Reporting, and Enforcement</h2>
      <p><strong>7.1 Moderation.</strong> Tefillah reserves the right, but not the obligation, to moderate User Content using automated systems, human reviewers, or a combination of both. Moderation decisions are made in Tefillah's reasonable discretion for the purpose of maintaining community safety, religious integrity, and compliance with these Terms and Applicable Law.</p>
      <p><strong>7.2 Reporting.</strong> Users may report Content or conduct that they believe violates these Terms by using the in-app reporting function or by contacting <a href="mailto:admin@tefillah.in">admin@tefillah.in</a>. Tefillah will investigate reported Content in good faith and take such action as it deems appropriate in its reasonable discretion.</p>
      <p><strong>7.3 Enforcement Actions.</strong> Upon becoming aware of a violation (or suspected violation) of these Terms, Tefillah may, without prior notice and without liability, take any one or more of the following actions: (a) remove, edit, or restrict access to Content; (b) issue a warning; (c) temporarily suspend or permanently terminate an Account; (d) block access from specific IP addresses or devices; (e) notify and cooperate with law enforcement authorities; and/or (f) pursue any other legal or equitable remedies available to it.</p>
      <p><strong>7.4 No Liability for Moderation Decisions.</strong> Tefillah shall not be liable to any User or third party for any moderation decision, enforcement action, or removal of Content taken in good faith pursuant to this Section. Tefillah does not assume any editorial responsibility or liability for User Content by virtue of its moderation activities.</p>
      <p><strong>7.5 IT Act Compliance (India).</strong> In accordance with the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, as amended, Tefillah maintains a Grievance Redressal Mechanism. Users may submit complaints to the designated Grievance Officer at: <a href="mailto:grievance@tefillah.in">grievance@tefillah.in</a>. Complaints will be acknowledged within twenty-four (24) hours and resolved within fifteen (15) days of receipt, in accordance with applicable requirements.</p>

      <h2>8. Anonymity, Pseudonymity, and Privacy</h2>
      <p><strong>8.1 Anonymous Posting Features.</strong> The Services may offer features enabling pseudonymous or anonymous posting of Content. While Tefillah implements reasonable technical and procedural safeguards to protect displayed identity, it cannot guarantee absolute anonymity in all circumstances. Metadata, logs, IP addresses, device identifiers, and other technical information may be collected and may be disclosable as required by Applicable Law or legal process.</p>
      <p><strong>8.2 Continued Obligations.</strong> Irrespective of any anonymity feature, you remain responsible for all Content you submit and must comply with these Terms. The grant of anonymity features by Tefillah does not limit or waive Tefillah's rights under these Terms.</p>
      <p><strong>8.3 Privacy Policy.</strong> The collection, use, storage, sharing, and retention of personal data is governed by the <a href="/privacy">Privacy Policy</a>, which is incorporated herein by reference. By using the Services, you acknowledge and consent to Tefillah's data practices as described in the Privacy Policy. Where required by Applicable Law (including the Digital Personal Data Protection Act, 2023), Tefillah will seek your consent prior to processing personal data for purposes not described in the Privacy Policy.</p>

      <h2>9. No Professional Advice; Safety and Medical Disclaimers</h2>
      <p><strong>9.1 Spiritual Platform Only.</strong> The Services are designed to facilitate spiritual support, communal prayer, and religious community interaction. No Content available on or through the Services constitutes, or is intended to constitute, medical, legal, financial, psychological, psychiatric, therapeutic, or any other form of professional advice.</p>
      <p><strong>9.2 No Reliance.</strong> You must not rely on any Content posted on the Services as a substitute for professional advice from a qualified practitioner. Tefillah expressly disclaims any responsibility or liability for decisions made in reliance on User Content.</p>
      <p><strong>9.3 Emergencies.</strong> If you or any other person are in a situation of medical, psychological, or physical emergency, do not rely on the Services. Contact local emergency services or qualified medical professionals immediately.</p>
      <p><strong>9.4 No Endorsement of User Content.</strong> Tefillah does not endorse, verify, or guarantee the accuracy, reliability, completeness, or appropriateness of any User Content. Users access and rely on User Content entirely at their own risk.</p>

      <h2>10. Intellectual Property Rights of Tefillah</h2>
      <p><strong>10.1 Tefillah IP.</strong> All Intellectual Property Rights in and to the Services (excluding User Content) — including without limitation software, source code, object code, APIs, algorithms, interfaces, designs, graphics, logos, trademarks, service marks, trade names, database rights, and proprietary tools — are owned by or licensed to Tefillah and are protected by Applicable Law. Nothing in these Terms constitutes a transfer or assignment of any Intellectual Property Rights from Tefillah to you.</p>
      <p><strong>10.2 Restricted Licence to Users.</strong> Subject to your compliance with these Terms, Tefillah grants you a limited, non-exclusive, non-transferable, non-sublicensable, revocable licence to access and use the Services solely for personal, non-commercial purposes. This licence does not include any right to: (a) sublicense, resell, or commercially exploit the Services; (b) copy, modify, adapt, translate, or create derivative works; (c) reverse engineer, decompile, or disassemble any part of the Services; (d) use any data mining, robots, or similar data gathering tools; or (e) use any Tefillah trademarks, logos, or branding without prior written consent.</p>
      <p><strong>10.3 Trademark Protection.</strong> 'Tefillah' and associated logos and marks are trademarks of Tefillah. Unauthorised use of Tefillah's trademarks or trade dress is strictly prohibited and may give rise to legal liability.</p>
      <p><strong>10.4 Feedback.</strong> If you provide Tefillah with suggestions, ideas, feedback, or other input regarding the Services ('Feedback'), you hereby assign to Tefillah all Intellectual Property Rights in such Feedback, and Tefillah is free to use, disclose, and exploit such Feedback without restriction or compensation to you.</p>
      <p><strong>10.5 Scripture Texts and Third-Party Licensed Content.</strong> The Bible translations and cross-reference data made available through the Services are NOT owned by Tefillah. They are included under public-domain or open licences and remain the property of their respective rights holders. Nothing in Section 10.1 or 10.2 is intended to, or does, restrict any rights you hold in such texts under their own licences, which prevail over this Section in respect of that content. Specifically: (a) the King James Version, American Standard Version, World English Bible, and Telugu Old Version are in the public domain, and 'World English Bible' is a trademark of eBible.org; (b) the Berean Standard Bible is released under CC0 by Berean Bible / Bible Hub; (c) the Hindi and Telugu Indian Revised Version (IRV) texts are Copyright © Bridge Connectivity Solutions and are used under the Creative Commons Attribution-ShareAlike 4.0 International licence (https://creativecommons.org/licenses/by-sa/4.0/), which permits redistribution with attribution and requires that any redistributed adaptation of those texts be offered under the same licence; and (d) cross-reference data is derived from OpenBible.info and used under a Creative Commons Attribution licence. Translations presented in the Services as 'coming soon' are not included and require a licence from the relevant publisher.</p>
      <p><strong>10.6 Offline Bible Reading.</strong> Scripture texts are bundled within the application and function offline. Tefillah does not track, collect, or transmit which passages you read. Reading position, bookmarks, highlights, translation selection, and text size are stored solely in local storage on your device, are not uploaded to Tefillah's servers, and are removed if you uninstall the application or clear its storage.</p>

      <h2>11. Third-Party Services, Links, and Integrations</h2>
      <p><strong>11.1 Third-Party Content and Links.</strong> The Services may contain hyperlinks to, or integrations with, third-party websites, applications, and services (collectively, 'Third-Party Services'). Tefillah does not control, endorse, sponsor, recommend, or bear responsibility for any Third-Party Services or their content, privacy practices, availability, or accuracy.</p>
      <p><strong>11.2 Independent Relationships.</strong> Your interactions with any Third-Party Service, including any transactions, data sharing, or contractual arrangements, are exclusively between you and that third party. Tefillah shall have no liability whatsoever arising from your access to or use of any Third-Party Service.</p>
      <p><strong>11.3 Third-Party Terms.</strong> Your use of Third-Party Services is governed by the terms and policies of the respective third party. Tefillah encourages you to review such terms prior to engaging with any Third-Party Service.</p>

      <h2>12. Fees, Payments, Subscriptions, and Refunds</h2>
      <p><strong>12.1 Applicability.</strong> This Section applies only to the extent that Tefillah offers paid features, subscriptions, in-app purchases, or accepts donations ('Paid Services').</p>
      <p><strong>12.2 Payment Terms.</strong> Payment terms, pricing, and billing cycles for Paid Services shall be disclosed at the point of purchase. By initiating a purchase, you authorise Tefillah and its designated third-party payment processor(s) to charge the payment method you specify. All prices are inclusive of applicable taxes unless stated otherwise.</p>
      <p><strong>12.3 Third-Party Processors.</strong> Payment processing is handled by third-party payment processors. Your payment information is subject to their terms and privacy policies, and Tefillah does not store complete payment card details.</p>
      <p><strong>12.4 Refund Policy.</strong> Refund and cancellation terms will be presented at the time of purchase. Except as required by Applicable Law or as explicitly stated at purchase, all payments are non-refundable.</p>
      <p><strong>12.5 Modifications.</strong> Tefillah reserves the right to modify pricing, introduce new charges, or discontinue Paid Services at any time, subject to providing reasonable prior notice. Continued use of a Paid Service after the effective date of a price change constitutes acceptance of the new pricing.</p>

      <h2>13. Suspension and Termination</h2>
      <p><strong>13.1 Termination by Tefillah.</strong> Tefillah reserves the right, in its sole and reasonable discretion, to suspend, restrict, or permanently terminate your Account and/or access to all or any part of the Services, with or without prior notice and without liability to you, for any of the following reasons: (a) actual or suspected violation of these Terms or any incorporated policy; (b) compliance with a legal obligation, court order, or directive from a competent authority; (c) conduct that Tefillah reasonably believes creates legal exposure, reputational harm, or risk to other Users or third parties; (d) extended periods of Account inactivity; or (e) any other reason in Tefillah's reasonable business discretion.</p>
      <p><strong>13.2 Termination by You.</strong> You may terminate your Account at any time by using the Account deletion function within the Services or by contacting <a href="mailto:admin@tefillah.in">admin@tefillah.in</a>. Account deletion does not immediately remove all copies of Content due to caching, backup schedules, legal retention obligations, or technical constraints. Subject to these constraints, Tefillah will process deletion requests in accordance with the Privacy Policy.</p>
      <p><strong>13.3 Effect of Termination.</strong> Upon termination of your Account for any reason: (a) all licences granted to you under these Terms shall immediately terminate; (b) your right to access and use the Services shall cease; and (c) Tefillah may, but is not obligated to, delete your Account data. Tefillah shall not be liable to you or any third party for any termination of access to the Services.</p>
      <p><strong>13.4 Survival.</strong> The following provisions shall survive termination of these Terms: Sections 5 (User Content Licence), 9 (Disclaimers), 10 (Intellectual Property), 14 (Warranty Disclaimer), 15 (Limitation of Liability), 16 (Indemnification), 18 (Governing Law), and all other provisions that by their nature or express terms should survive.</p>

      <h2>14. Warranty Disclaimer</h2>
      <p className="font-semibold">
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE SERVICES ARE PROVIDED STRICTLY "AS IS," "AS AVAILABLE," AND "WITH ALL FAULTS," WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING — BUT NOT LIMITED TO — WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, TITLE, ACCURACY, RELIABILITY, COMPLETENESS, TIMELINESS, SECURITY, OR QUIET ENJOYMENT. TEFILLAH DOES NOT WARRANT THAT: (A) THE SERVICES WILL MEET YOUR REQUIREMENTS OR EXPECTATIONS; (B) THE SERVICES WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE FROM VIRUSES OR OTHER HARMFUL COMPONENTS; (C) DEFECTS WILL BE CORRECTED; OR (D) ANY CONTENT IS ACCURATE, RELIABLE, OR APPROPRIATE. ANY RELIANCE YOU PLACE ON THE SERVICES OR CONTENT IS STRICTLY AT YOUR OWN RISK. SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF CERTAIN WARRANTIES; TO THE EXTENT SUCH EXCLUSIONS ARE PROHIBITED BY APPLICABLE LAW, TEFILLAH'S WARRANTIES ARE LIMITED TO THE MINIMUM EXTENT PERMITTED.
      </p>

      <h2>15. Limitation of Liability</h2>
      <p><strong>15.1 EXCLUSION OF CONSEQUENTIAL DAMAGES.</strong> TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, NEITHER TEFILLAH NOR ANY OF ITS AFFILIATES, DIRECTORS, OFFICERS, EMPLOYEES, AGENTS, LICENSORS, OR SERVICE PROVIDERS SHALL BE LIABLE — UNDER ANY THEORY OF LIABILITY, INCLUDING CONTRACT, TORT (INCLUDING NEGLIGENCE), STRICT LIABILITY, OR OTHERWISE — FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO: LOSS OF PROFITS, REVENUE, SAVINGS, DATA, GOODWILL, BUSINESS, CONTRACTS, OR ANTICIPATED BENEFITS; BUSINESS INTERRUPTION; SYSTEM FAILURE; COST OF SUBSTITUTE SERVICES; OR DAMAGE TO DEVICE OR NETWORK — EVEN IF TEFILLAH HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
      <p><strong>15.2 AGGREGATE CAP ON DIRECT LIABILITY.</strong> TEFILLAH'S TOTAL AGGREGATE LIABILITY TO YOU FOR ANY AND ALL CLAIMS ARISING OUT OF OR RELATING TO THESE TERMS OR YOUR USE OF THE SERVICES SHALL NOT EXCEED THE GREATER OF: (A) THE TOTAL FEES ACTUALLY PAID BY YOU TO TEFILLAH FOR THE SERVICES IN THE TWELVE (12) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM; OR (B) FIVE HUNDRED INDIAN RUPEES (INR 500) OR EQUIVALENT IN YOUR LOCAL CURRENCY.</p>
      <p><strong>15.3 Mandatory Exceptions.</strong> Nothing in these Terms shall exclude or limit Tefillah's liability to the extent that such exclusion or limitation is not permitted under Applicable Law, including liability for: (a) death or personal injury caused by Tefillah's proven gross negligence; (b) fraud or fraudulent misrepresentation; or (c) any other liability that cannot be lawfully excluded or limited.</p>
      <p><strong>15.4 Allocation of Risk.</strong> The limitations of liability set out in this Section reflect a reasonable and fair allocation of risk between the parties and are a fundamental element of the basis of the bargain between you and Tefillah. Tefillah would not provide the Services without these limitations.</p>

      <h2>16. Indemnification</h2>
      <p>You agree to fully indemnify, defend, and hold harmless Tefillah and its respective officers, directors, shareholders, employees, agents, affiliates, licensors, successors, and assigns (collectively, 'Tefillah Parties') from and against any and all third-party claims, demands, proceedings, actions, liabilities, damages, judgments, awards, penalties, fines, costs, and expenses (including reasonable legal fees and disbursements) arising out of or relating to:</p>
      <ul>
        <li>(a) your breach of any provision of these Terms or any incorporated policy;</li>
        <li>(b) any User Content you submit, post, transmit, or otherwise make available through the Services;</li>
        <li>(c) your violation of any Applicable Law or the rights (including Intellectual Property Rights and privacy rights) of any third party;</li>
        <li>(d) your use or misuse of the Services or any features thereof;</li>
        <li>(e) your wilful misconduct, fraud, or gross negligence; and/or</li>
        <li>(f) any representation or warranty made by you in these Terms that is false, inaccurate, or misleading.</li>
      </ul>
      <p>Tefillah reserves the right, at its own expense, to assume the exclusive defence and control of any matter otherwise subject to indemnification by you, in which event you shall cooperate fully with Tefillah in asserting any available defences. You shall not settle any claim without Tefillah's prior written consent.</p>

      <h2>17. Data Protection and Privacy</h2>
      <p><strong>17.1 Privacy Policy.</strong> All personal data collected from or about you in connection with the Services is processed in accordance with the <a href="/privacy">Privacy Policy</a>, which is incorporated into these Terms by reference.</p>
      <p><strong>17.2 Applicable Data Protection Laws.</strong> To the extent that Applicable Law imposes obligations on Tefillah as a data fiduciary or data controller (including under the Digital Personal Data Protection Act, 2023 of India or any equivalent legislation applicable to you), Tefillah will comply with such obligations and honour your rights as a data principal or data subject, as applicable, including rights of access, correction, erasure, and grievance redressal.</p>
      <p><strong>17.3 Cross-Border Transfers.</strong> By using the Services, you acknowledge and consent to the transfer, storage, and processing of your personal data in countries other than your country of residence, including countries that may not provide the same level of data protection as your home jurisdiction. Tefillah will implement appropriate safeguards in accordance with Applicable Law for such transfers.</p>
      <p><strong>17.4 Cookies and Tracking.</strong> The Services use cookies and similar tracking technologies. Your choices regarding cookies are described in the Cookie Policy.</p>

      <h2>18. Governing Law and Dispute Resolution</h2>
      <p><strong>18.1 Governing Law.</strong> These Terms and all matters arising out of or in connection with them shall be governed by and construed in accordance with the laws of India, without regard to its conflict of laws principles.</p>
      <p><strong>18.2 Informal Resolution.</strong> Before initiating any formal dispute resolution process, the parties agree to attempt in good faith to resolve any dispute, controversy, or claim informally. Either party must submit a written notice of dispute to the other party describing the nature and basis of the claim and the relief sought. The parties will then negotiate in good faith for a period of thirty (30) days from receipt of such notice.</p>
      <p><strong>18.3 Arbitration.</strong> If a dispute cannot be resolved informally within the period specified in Section 18.2, it shall be referred to and finally resolved by arbitration administered in accordance with the Arbitration and Conciliation Act, 1996 (India), as amended. The seat of arbitration shall be Hyderabad, India. The arbitration shall be conducted by a sole arbitrator mutually appointed by the parties, or if no agreement is reached within fifteen (15) days, by an arbitrator appointed in accordance with the Rules. The language of arbitration shall be English. The arbitral award shall be final and binding on both parties.</p>
      <p><strong>18.4 Exceptions.</strong> Notwithstanding Section 18.3, either party may seek provisional, interim, or conservatory relief (including injunctions and specific performance) from any court of competent jurisdiction without being required to post a bond or other security, to the extent permitted by Applicable Law.</p>
      <p><strong>18.5 Class Action Waiver.</strong> <span className="font-semibold">TO THE MAXIMUM EXTENT PERMITTED BY LAW, YOU WAIVE ANY RIGHT TO BRING OR PARTICIPATE IN ANY CLASS, COLLECTIVE, COORDINATED, CONSOLIDATED, OR REPRESENTATIVE ACTION OR ARBITRATION PROCEEDING AGAINST TEFILLAH OR THE TEFILLAH PARTIES.</span></p>

      <h2>19. Information Technology Act Compliance (India)</h2>
      <p><strong>19.1 Intermediary Status.</strong> Tefillah operates as an intermediary within the meaning of the Information Technology Act, 2000 (India) ('IT Act'). Tefillah's obligations and protections as an intermediary are subject to applicable provisions of the IT Act and the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 ('IT Rules'), as amended from time to time.</p>
      <p><strong>19.2 Safe Harbour.</strong> Tefillah shall not be liable for any third-party information, data, or communication link made available or hosted by it, to the extent that Tefillah is entitled to safe harbour protection under Section 79 of the IT Act. Tefillah's safe harbour protection is contingent on compliance with the applicable conditions under the IT Act and IT Rules, including taking down infringing or unlawful Content upon receipt of actual knowledge or court order.</p>
      <p><strong>19.3 Grievance Officer.</strong> In accordance with the IT Rules, Tefillah has designated a Grievance Officer to receive and address complaints from Users and affected third parties. Complaints must be submitted to: <a href="mailto:grievance@tefillah.in">grievance@tefillah.in</a>. Tefillah will acknowledge complaints within twenty-four (24) hours and resolve them within fifteen (15) days of receipt, where required by Applicable Law.</p>
      <p><strong>19.4 Unlawful Content.</strong> Tefillah shall, upon obtaining knowledge — whether through a court order or notification — of any unlawful Content (including Content listed under Rule 3(1)(b) of the IT Rules), take down or disable access to such Content within the timelines prescribed by Applicable Law.</p>
      <p><strong>19.5 Government Requests.</strong> Tefillah may provide information and Content to government or law enforcement authorities as required by Applicable Law, court orders, or legal process. Tefillah will endeavour to notify affected Users of such requests to the extent permitted by law.</p>

      <h2>20. Notices and Electronic Communications</h2>
      <p><strong>20.1 Electronic Notices to You.</strong> Tefillah may provide notices, disclosures, and other communications to you by: (a) posting them on the Services; (b) sending an email to the address associated with your Account; or (c) sending in-app notifications. Such electronic communications satisfy any legal requirement that communications be in writing, to the maximum extent permitted by Applicable Law.</p>
      <p><strong>20.2 Notices to Tefillah.</strong> All legal notices to Tefillah must be submitted in writing via email to <a href="mailto:admin@tefillah.in">admin@tefillah.in</a> (or such other address as Tefillah may publish from time to time) and will be deemed received when delivery is confirmed.</p>
      <p><strong>20.3 Consent to Electronic Communications.</strong> By creating an Account or using the Services, you consent to receiving communications from Tefillah electronically, including for marketing purposes (subject to your opt-out rights under Applicable Law).</p>

      <h2>21. Export Controls and International Use</h2>
      <p>The Services may be subject to export control laws and regulations of India and other applicable jurisdictions. You agree not to export, re-export, or transfer the Services or any related technology in violation of any such laws. The Services may not be available in all regions; you are solely responsible for compliance with all local laws and regulations applicable to your use of the Services in your jurisdiction.</p>

      <h2>22. Accessibility</h2>
      <p>Tefillah strives to make the Services accessible to all Users, including those with disabilities, consistent with Applicable Law. If you experience any accessibility barrier, please contact <a href="mailto:admin@tefillah.in">admin@tefillah.in</a> and Tefillah will use commercially reasonable efforts to accommodate your needs.</p>

      <h2>23. Changes to These Terms</h2>
      <p>Tefillah reserves the right to modify, update, or replace these Terms at any time. Material changes will be communicated to you by: (a) posting a notice on the Services; (b) sending an email to the address associated with your Account; and/or (c) in-app notification. Your continued access to or use of the Services after the effective date of any revised Terms constitutes your binding acceptance of those revised Terms. If you do not agree to the revised Terms, you must immediately cease using the Services and delete your Account.</p>

      <h2>24. Miscellaneous</h2>
      <p><strong>24.1 Severability.</strong> If any provision of these Terms is held by a court or arbitrator of competent jurisdiction to be invalid, unlawful, or unenforceable, that provision shall be modified to the minimum extent necessary to make it enforceable, or if modification is not possible, it shall be severed from these Terms. The remaining provisions shall continue in full force and effect.</p>
      <p><strong>24.2 No Waiver.</strong> Tefillah's failure to enforce or exercise any right, provision, or remedy under these Terms shall not constitute a waiver of that right, provision, or remedy, and shall not prevent Tefillah from exercising that right, provision, or remedy at any time in the future.</p>
      <p><strong>24.3 Assignment.</strong> Tefillah may assign, transfer, or novate any or all of its rights and obligations under these Terms — including in connection with a merger, acquisition, restructuring, or sale of assets — without your prior consent. You may not assign, transfer, or delegate any of your rights or obligations under these Terms without Tefillah's prior written consent, and any purported assignment without such consent is void.</p>
      <p><strong>24.4 Force Majeure.</strong> Tefillah shall not be liable for any failure or delay in performing its obligations under these Terms to the extent that such failure or delay is caused by circumstances beyond its reasonable control, including acts of God, natural disasters, war, civil unrest, government actions, cyberattacks, telecommunications failures, or power outages.</p>
      <p><strong>24.5 Relationship of the Parties.</strong> Nothing in these Terms shall create, or be deemed to create, a partnership, joint venture, agency, or employment relationship between you and Tefillah. You have no authority to bind Tefillah in any way.</p>
      <p><strong>24.6 Rights Reserved.</strong> All rights not expressly granted to you in these Terms are reserved by Tefillah.</p>
      <p><strong>24.7 Language.</strong> These Terms are drafted and shall be interpreted in the English language. Any translation is provided for convenience only; in the event of any inconsistency between the English version and a translated version, the English version shall prevail.</p>

      <h2>25. Mandatory Local Rights</h2>
      <p>These Terms do not intend to limit, restrict, or exclude any statutory rights you may have under mandatory provisions of Applicable Law that cannot be contracted out of. To the extent any provision of these Terms conflicts with a mandatory statutory right that cannot be waived, such provision shall be deemed modified to the minimum extent required to comply with that law, and the remaining provisions shall remain in full force and effect.</p>

      <h2>26. Contact Information</h2>
      <p>For questions, legal notices, or any other correspondence regarding these Terms or the Services:</p>
      <ul>
        <li><strong>General Support:</strong> <a href="mailto:admin@tefillah.in">admin@tefillah.in</a></li>
        <li><strong>Grievance Officer / Legal Notices:</strong> <a href="mailto:grievance@tefillah.in">grievance@tefillah.in</a></li>
      </ul>
      <p>Tefillah will use commercially reasonable efforts to respond to all legitimate inquiries within a reasonable time.</p>

      <hr style={{ margin: '2.5rem 0', border: 'none', borderTop: '1px solid var(--color-border)' }} />
      <p className="text-xs italic" style={{ color: 'var(--color-text-muted)' }}>
        This document has been prepared as a comprehensive template for informational purposes. It does not constitute legal advice. Tefillah strongly recommends that these Terms be reviewed and tailored by qualified legal counsel experienced in the laws of all jurisdictions in which the Services are made available, having regard to Tefillah's specific operational practices, regulatory environment, and risk profile. Particular attention should be given to compliance with the Information Technology Act, 2000, the Digital Personal Data Protection Act, 2023, and all other applicable Indian and international legislation.
      </p>
    </LegalLayout>
  );
}
