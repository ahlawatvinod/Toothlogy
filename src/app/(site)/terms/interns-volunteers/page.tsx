/**
 * TL-PAGE-TERMS-INTERNS-001 — /terms/interns-volunteers
 *
 * The terms for people who take part as interns or volunteers, including the
 * dental-college recruitment and camp operating model: who may take part, the
 * scope a dental student or dental intern works within, how camps are
 * organized, and what may never be claimed.
 *
 * Two honesty rules run through the document and must survive every edit
 * (Constitution P9):
 *
 * - **Nothing implies endorsement.** A permission, an approval, a collaboration
 *   or a venue is not an endorsement — not by a government authority, not by a
 *   dental college — of Toothlogy, its commercial activities, dentists,
 *   vendors, products or services. The four ways an activity may be organized
 *   are named separately and never merged.
 * - **Nothing is promised that no arrangement provides.** No employment, no
 *   academic credit, no professional authorization, no insurance or stipend,
 *   unless the applicable written agreement actually says so.
 *
 * Section 14 is the clinical line: an intern or volunteer never diagnoses,
 * prescribes or performs a procedure outside their lawful scope, and never
 * presents themselves as a qualified independent dentist.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert } from '@/design-system';

export const metadata: Metadata = {
  title: 'Terms for Interns & Volunteers',
  description:
    'The terms for Toothlogy interns, volunteers, dental students and dental interns: eligibility and college coordination, scope of practice and supervision, dental camps and community programmes, government permissions, patient consent, safety, records, certificates and conduct.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/terms/interns-volunteers' },
};

const LAST_UPDATED = 'September 12, 2026';

const ROLES = [
  ['Intern', 'a person taking part in an educational, professional-development, training or project-based opportunity with Toothlogy.'],
  ['Volunteer', 'a person taking part voluntarily in community activities, awareness campaigns, events, dental-care initiatives, social programmes, outreach or other approved Toothlogy initiatives.'],
  ['Dental student', 'a student enrolled at a recognised dental college or institution, whose permitted activities depend on their academic stage, training and supervision.'],
  ['Dental intern', 'a person undertaking a dental internship under the requirements of their institution and the applicable professional regulations.'],
  ['Qualified dentist', 'a dental professional lawfully qualified and registered to examine, diagnose, prescribe and treat.'],
  ['Faculty or clinical supervisor', 'a qualified professional appointed by a college, hospital or Toothlogy to supervise participants during an activity.'],
  ['Toothlogy coordinator', 'the authorised Toothlogy representative responsible for a programme, camp or activity.'],
  ['Government or public authority', 'a local government body, health department, municipal authority, district administration or other public authority.'],
  ['Partner institution', 'a dental college, institution, hospital, NGO, community organisation or other authorised body taking part in an activity.'],
];

const HOW_ORGANISED = [
  ['Organized by Toothlogy', 'Toothlogy plans and runs the activity itself, at a venue it has arranged.'],
  ['Conducted with government permission or support', 'Toothlogy runs the activity, and a government or public authority has given the permission, authorisation or support required for it.'],
  ['Conducted in collaboration with government authorities', 'a government or public authority takes part in organising or delivering the activity alongside Toothlogy, within the scope agreed for it.'],
  ['Conducted with a partner institution', 'a dental college, hospital, NGO, community organisation or other authorised body takes part, within the scope agreed for it.'],
];

const COLLEGE_CONDITIONS = [
  'Approval by the college or institution, where its approval is required.',
  'Student eligibility for the activity.',
  'Verification of identity and of academic or internship status.',
  'Permission from the relevant authority.',
  'Programme-specific requirements.',
  'Applicable professional and healthcare regulations.',
];

const COORDINATION = [
  'Student recruitment.',
  'Internship opportunities.',
  'Volunteer programmes.',
  'Camp deployment.',
  'Training.',
  'Attendance.',
  'Certificates.',
  'Faculty or professional supervision.',
  'Academic or community-service activities, where approved.',
  'Programme reporting.',
];

const RESPONSIBILITIES = [
  'Dental awareness and community outreach.',
  'Event and campaign support.',
  'Administrative assistance.',
  'Research and documentation.',
  'Digital and social-media support.',
  'Content creation.',
  'Data collection.',
  'Survey assistance.',
  'Event coordination.',
  'Communication and public-awareness activities.',
  'Supporting Toothlogy campaigns and initiatives.',
  'Other activities specifically assigned by an authorised Toothlogy representative.',
];

const CLINICAL_CONDITIONS = [
  'Within the participant’s lawful scope.',
  'Under appropriate supervision, where supervision is required.',
  'According to the camp protocol.',
  'With the appropriate patient consent.',
  'Under the direction of qualified or authorised dental professionals, or of the relevant authority where applicable.',
];

const CAMP_TYPES = [
  'Dental screening camps.',
  'Oral-health awareness camps.',
  'Dental education programmes.',
  'Community outreach.',
  'School and community oral-health programmes.',
  'Preventive dental-health initiatives.',
  'Public-health awareness campaigns.',
  'Referral and follow-up programmes.',
];

const NEVER_INDEPENDENTLY = [
  'Diagnose a patient.',
  'Recommend medical or dental treatment.',
  'Prescribe medicines.',
  'Perform dental procedures.',
  'Provide professional clinical advice.',
  'Handle clinical procedures without appropriate authorisation and supervision.',
];

const CONSENT_NEVER = [
  'Perform unauthorised procedures.',
  'Collect unnecessary personal or health information.',
  'Photograph patients without appropriate authorisation.',
  'Publish patient information on social media.',
  'Share patient records.',
  'Promise a particular treatment outcome.',
  'Diagnose beyond their permitted scope.',
  'Prescribe medicines unless legally authorised.',
];

const SAFETY = [
  'Venue safety.',
  'Infection-control requirements.',
  'Personal protective equipment, where applicable.',
  'Safe handling of instruments and equipment.',
  'Waste disposal.',
  'Emergency escalation.',
  'Incident reporting.',
  'Crowd management.',
  'Patient privacy.',
  'Following the instructions of qualified supervisors and authorised authorities.',
];

const CAMP_CONDUCT = [
  'Be punctual.',
  'Wear the required identification and personal protective equipment.',
  'Follow camp protocols.',
  'Respect patients and community members.',
  'Follow supervisor instructions.',
  'Maintain professional communication.',
  'Protect patient confidentiality.',
  'Avoid discrimination and harassment.',
  'Avoid unauthorised photography or video.',
  'Avoid collecting personal contacts for private purposes.',
  'Avoid accepting unauthorised money or gifts from patients.',
  'Avoid making personal commercial offers during camps.',
  'Avoid using the camp to promote unrelated businesses or services.',
];

const IDENTIFICATION = [
  'Volunteer ID cards.',
  'Intern IDs.',
  'Camp badges.',
  'Uniforms or T-shirts.',
  'Certificates.',
  'Authorisation letters.',
  'Programme-specific identification.',
];

const NEVER_CLAIM = [
  'Government employees.',
  'Government representatives.',
  'Official representatives of a government department.',
  'Qualified dentists, unless legally qualified and authorised.',
  'Authorised spokespersons of Toothlogy, unless specifically appointed.',
];

const CONFIDENTIALITY = [
  'Share confidential information with unauthorised persons.',
  'Copy or download information unnecessarily.',
  'Publish internal information online.',
  'Use confidential information for personal benefit.',
  'Sell, transfer or disclose participant or patient information.',
  'Access information unrelated to their assigned responsibilities.',
];

const SOCIAL_MEDIA = [
  'Claim to be an official spokesperson without authorisation.',
  'Publish confidential information.',
  'Make misleading healthcare claims.',
  'Misrepresent Toothlogy’s campaigns or services.',
  'Suggest that a government authority or a dental college endorses Toothlogy, a dentist, a vendor, a product or a service.',
  'Damage or misuse Toothlogy’s brand.',
  'Publish offensive, discriminatory, defamatory or unlawful content while representing, or appearing to represent, Toothlogy.',
];

const PROGRAMME_RECORDS = [
  'Number of participants.',
  'Number of people reached.',
  'Screening and awareness activity counts.',
  'Referral counts.',
  'Camp attendance.',
  'Geographic and programme information.',
  'Training participation.',
  'Volunteer hours.',
];

const CREDENTIALS = [
  'Share passwords.',
  'Allow another person to use their account.',
  'Attempt unauthorised access.',
  'Access restricted information.',
  'Circumvent security controls.',
  'Copy or extract data without authorisation.',
];

const CERTIFICATE_BASIS = [
  'Internship completion.',
  'Volunteer participation.',
  'Camp participation.',
  'The number or duration of approved activities.',
  'Training completion.',
  'Project completion.',
  'Performance or contribution.',
];

const CONDUCT = [
  'Treat everyone with dignity and respect.',
  'Follow lawful instructions.',
  'Maintain professional behaviour.',
  'Respect patient confidentiality.',
  'Follow event and safety procedures.',
  'Avoid conflicts of interest.',
  'Protect Toothlogy property and information.',
  'Avoid harassment, bullying, discrimination, intimidation or abusive behaviour.',
  'Follow applicable laws and regulations.',
];

const TERMINATION_GROUNDS = [
  'Serious misconduct.',
  'Breach of confidentiality.',
  'Misuse of patient information.',
  'Fraud or misrepresentation.',
  'Unauthorised medical practice.',
  'Harassment or abusive conduct.',
  'Security violations.',
  'Theft or misuse of property.',
  'Violation of law.',
  'Serious breach of these Terms.',
];

const COMPLIANCE = [
  'Applicable Indian laws.',
  'Applicable professional and healthcare regulations.',
  'Institutional requirements of the participating college, hospital or organisation.',
  'Government permissions, authorisations and conditions that apply to the activity.',
  'Patient-consent requirements.',
  'Public-health and safety requirements.',
];

const ACKNOWLEDGEMENT = [
  'You have read and understood these Terms.',
  'You agree to follow Toothlogy’s policies, camp protocols and lawful instructions, including those of a designated supervisor.',
  'You will protect confidential and personal information, and patient privacy.',
  'You will operate only within your authorised role, training and lawful scope.',
  'You will not provide unauthorised dental or medical advice, diagnosis, prescription or treatment.',
  'You will not present yourself as a government employee or representative, as a qualified dentist unless you are one, or as a spokesperson for Toothlogy unless appointed.',
  'You will not use a camp, a programme, patient information or Toothlogy resources to solicit patients or promote private services.',
  'You will follow the applicable safety, infection-control and emergency procedures.',
  'You understand that participation does not automatically create an employment relationship, academic credit, professional authorisation, insurance cover or a guarantee of future employment.',
];

function List({ items, label }: { items: readonly string[]; label: string }) {
  return (
    <ul aria-label={label}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function Definitions({ items, label }: { items: ReadonlyArray<readonly [string, string]> | string[][]; label: string }) {
  return (
    <dl aria-label={label}>
      {(items as ReadonlyArray<readonly [string, string]>).map(([term, meaning]) => (
        <div key={term}>
          <dt>
            <strong>{term}</strong>
          </dt>
          <dd>{meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function InternsVolunteersTermsPage() {
  return (
    <div className="tl-container tl-page" style={{ maxWidth: '48rem' }}>
      <header className="tl-page__header">
        <h1>Terms &amp; Conditions for Interns &amp; Volunteers</h1>
        <p className="tl-muted">Last updated: {LAST_UPDATED}</p>
        <p className="tl-page__lead">
          These Terms &amp; Conditions (“Terms”) apply to individuals participating as Interns or
          Volunteers with Toothlogy (“Toothlogy”, “we”, “our”, or “us”), including dental students and
          dental interns taking part through a recognised dental college or institution. By applying,
          registering, accepting an internship or volunteer opportunity, or participating in a
          Toothlogy activity, campaign, project, dental awareness programme, screening camp, event or
          community initiative, you agree to comply with these Terms.
        </p>
      </header>

      <div className="tl-prose">
        <p>
          These Terms establish clear expectations regarding eligibility, scope of participation,
          supervision, conduct, confidentiality, patient consent, safety, intellectual property,
          communications and recognition.
        </p>
        <p>
          This is the role-specific document for interns and volunteers. It supplements the{' '}
          <Link href="/terms">Toothlogy Master Terms &amp; Conditions</Link>, which govern everyone in
          the ecosystem and which apply to you as well — see §53 and §84 of that document for how the
          two fit together, and the <Link href="/privacy">Privacy Policy</Link> for how information is
          handled. Where this document is stricter, it applies in addition; where it is silent, the
          Master Terms apply.
        </p>

        <h2 id="roles-heading">Who these Terms refer to</h2>
        <p>These Terms distinguish between the following, and the distinction matters throughout:</p>
        <Definitions items={ROLES} label="Roles" />
      </div>

      <section aria-labelledby="part-a" className="tl-prose">
        <h2 id="part-a">Part A — Participation, colleges and scope</h2>

        <h3>1. Eligibility</h3>
        <p>
          Interns and Volunteers must provide accurate information during registration or application.
          Depending on the activity, Toothlogy may establish specific eligibility requirements relating
          to age, education, skills, experience, location, availability, academic stage or other
          qualifications.
        </p>
        <p>
          Where a participant is a minor, appropriate parent or guardian consent may be required.
          Toothlogy reserves the right to verify information provided by applicants where reasonably
          necessary.
        </p>

        <h3>2. Nature of participation</h3>
        <p>
          An Intern participates in an educational, professional-development, training or project-based
          opportunity. A Volunteer participates voluntarily in community activities, awareness
          campaigns, events, dental-care initiatives, social programmes, outreach activities or other
          approved Toothlogy initiatives.
        </p>
        <p>
          Unless expressly stated in a separate written agreement, participation does not automatically
          create an employment relationship, partnership, agency relationship, government appointment
          or guarantee of future employment. Internship compensation, stipend, certification, duration,
          working arrangements and other conditions, where applicable, will be communicated separately.
        </p>

        <h3>3. Registration and application</h3>
        <p>
          Interns and Volunteers must provide truthful information relating to their identity,
          education, experience, skills, availability and other relevant details.
        </p>
        <p>
          Providing false information, forged documents, impersonating another person or misrepresenting
          qualifications may result in immediate termination of participation. Toothlogy may reject or
          discontinue an application or participation opportunity at its discretion, subject to
          applicable law.
        </p>

        <h3>4. Recruitment from dental colleges and institutions</h3>
        <p>
          Toothlogy may recruit, onboard, train, coordinate and deploy dental students, Interns,
          Volunteers and other eligible participants, including by inviting students and interns from
          recognised dental colleges and institutions to take part in approved programmes such as
          dental awareness programmes, oral-health campaigns, dental screening camps, community
          outreach, educational activities and public-health initiatives.
        </p>
        <p>Participation may be subject to:</p>
        <List items={COLLEGE_CONDITIONS} label="Conditions of participation through a college" />
        <p>
          Where required, Toothlogy may coordinate with the student’s college, faculty, internship
          coordinator, department, hospital or other authorised institutional representative.
        </p>

        <h3>5. Institutional coordination</h3>
        <p>
          Toothlogy may coordinate with recognised dental colleges and institutions in relation to:
        </p>
        <List items={COORDINATION} label="Areas of institutional coordination" />
        <p>
          Any academic credit, internship credit, attendance recognition or institutional certification
          is provided only where the relevant institution has formally approved it.
        </p>

        <h3>6. Institutional approval is not endorsement</h3>
        <p>
          Participation through a dental college or institution does not mean that the college endorses
          Toothlogy or any of its services, products, commercial activities, dentists, vendors or
          campaigns.
        </p>
        <p>
          Where an institution formally collaborates with Toothlogy, the scope of that collaboration is
          defined separately through an appropriate agreement, memorandum of understanding or
          authorisation, and nothing beyond that scope may be represented as agreed.
        </p>

        <h3>7. Roles and responsibilities</h3>
        <p>
          Interns and Volunteers must perform assigned responsibilities honestly, responsibly and
          professionally. Depending on the programme, responsibilities may include:
        </p>
        <List items={RESPONSIBILITIES} label="Possible responsibilities" />
        <p>
          Participants should complete assigned tasks within agreed timelines and communicate promptly
          when they are unable to do so.
        </p>

        <h3>8. Scope of a dental student or dental intern</h3>
        <p>
          What a participant may do depends on their qualification, training, academic status,
          authorisation, supervision and applicable law. Dental students and dental interns must operate
          only within the scope permitted to them.
        </p>
        <p>
          A participant must not represent themselves as a fully qualified independent Dentist merely
          because they are taking part in a Toothlogy camp or programme.
        </p>
        <p>Where clinical activities are permitted, they may be performed only:</p>
        <List items={CLINICAL_CONDITIONS} label="Conditions for permitted clinical activity" />
      </section>

      <section aria-labelledby="part-b" className="tl-prose">
        <h2 id="part-b">Part B — Dental camps and community programmes</h2>

        <h3>9. Dental camps and community programmes</h3>
        <p>Toothlogy may organize or take part in:</p>
        <List items={CAMP_TYPES} label="Types of camp and programme" />
        <p>
          Camps may be conducted at dental colleges, schools, community centres, government facilities,
          hospitals, public locations or other approved venues. The activities available at a particular
          camp may vary depending on location, permissions, the professionals present, facilities,
          equipment and applicable regulations.
        </p>

        <h3>10. How an activity is organized</h3>
        <p>
          Toothlogy activities fall into the following categories, which are not interchangeable. Each
          camp or programme states which applies to it:
        </p>
        <Definitions items={HOW_ORGANISED} label="How an activity may be organized" />
        <p>
          Not every Toothlogy camp is government-operated or government-sponsored, and none should be
          described as such unless it is.
        </p>

        <h3>11. Government permission and support</h3>
        <p>
          Toothlogy may conduct certain camps and community programmes with prior permission,
          authorisation, coordination, support or participation from relevant local government or public
          authorities, where required.
        </p>
        <p>
          Such permission, support or participation does not imply that any government authority
          endorses Toothlogy, its commercial activities, individual Dentists, Vendors, products or
          services, unless an official endorsement or arrangement actually exists. Where applicable,
          Toothlogy may maintain documentation relating to permissions, approvals, letters, memoranda of
          understanding, institutional permissions or other authorisations.
        </p>

        <h3>12. Government and public-health programmes</h3>
        <p>
          Toothlogy may take part in public-health or community programmes with government departments
          or public authorities. Participants must follow the rules, safety requirements, reporting
          procedures and instructions applicable to the specific programme.
        </p>
        <p>
          Taking part in a government-supported activity does not make an Intern or Volunteer a
          government employee or a government representative.
        </p>

        <h3>13. Supervision</h3>
        <p>
          Toothlogy may designate qualified Dentists, faculty members, clinical supervisors, camp
          coordinators or other authorised professionals to supervise participants where required.
        </p>
        <p>
          Interns and Volunteers must follow lawful instructions and must immediately refer any clinical
          or medical question outside their permitted scope to the appropriate qualified professional.
        </p>

        <h3>14. No unauthorised medical practice</h3>
        <p>
          Interns and Volunteers must not represent themselves as Dentists, doctors, healthcare
          professionals or authorised dental practitioners unless they are legally qualified and
          authorised to do so. Interns and Volunteers must not independently:
        </p>
        <List items={NEVER_INDEPENDENTLY} label="Never done independently" />
        <p>
          Dental screening, awareness, surveys, camps and other healthcare-related activities may be
          conducted only within the participant’s lawful role and training, and the instructions of
          authorised professionals.
        </p>

        <h3>15. Patient consent and participant conduct</h3>
        <p>
          Participants must respect patient autonomy, privacy, dignity and confidentiality. Before any
          activity requiring consent, the appropriate consent process must be followed.
        </p>
        <p>Participants must not:</p>
        <List items={CONSENT_NEVER} label="Conduct that is not permitted" />

        <h3>16. Patient referral and follow-up</h3>
        <p>
          Where a camp identifies a potential dental issue, participants may assist with referral or
          follow-up coordination according to the camp protocol.
        </p>
        <p>
          Interns and Volunteers must not independently determine a patient’s treatment plan unless they
          are legally authorised and acting within their professional scope. Any diagnosis or treatment
          recommendation requiring a qualified Dentist must be referred to the appropriate Dentist or
          professional.
        </p>

        <h3>17. Emergency situations</h3>
        <p>
          Participants must immediately escalate serious medical or dental emergencies to qualified
          professionals, emergency services, the designated camp supervisor or the relevant authority,
          according to the camp’s emergency protocol.
        </p>
        <p>
          Interns and Volunteers must not attempt procedures beyond their training or lawful authority,
          including in an emergency.
        </p>

        <h3>18. Camp safety</h3>
        <p>Participants must follow the requirements applicable to the activity, covering:</p>
        <List items={SAFETY} label="Safety requirements" />
        <p>
          Participants must immediately report accidents, injuries, unsafe conditions or serious patient
          incidents to the designated Toothlogy coordinator or supervisor, and must not undertake
          activities outside their assigned role or training merely to complete a task.
        </p>

        <h3>19. Conduct during camps</h3>
        <p>During a camp or community programme, participants must:</p>
        <List items={CAMP_CONDUCT} label="Conduct during camps" />

        <h3>20. No personal solicitation</h3>
        <p>
          Interns and Volunteers must not use a Toothlogy camp, a government-supported programme, a
          dental-college programme, patient information or Toothlogy resources to independently solicit
          patients, sell products, promote private services, collect money or generate unauthorised
          leads. This applies during an activity and afterwards, to information or contacts obtained
          through it.
        </p>

        <h3>21. Travel and field deployment</h3>
        <p>
          Toothlogy may deploy Interns and Volunteers to approved camp locations. Where applicable,
          travel arrangements, accommodation, meals, reimbursements, transportation, reporting time and
          other logistical conditions are communicated separately for each programme.
        </p>
        <p>
          Taking part in a field activity is subject to the participant’s acceptance of the relevant
          programme conditions.
        </p>

        <h3>22. Identification and representation</h3>
        <p>Toothlogy may issue:</p>
        <List items={IDENTIFICATION} label="Identification Toothlogy may issue" />
        <p>
          Participants may represent themselves as Toothlogy Interns or Volunteers only during
          authorised activities, and only within the role assigned to them. They must not claim to be:
        </p>
        <List items={NEVER_CLAIM} label="Claims that are never permitted" />
      </section>

      <section aria-labelledby="part-c" className="tl-prose">
        <h2 id="part-c">Part C — Information, records and recognition</h2>

        <h3>23. Confidentiality</h3>
        <p>
          During participation, Interns and Volunteers may receive access to confidential information
          relating to Toothlogy, its Users, Dentists, Clinics, Vendors, employees, projects, campaigns,
          business plans, technology, databases, documents, communications or operations. Participants
          must keep such information confidential and must not:
        </p>
        <List items={CONFIDENTIALITY} label="Confidentiality obligations" />
        <p>
          These confidentiality obligations continue after the internship or volunteer engagement ends,
          subject to applicable law.
        </p>

        <h3>24. Personal and health information</h3>
        <p>
          Interns and Volunteers may encounter personal information during campaigns, registrations,
          surveys, appointments, dental camps or other activities. Such information must be handled only
          for authorised purposes and in accordance with the{' '}
          <Link href="/privacy">Toothlogy Privacy Policy</Link> and applicable privacy and
          data-protection laws.
        </p>
        <p>
          Participants must not photograph, record, copy, publish or share patient information, medical
          records, dental photographs, phone numbers, addresses or other personal information without
          appropriate authorisation.
        </p>

        <h3>25. Photography, video and social media</h3>
        <p>
          Toothlogy may conduct events, campaigns, awareness programmes, dental camps and training
          sessions where photographs or videos may be created. Participants must follow Toothlogy’s
          instructions regarding photography, recording, publication and social-media use.
        </p>
        <p>
          Interns and Volunteers must not independently publish photographs, videos, patient stories,
          testimonials or identifiable information relating to Toothlogy activities without appropriate
          authorisation and consent.
        </p>

        <h3>26. Social-media conduct</h3>
        <p>Interns and Volunteers must not make unauthorised statements on behalf of Toothlogy. They must not:</p>
        <List items={SOCIAL_MEDIA} label="Social-media restrictions" />
        <p>
          Authorised social-media activities must follow the communication guidelines provided by
          Toothlogy.
        </p>

        <h3>27. Programme data and reporting</h3>
        <p>Toothlogy may maintain programme-level records such as:</p>
        <List items={PROGRAMME_RECORDS} label="Programme-level records" />
        <p>
          Any personal or health information is handled according to the{' '}
          <Link href="/privacy">Privacy Policy</Link> and applicable law. Where reports are shared with
          government authorities, dental colleges, donors, partners or other authorised organisations,
          Toothlogy uses appropriate safeguards and discloses only the information permitted for that
          purpose.
        </p>

        <h3>28. Property, resources and credentials</h3>
        <p>
          Participants may receive equipment, identification cards, software, documents, accounts,
          uniforms, campaign materials, devices or other resources. These must be used responsibly and
          only for authorised activities, and returned when requested or when participation ends.
        </p>
        <p>
          Where Toothlogy provides an account, dashboard, email address, application access, login
          credentials or other digital access, the participant must keep credentials secure. Participants
          must not:
        </p>
        <List items={CREDENTIALS} label="Credential rules" />
        <p>Toothlogy may suspend access where necessary for security or operational reasons.</p>

        <h3>29. Intellectual property</h3>
        <p>
          Materials, documents, designs, content, research, software, reports, campaign materials,
          presentations, photographs, databases, concepts or other work specifically created for
          Toothlogy as part of an assigned internship or volunteer activity may be subject to
          Toothlogy’s intellectual-property rights, depending on the applicable agreement and law.
        </p>
        <p>
          Participants must not commercially reproduce, sell, licence, distribute or publish proprietary
          Toothlogy materials without authorisation. Where a separate internship, project or volunteer
          agreement contains intellectual-property provisions, that agreement applies.
        </p>

        <h3>30. Certificates and recognition</h3>
        <p>
          Toothlogy may issue internship certificates, volunteer certificates, camp-participation
          certificates, letters of appreciation, badges, awards or recommendations, at its discretion
          and subject to the applicable requirements. Recognition may be based on:
        </p>
        <List items={CERTIFICATE_BASIS} label="Basis for a certificate" />
        <p>
          A certificate describes the participant’s role accurately. It does not imply a professional
          qualification, a government appointment, a dental licence, clinical authorisation or
          employment. Where an internship certificate is connected to an academic requirement, the
          relevant dental college’s or institution’s requirements and approval apply.
        </p>
        <p>
          Toothlogy may refuse or withdraw recognition in cases involving fraud, misconduct, serious
          violations or failure to meet the applicable participation requirements.
        </p>
      </section>

      <section aria-labelledby="part-d" className="tl-prose">
        <h2 id="part-d">Part D — Commitment, conduct and general terms</h2>

        <h3>31. Attendance and commitment</h3>
        <p>
          Interns are expected to follow their agreed schedule, working hours, project timelines,
          meetings and training requirements. Volunteers participate according to the availability and
          commitment agreed for the relevant campaign or activity.
        </p>
        <p>
          Participants should notify the designated coordinator as early as reasonably possible if they
          cannot attend an assigned activity. Repeated unexplained absence or failure to complete
          responsibilities may result in discontinuation of participation.
        </p>

        <h3>32. Code of conduct</h3>
        <p>All Interns and Volunteers must:</p>
        <List items={CONDUCT} label="Code of conduct" />
        <p>
          Threatening, abusive, discriminatory, fraudulent, sexually inappropriate, violent or otherwise
          unlawful conduct may result in immediate termination of participation.
        </p>

        <h3>33. Conflict of interest</h3>
        <p>
          Interns and Volunteers should disclose any situation that may create a conflict between their
          personal interests and their responsibilities with Toothlogy, and must not use their position,
          access, contacts, patient information or Toothlogy resources for unauthorised personal
          commercial benefit.
        </p>

        <h3>34. Gifts, payments and personal benefits</h3>
        <p>
          Participants must not request or improperly accept money, gifts, commissions, favours or
          personal benefits from patients, Dentists, Clinics, Vendors, sponsors, partners or other
          persons because of their Toothlogy role. Any approved compensation, reimbursement, stipend or
          incentive is governed by the applicable programme or written agreement.
        </p>

        <h3>35. Insurance, benefits and liability</h3>
        <p>
          Toothlogy makes no general promise of insurance or other benefits. Any insurance, accident
          coverage, travel support, medical coverage, reimbursement, stipend or other benefit applies
          only where it is specifically communicated in the applicable internship, volunteer, camp or
          institutional agreement.
        </p>
        <p>
          Participants must comply with all applicable safety requirements, including those of the
          venue, the supervising professional and the relevant authority.
        </p>

        <h3>36. Expenses and reimbursement</h3>
        <p>
          Volunteers and Interns are responsible for their own expenses unless Toothlogy has expressly
          agreed in advance to reimburse a particular expense. Any reimbursement follows the applicable
          Toothlogy policy and may require receipts, prior approval and other documentation.
        </p>

        <h3>37. Communication</h3>
        <p>
          Toothlogy may communicate with Interns and Volunteers through email, phone, messaging
          applications, SMS, dashboards or other approved channels. Participants are expected to
          maintain accurate contact information and respond to important programme-related
          communications within a reasonable period.
        </p>

        <h3>38. Background verification</h3>
        <p>
          For certain roles, particularly those involving patient interaction, healthcare environments,
          access to sensitive information, children, community programmes or organisational resources,
          Toothlogy may conduct reasonable identity or background verification where permitted by law.
          Participation may be conditional upon satisfactory verification.
        </p>

        <h3>39. Complaints and reporting</h3>
        <p>
          Interns and Volunteers may report concerns relating to misconduct, harassment, safety,
          confidentiality, fraud, misuse of information or other violations to an authorised Toothlogy
          representative.
        </p>
        <p>
          Toothlogy may investigate reported concerns and take appropriate action in accordance with
          applicable law and internal policies. Participants must not knowingly submit false complaints
          or deliberately misuse reporting mechanisms.
        </p>

        <h3>40. Termination of participation</h3>
        <p>
          Either the participant or Toothlogy may end an internship or volunteer engagement, subject to
          the applicable programme or agreement. Toothlogy may immediately suspend or terminate
          participation where reasonably necessary because of:
        </p>
        <List items={TERMINATION_GROUNDS} label="Grounds for termination" />
        <p>
          Upon termination, participants must stop representing themselves as associated with Toothlogy
          and return or delete materials, identification and access credentials as instructed.
        </p>

        <h3>41. No guarantee of employment</h3>
        <p>
          Participation does not guarantee employment, permanent placement, professional certification,
          paid work, partnership or future engagement with Toothlogy. Any employment or paid engagement
          requires a separate offer, agreement or applicable written arrangement.
        </p>

        <h3>42. Limitation of authority</h3>
        <p>
          Interns and Volunteers are not authorised to make commitments, contracts, financial promises,
          medical representations, public statements or other binding commitments on behalf of
          Toothlogy, a government authority or a partner institution, unless specifically authorised in
          writing.
        </p>

        <h3>43. Privacy</h3>
        <p>
          The collection and use of personal information relating to Interns and Volunteers is governed
          by the <Link href="/privacy">Toothlogy Privacy Policy</Link> and applicable privacy laws.
          Participants should review the Privacy Policy before providing personal information.
        </p>

        <h3>44. Compliance with applicable law</h3>
        <p>
          All camp, programme and participation activities remain subject to:
        </p>
        <List items={COMPLIANCE} label="Applicable requirements" />

        <h3>45. Changes to these Terms</h3>
        <p>
          Toothlogy may update these Terms from time to time to reflect changes in its programmes,
          operations, technology or applicable laws. Updated Terms are published or communicated through
          appropriate channels, with a revised “Last updated” date.
        </p>

        <h3>46. Governing law</h3>
        <p>
          These Terms are governed by the applicable laws of India. Any dispute relating to
          participation with Toothlogy shall be handled through appropriate dispute-resolution
          mechanisms and the competent authorities or courts as applicable under Indian law.
        </p>

        <h3>47. Contact us</h3>
        <p>
          For questions, complaints, internship matters, volunteer matters, college coordination,
          privacy concerns or other issues relating to these Terms, please contact{' '}
          <a href="mailto:info@toothlogy.com">info@toothlogy.com</a>.
        </p>
      </section>

      <Alert tone="info" title="Participant acknowledgement">
        <p style={{ marginTop: 0 }}>
          By registering or participating as a Toothlogy Intern or Volunteer, you acknowledge that:
        </p>
        <List items={ACKNOWLEDGEMENT} label="Participant acknowledgement" />
      </Alert>

      <p className="tl-muted">© Toothlogy. All rights reserved.</p>
    </div>
  );
}
