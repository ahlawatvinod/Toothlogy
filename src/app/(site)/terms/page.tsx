/**
 * TL-PAGE-TERMS-001 — /terms
 *
 * The Toothlogy Master Terms & Conditions: one document for the whole
 * ecosystem, with role-specific sections (patients, dentists, clinics,
 * vendors, laboratories, colleges, students and interns, volunteers, partners)
 * inside a single legal framework, and a closing role matrix.
 *
 * Four honesty rules run through it and must survive every edit
 * (Constitution P9):
 *
 * - **No endorsement is implied.** A government permission, an institutional
 *   collaboration or a venue is not endorsement of Toothlogy, a dentist, a
 *   vendor, a product or a service. The ways an activity may be organized are
 *   named separately (§14) and never merged.
 * - **Nothing is promised that no arrangement provides**: no employment, no
 *   academic credit, no professional authorization, no insurance, stipend or
 *   reimbursement, unless a written agreement says so (§32–§34).
 * - **Toothlogy grants no licence.** It verifies and records; it does not
 *   confer professional authorization (§3, §35).
 * - **Nothing invented.** No registration details, legal address, phone
 *   number, grievance officer, approval or certification appears here unless
 *   the organization supplies it. Policies are linked only where they exist.
 *
 * Sections are numbered 1–50 as issued, so a clause can be cited by number,
 * and each carries a stable id for deep links and for a future acceptance
 * workflow.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Table } from '@/design-system';

export const metadata: Metadata = {
  title: 'Master Terms & Conditions',
  description:
    'The Toothlogy Master Terms & Conditions: one document for patients, dentists, clinics, hospitals, vendors, laboratories, dental colleges, students, interns, volunteers, partners and sponsors — covering accounts, appointments, the marketplace, camps, consent, privacy, safety, compliance and liability.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/terms' },
};

const LAST_UPDATED = 'September 12, 2026';
const EFFECTIVE_DATE = 'September 12, 2026';
const VERSION = '1.0';

/**
 * The single contact address for the legal documents. It lives here, and in the
 * privacy page's equivalent constant, so a change is one edit per document
 * rather than a search across prose.
 */
const CONTACT = 'info@toothlogy.com';

const PARTICIPANTS = [
  'Patients and Users',
  'Dentists',
  'Dental clinics',
  'Hospitals',
  'Dental colleges',
  'Dental students',
  'Dental interns',
  'Volunteers',
  'Vendors',
  'Manufacturers',
  'Distributors',
  'Laboratories',
  'Pharmacies, where legally permitted',
  'Service providers',
  'NGOs',
  'Government and public authorities',
  'Sponsors',
  'Partners',
  'Organizations',
  'Administrators and authorised representatives',
];

const DEFINITIONS: ReadonlyArray<readonly [string, string]> = [
  ['Toothlogy', 'the organization operating the Platform, and where the context requires, its authorised representatives.'],
  ['Platform', 'the Toothlogy website, mobile applications, marketplace, booking services, dashboards, APIs, digital tools and related services.'],
  ['User', 'any person who accesses or uses the Platform in any capacity.'],
  ['Patient', 'a User who seeks, requests or receives dental information, services or products through the Platform.'],
  ['Dentist', 'a dental professional lawfully qualified and registered to examine, diagnose, prescribe and treat, acting within their registration.'],
  ['Clinic', 'a dental practice or establishment listed on the Platform through its authorised representative.'],
  ['Hospital', 'a hospital or health facility listed on the Platform through its authorised representative.'],
  ['Vendor', 'a seller, supplier, manufacturer, distributor, retailer or other business listing or offering products or services through the Platform.'],
  ['Dental college', 'a recognised dental college or institution, including its departments, faculty and internship coordinators.'],
  ['Student', 'a dental student enrolled at a dental college, whose permitted activities depend on their academic stage, training and supervision.'],
  ['Intern', 'a person undertaking an internship with Toothlogy, or a dental intern participating through their institution under the applicable professional requirements.'],
  ['Volunteer', 'a person taking part voluntarily in an awareness, outreach, education or community activity, in a non-clinical role unless separately authorised.'],
  ['Camp', 'a dental screening, awareness, education, outreach or public-health activity organized by Toothlogy, or in which Toothlogy participates.'],
  ['Government Authority', 'a government department, health authority, municipal authority, district administration or other public authority.'],
  ['Partner', 'an organization taking part in a Toothlogy activity under an agreement, authorisation or memorandum of understanding.'],
  ['Sponsor', 'a person or organization funding or supporting an activity, campaign or programme.'],
  ['Service Provider', 'a laboratory, technology provider, logistics provider or other organization providing services to Toothlogy or through the Platform.'],
  ['Content', 'text, images, video, reviews, ratings, questions, answers, documents, listings and other material submitted to or published on the Platform.'],
  ['Personal Information', 'information relating to an identified or identifiable person.'],
  ['Health Information', 'health-related information, including dental concerns, history, reports, prescriptions, photographs, X-rays and scans.'],
  ['Appointment', 'a request for, or a confirmed booking of, a consultation or treatment with a Dentist or Clinic.'],
  ['Product', 'goods listed or sold through the marketplace.'],
  ['Service', 'a service offered through the Platform by Toothlogy, a Dentist, a Clinic, a Vendor or a Service Provider.'],
  ['Administrator', 'a person given administrative rights over an organization’s account on the Platform.'],
  ['Authorized Representative', 'the person lawfully entitled to act for an organization, institution or business on the Platform.'],
];

const ELIGIBILITY: ReadonlyArray<readonly [string, string]> = [
  ['Everyone', 'the minimum legal age that applies to the service; accurate information; and compliance with applicable law. Where a minor uses a service, the consent or authorisation of a parent, guardian or other legally authorised person is required where the law requires it.'],
  ['Patients', 'identity information sufficient for the service requested, and verification where a service requires it.'],
  ['Dentists', 'the professional qualification and registration required to practise, and identity verification. Toothlogy records and checks what is submitted; it does not grant qualification, registration or authorisation of any kind.'],
  ['Clinics and hospitals', 'facility and business information submitted by an authorised representative, and verification where required.'],
  ['Vendors', 'business verification, including registration, tax information, licences and other documentation appropriate to what is sold.'],
  ['Dental colleges', 'institutional verification, and authorisation from the person entitled to act for the institution.'],
  ['Students and interns', 'verification of identity and of academic or internship status, and the permission of the college or institution where its permission is required.'],
  ['Volunteers', 'identity and role verification appropriate to the activity.'],
  ['Partners, sponsors and authorities', 'organizational authorisation, and the government or institutional approval required for the activity.'],
];

const ACCOUNT_DUTIES = [
  'Provide accurate, current and complete information, and keep it updated.',
  'Keep login credentials confidential, and do not share or transfer an account.',
  'Do not create fraudulent or duplicate accounts, or impersonate another person or organization.',
  'Use only the account and role assigned to you, and only for its purpose.',
  'Tell Toothlogy promptly if you suspect unauthorised access.',
];

const PATIENT_DUTIES = [
  'Book appointments in good faith, arrive on time, and cancel or reschedule as early as possible.',
  'Give the information a Dentist or Clinic reasonably needs for safe care, including relevant dental and medical history.',
  'Upload reports, images, X-rays or scans only where they are your own, or where you are authorised to act for the person concerned.',
  'Communicate respectfully with Dentists, Clinics, staff and other Users.',
  'Pay the amounts due for a service you have received, as agreed with the Dentist, Clinic or Vendor.',
  'Give accurate delivery and billing information for a product order.',
  'Write reviews from genuine experience, without contact details, confidential information or medical claims about another person.',
  'Follow referral and follow-up instructions given by a qualified professional, or ask them if anything is unclear.',
];

const DENTIST_DUTIES: ReadonlyArray<readonly [string, string]> = [
  ['Profile and claims', 'Keep the professional profile accurate: name, qualification, registration, specialisation, experience, clinic affiliation and the services offered. Do not claim a qualification, specialisation, experience, award, certification, registration, affiliation or success rate that cannot be evidenced.'],
  ['Availability and appointments', 'Keep availability accurate; accept or decline requests promptly; avoid unnecessary cancellations; tell patients about changes; and provide the service the booking describes where reasonably possible.'],
  ['Clinical work', 'Examination, diagnosis, treatment planning, prescription and every clinical decision remain the Dentist’s own professional responsibility, exercised within their registration and applicable professional regulation.'],
  ['Consent and records', 'Obtain the patient consent the activity requires, and maintain clinical records as professional regulation requires.'],
  ['Patient confidentiality', 'Handle patient information confidentially, use it only for the care requested, and never for unauthorised marketing, sale or disclosure.'],
  ['Pricing', 'Communicate consultation fees, treatment charges, packages, discounts and taxes accurately. Treatment cost may depend on clinical examination; unless expressly stated, a listed price is not a guaranteed final cost.'],
  ['Advertising and conduct', 'Advertise truthfully, without misleading claims or guaranteed outcomes; behave professionally toward patients, staff, Vendors and Toothlogy representatives; and answer complaints properly.'],
  ['Compliance', 'Comply with the professional, healthcare, advertising, privacy and other laws and regulations that apply to dental practice.'],
];

const CLINIC_DUTIES = [
  'Register through an authorised representative, and keep facility, contact, service, pricing and availability information accurate.',
  'List only Dentists who actually practise at the facility, and confirm their practice honestly.',
  'Manage appointments responsibly, and inform patients about changes.',
  'Maintain patient records, confidentiality and data protection as applicable law and professional regulation require.',
  'Keep the facility safe, including infection control, equipment safety and clinical-waste handling.',
  'Ensure staff conduct is professional and non-discriminatory, and handle complaints properly.',
  'Hold and maintain the registrations, licences and approvals the facility requires.',
];

const VENDOR_DUTIES = [
  'Be legally permitted to sell or supply what is listed, and hold the licences, registrations and approvals required.',
  'Describe each product accurately: specification, brand or manufacturer, price, taxes, quantity, availability, images, warranty, expiry where applicable, shipping and return conditions.',
  'List only genuine, lawful, safe, unexpired and authorised products. Counterfeit, stolen, unauthorised, unsafe, expired or prohibited items are never permitted.',
  'Maintain inventory accuracy, dispatch within the stated time, package appropriately and provide tracking where applicable.',
  'Handle returns, replacements, refunds and warranty obligations as the listing, applicable law and consumer protection require.',
  'Respect intellectual property, and hold the rights to the images, text and brands used in a listing.',
  'Pay the applicable platform, listing, subscription, commission, transaction or advertising fees, which may be deducted from settlements as separately agreed.',
];

const LAB_DUTIES = [
  'Hold the qualification, registration or authorisation required for the work undertaken.',
  'Describe services, materials, quality standards and turnaround times accurately.',
  'Work only from a proper prescription or work order from an authorised professional.',
  'Handle patient information confidentially, and only as needed for the work.',
  'Communicate delays, deviations and defects promptly.',
  'Remain responsible for the services and products supplied, including quality and safety.',
  'Comply with the professional, product-safety and regulatory requirements that apply.',
];

const COLLEGE_SCOPE = [
  'Intern and volunteer recruitment.',
  'Dental awareness and community programmes.',
  'Dental camps.',
  'Training.',
  'Student participation.',
  'Faculty supervision.',
  'Internship opportunities.',
  'Certificates.',
  'Research and education initiatives, where appropriately authorised.',
];

const STUDENT_TERMS = [
  'Verification of identity and of academic or internship status, and the college’s permission where it is required.',
  'Eligibility for the particular programme, and its duration, location and attendance requirements.',
  'The duties assigned, the training given, and the supervision that applies.',
  'Professional conduct, respectful patient interaction and confidentiality at all times.',
  'Handling patient information only as authorised, and never photographing, copying, publishing or sharing it without authorisation.',
  'Following Toothlogy’s instructions on photography, recording and social media.',
  'Camp participation only within the role assigned and the supervision required.',
  'Certificates that describe the actual role; academic or internship credit only where the institution formally approves it.',
  'No guarantee of employment, paid work or future engagement.',
];

const VOLUNTEER_SUPPORT = [
  'Dental awareness.',
  'Community outreach.',
  'Camp registration.',
  'Non-clinical assistance.',
  'Public education.',
  'Event coordination.',
  'Data collection, where authorised.',
  'Patient navigation.',
  'Referral coordination.',
  'Campaign activities.',
];

const NEVER_INDEPENDENTLY = [
  'Diagnose.',
  'Prescribe.',
  'Perform dental procedures.',
  'Provide unauthorised medical or dental advice.',
  'Represent themselves as Dentists.',
  'Handle clinical responsibilities beyond their authorisation.',
];

const CAMP_TYPES = [
  'Dental screening camps.',
  'Oral-health awareness camps.',
  'Community dental programmes.',
  'School programmes.',
  'Public-health campaigns.',
  'Preventive dental programmes.',
  'Referral programmes.',
  'Follow-up programmes.',
  'Educational programmes.',
];

const CAMP_VENUES = [
  'Dental colleges.',
  'Schools.',
  'Government facilities.',
  'Hospitals.',
  'Community centres.',
  'Public venues.',
  'NGOs.',
  'Other authorised locations.',
];

const CAMP_VARIABLES = [
  'Location.',
  'Permissions.',
  'Facilities.',
  'The Dentists and professionals present.',
  'Government requirements.',
  'Institutional requirements.',
  'Safety requirements.',
  'Applicable laws.',
];

const HOW_ORGANISED: ReadonlyArray<readonly [string, string]> = [
  ['Organized by Toothlogy', 'Toothlogy plans and runs the activity itself, at a venue it has arranged.'],
  ['Conducted with government permission or support', 'Toothlogy runs the activity, and a Government Authority has given the permission, authorisation or support required for it.'],
  ['Conducted in collaboration with a Government Authority', 'a Government Authority takes part in organising or delivering the activity alongside Toothlogy, within the scope agreed for it.'],
  ['Conducted with a Partner institution', 'a dental college, hospital, NGO, community organization or other authorised body takes part, within the scope agreed for it.'],
];

const SUPERVISION_ROLES: ReadonlyArray<readonly [string, string]> = [
  ['Qualified Dentist', 'performs or directs clinical activity, and remains professionally responsible for it.'],
  ['Faculty member', 'supervises students of their institution, as the institution requires.'],
  ['Clinical supervisor', 'supervises the clinical part of an activity, where supervision is required.'],
  ['Camp coordinator', 'runs the activity on the ground: protocol, sequence, safety and records.'],
  ['Toothlogy representative', 'the authorised point of contact for the programme, and for escalation.'],
  ['Authorized public-health representative', 'where an authority takes part, the representative whose instructions apply to the activity.'],
];

const CONSENT_BEFORE = [
  'Screening.',
  'Examination.',
  'Clinical activity.',
  'Photography.',
  'Video recording.',
  'Data collection.',
  'Referral.',
  'Follow-up.',
  'Research or educational use.',
  'Publication.',
];

const PROTECTED_INFORMATION = [
  'Dental records.',
  'Health information.',
  'X-rays.',
  'Scans.',
  'Photographs.',
  'Reports.',
  'Prescriptions.',
  'Contact information.',
  'Address.',
  'Appointment information.',
];

const INCIDENTS = [
  'Dental emergencies.',
  'Medical emergencies.',
  'Patient injury.',
  'Student injury.',
  'Volunteer injury.',
  'Needlestick and instrument injuries.',
  'Infection-control incidents.',
  'Data breaches.',
  'Security incidents.',
  'Patient complaints.',
  'Serious adverse events.',
];

const SAFETY_REQUIREMENTS = [
  'Health and safety requirements.',
  'Infection-control procedures.',
  'Personal protective equipment.',
  'Instrument safety.',
  'Biomedical and clinical waste procedures.',
  'Venue safety.',
  'Emergency procedures.',
  'Public-health instructions.',
];

const CONTENT_PROHIBITED = [
  'Fake reviews and manipulated ratings.',
  'Defamation.',
  'Harassment.',
  'Confidential information, including another person’s health information.',
  'False or misleading medical claims.',
  'Copyright or trademark infringement.',
];

const ADVERTISING_NEVER = [
  'Government approval or endorsement.',
  'Professional endorsement by a body that has not given it.',
  'Guaranteed treatment results.',
  'Medical superiority over other professionals.',
];

const RECRUITMENT_CHANNELS = [
  'Dental colleges.',
  'Institutions.',
  'Online applications.',
  'Campaigns.',
  'Community organizations.',
  'Partner organizations.',
];

const NO_COMMERCIAL = [
  'Sales.',
  'Lead generation.',
  'Solicitation.',
  'Advertising.',
  'Private business promotion.',
  'Collection of money.',
  'Personal marketing.',
];

const IP_PROTECTED = [
  'The Toothlogy name, logo and brand.',
  'Software, the website and the Platform’s architecture.',
  'Databases and data compilations.',
  'Original content and designs.',
  'Campaign materials and documents.',
  'Training materials.',
  'Proprietary technology.',
];

const CONFIDENTIAL_CATEGORIES = [
  'Business information.',
  'Patient information.',
  'Health information.',
  'Vendor information.',
  'Dentist information.',
  'Internal documents.',
  'Campaign plans.',
  'Technology.',
  'Pricing.',
  'Partner information.',
];

const MINOR_CARE = [
  'School dental camps.',
  'Child patient records.',
  'Photography.',
  'Communication.',
  'Health information.',
  'Consent.',
];

const CERTIFICATE_TYPES = [
  'Internship certificates.',
  'Volunteer certificates.',
  'Camp participation certificates.',
  'Training certificates.',
  'Letters of appreciation.',
];

const CERTIFICATE_NEVER = [
  'A dental licence.',
  'A government appointment.',
  'Academic credit.',
  'A professional qualification.',
];

const DEPLOYMENT_TERMS = [
  'Travel arrangements.',
  'Accommodation.',
  'Meals.',
  'Transportation.',
  'Reimbursement.',
  'Stipend.',
  'Insurance or other coverage.',
];

const PROHIBITED = [
  'Fraud and identity theft.',
  'Impersonation, and fake professional credentials.',
  'Fake reviews and manipulated ratings.',
  'Unauthorised medical or dental practice.',
  'Misuse of patient information.',
  'Harassment and discrimination.',
  'Cyber abuse.',
  'Unauthorised access to accounts, APIs, databases or systems.',
  'Data scraping.',
  'Malware and harmful code.',
  'Copyright and trademark infringement.',
  'Counterfeit products.',
  'Illegal products or services.',
  'Unauthorised fundraising.',
  'Unauthorised solicitation.',
  'Misrepresentation of government affiliation.',
];

const ENFORCEMENT_ACTIONS = [
  'Suspend an account.',
  'Restrict features.',
  'Remove a listing.',
  'Remove or unpublish a profile.',
  'Suspend camp participation.',
  'Terminate a Vendor account.',
  'Terminate a Dentist profile.',
  'Terminate intern or volunteer participation.',
];

const ENFORCEMENT_GROUNDS = [
  'Fraud.',
  'Safety violations.',
  'Privacy violations.',
  'Unauthorised medical practice.',
  'Misrepresentation.',
  'Serious misconduct.',
  'Illegal activity.',
  'Security threats.',
  'Repeated violations.',
];

const COMPLAINT_SUBJECTS = [
  'Dentists.',
  'Clinics and hospitals.',
  'Vendors.',
  'Products.',
  'Appointments.',
  'Camps.',
  'Interns.',
  'Volunteers.',
  'Privacy.',
  'Payments.',
  'Content.',
];

const THIRD_PARTIES = [
  'Payment gateways.',
  'Maps.',
  'Messaging, email, SMS and WhatsApp providers.',
  'Analytics.',
  'Cloud hosting.',
  'Authentication.',
  'Government portals.',
  'College systems.',
  'Other integrations.',
];

const AVAILABILITY_EVENTS = [
  'Maintenance.',
  'Downtime.',
  'Network failures.',
  'Third-party outages.',
  'Security incidents.',
  'Technical problems.',
];

const FORCE_MAJEURE = [
  'Natural disasters.',
  'Epidemics and pandemics.',
  'Government restrictions.',
  'War.',
  'Civil unrest.',
  'Infrastructure failures.',
  'Major network failures.',
  'Other events recognised under applicable law.',
];

const MATRIX: ReadonlyArray<readonly string[]> = [
  ['User / Patient', 'Yes', 'Where required', 'Own information', 'No', 'Where purchasing', 'Where applicable'],
  ['Dentist', 'Yes', 'Professional', 'Yes, where authorised', 'Yes', 'Where applicable', 'Yes'],
  ['Clinic / Hospital', 'Yes', 'Business and facility', 'Yes, where authorised', 'Yes', 'Where applicable', 'Yes'],
  ['Vendor', 'Yes', 'Business', 'Limited, as authorised', 'No', 'Yes', 'Where applicable'],
  ['Dental college', 'Yes, institutional', 'Institutional', 'Where authorised', 'Academic and supervisory role', 'No', 'Yes'],
  ['Dental student', 'Yes', 'Student verification', 'Only as authorised', 'Limited by lawful scope and supervision', 'No', 'Yes'],
  ['Intern', 'Yes', 'Academic and role verification', 'Only as authorised', 'Limited by lawful scope and supervision', 'No', 'Yes'],
  ['Volunteer', 'Yes', 'Identity and role verification', 'Only as authorised', 'No unauthorised clinical activity', 'No', 'Yes'],
  ['Partner / Sponsor', 'Where applicable', 'Organization verification', 'As authorised', 'No, unless separately authorised', 'As applicable', 'Yes'],
];

const ACCEPTANCE_METHODS = [
  'Ticking an acceptance checkbox on the website.',
  'Accepting within the mobile application.',
  'Completing account registration.',
  'A digital or electronic signature.',
  'One-time-password or other electronic verification.',
  'Confirming an appointment booking.',
  'Completing Vendor or Dentist onboarding.',
  'Completing internship or volunteer registration.',
  'Completing Camp registration.',
  'Any other method recognised as valid acceptance under applicable law.',
];

const ROLE_ACCEPTANCE: ReadonlyArray<readonly [string, string]> = [
  ['Patient or User', 'the common Terms and the User provisions (§5).'],
  ['Dentist', 'the common Terms and the Dentist obligations (§6).'],
  ['Clinic or Hospital', 'the common Terms and the facility obligations (§7).'],
  ['Vendor', 'the common Terms and the Vendor obligations (§8, §22, §65).'],
  ['Dental college or institution', 'the common Terms and the institutional provisions (§10).'],
  ['Student or Intern', 'the common Terms and the Student and Intern provisions (§11).'],
  ['Volunteer', 'the common Terms and the Volunteer provisions (§12).'],
  ['Partner or Sponsor', 'the common Terms and the partnership provisions applicable to the arrangement.'],
];

const PROGRAMME_TERMS = [
  'Dental camps.',
  'Internship programmes.',
  'Volunteer programmes.',
  'Government collaborations.',
  'Dental college collaborations.',
  'Events.',
  'Promotions.',
  'Referral programmes.',
  'Marketplace services.',
  'Subscription plans.',
  'Professional services.',
];

const AI_USES = [
  'Search and discovery.',
  'Recommendations and ranking.',
  'Content assistance and drafting support.',
  'Automated notifications and reminders.',
  'Chatbots and automated replies.',
  'Data analysis and reporting.',
  'Administrative automation.',
  'Matching a patient’s stated needs with relevant services.',
  'Fraud, abuse and security detection.',
];

const TELECONSULT_TERMS: ReadonlyArray<readonly [string, string]> = [
  ['Availability', 'a consultation depends on the Dentist’s availability and acceptance.'],
  ['Patient identity', 'the patient must be identifiable to the extent the service and applicable regulation require.'],
  ['Consent', 'the patient’s consent to the consultation, and to any recording or data use, is required before it begins.'],
  ['Technology limits', 'a remote consultation cannot include physical examination, and what can be assessed remotely is limited.'],
  ['Interruptions', 'internet, device and network failures may interrupt or end a consultation.'],
  ['Prescriptions', 'a prescription may be issued only where the Dentist is lawfully permitted to issue it remotely, on that professional’s judgment.'],
  ['Professional responsibility', 'the consulting Dentist remains professionally responsible for the consultation and its outcome.'],
  ['Emergencies', 'a remote consultation is not suitable for an emergency; see §61.'],
  ['Data protection', 'consultation data is handled under §30 and the Privacy Policy.'],
  ['Recording', 'no party may record, screenshot, publish or share a consultation without the authorisation and consent required.'],
];

const RECORD_DUTIES: ReadonlyArray<readonly [string, string]> = [
  ['Uploading', 'a record may be uploaded only by the person it concerns, or by someone authorised to act for them, or by a provider authorised to add to it.'],
  ['Accuracy', 'the person or provider who supplies information is responsible for its accuracy.'],
  ['Access permissions', 'access is granted by the patient, or as applicable law or professional regulation requires; access granted can be withdrawn.'],
  ['Sharing', 'a record may be shared only with a recipient the patient has authorised, or where the law requires it.'],
  ['Downloading', 'a patient may obtain a copy of the records held for them, where that is technically and legally possible.'],
  ['Retention', 'records are retained for as long as the purpose, applicable law and professional record-keeping requirements need.'],
  ['Correction', 'a patient may ask for a correction; a clinical entry may be corrected only through the appropriate professional process, and its history is preserved.'],
  ['Deletion', 'deletion may be requested, subject to the retention requirements in §59.'],
  ['Security', 'access is restricted to authorised persons, and access to a record is logged.'],
];

const WITHDRAWAL_LIMITS = [
  'Applicable law.',
  'Obligations already in existence under a contract.',
  'Retention that a legitimate or legal requirement obliges.',
  'Medical and legal record-retention requirements.',
  'Technical limitations, where a step cannot be reversed.',
];

const COMMUNICATION_CHANNELS = [
  'Email.',
  'SMS.',
  'Telephone.',
  'WhatsApp.',
  'Push notifications.',
  'In-application notifications.',
];

const OUTCOME_LIMITS = [
  'Toothlogy does not guarantee any treatment outcome.',
  'Outcomes with a Dentist or Clinic may vary between patients.',
  'Whether a treatment suits a patient depends on their individual clinical circumstances.',
  'The effectiveness of a product may vary.',
  'A testimonial, review or rating is an individual experience, not a guarantee.',
];

const VENDOR_RESPONSIBILITY = [
  'Product legality.',
  'Product quality.',
  'Product authenticity.',
  'Warranty.',
  'Delivery.',
  'Returns.',
  'Applicable taxes.',
  'Obligations owed to a consumer under applicable law.',
];

const RESTRICTED_CATEGORIES = [
  'Illegal products or services.',
  'Counterfeit items.',
  'Stolen goods.',
  'Unsafe items.',
  'Expired items.',
  'Unauthorised items, including those requiring a licence the Vendor does not hold.',
  'Items restricted by law.',
  'Items Toothlogy considers inappropriate for the Platform.',
];

const PAYMENT_EVENTS = [
  'Failed payments.',
  'Duplicate payments.',
  'Refunds.',
  'Chargebacks.',
  'Payment disputes.',
  'Fraudulent transactions.',
  'Payment-gateway failures.',
  'Settlement delays.',
];

const PROMOTION_TERMS = [
  'Coupons.',
  'Discounts.',
  'Referral benefits.',
  'Promotional campaigns.',
  'Limited-time offers.',
  'Eligibility conditions.',
  'Expiry.',
  'Consequences of misuse.',
];

const REFERRAL_ABUSE = [
  'Self-referrals.',
  'Fake accounts.',
  'Automated or scripted referrals.',
  'Fraud.',
  'Manipulation of a programme’s conditions.',
  'Abuse through multiple accounts.',
];

const BRANDING_PROTECTED = [
  'Government logos.',
  'Government seals and emblems.',
  'Government names and department names.',
  'Dental college logos and names.',
  'Hospital logos and names.',
  'Partner logos and names.',
  'Sponsor logos and names.',
];

const RESEARCH_REQUIREMENTS = [
  'The appropriate consent from each participant.',
  'Institutional approval.',
  'Ethics approval, where it applies.',
  'Data safeguards.',
  'Compliance with the applicable regulatory requirements.',
];

const PUBLIC_HEALTH_REPORTS = [
  'The number of participants.',
  'The number of screenings.',
  'The number of awareness sessions.',
  'Referral numbers.',
  'Geographic programme statistics.',
  'Volunteer participation.',
  'Camp activity statistics.',
];

const INTEGRITY_PARTIES = [
  'Government officials.',
  'Dentists.',
  'Clinics and hospitals.',
  'Vendors.',
  'Students.',
  'Interns.',
  'Volunteers.',
  'Partners.',
  'Sponsors.',
];

const CONFLICT_PARTIES = [
  'Dentists.',
  'Dental colleges.',
  'Vendors.',
  'Sponsors.',
  'Partners.',
  'Interns.',
  'Volunteers.',
  'Campaign and Camp organizers.',
];

const REPORTABLE = [
  'Fraud.',
  'Corruption.',
  'Patient-safety concerns.',
  'Privacy violations.',
  'Harassment.',
  'Unauthorised medical or dental activity.',
  'Misuse of a government programme.',
  'Misuse of patient data.',
];

const NOTICE_METHODS = [
  'Email to the address on the account.',
  'In-application notification.',
  'A notice published on the website.',
  'A notice in the account dashboard.',
  'SMS, where that is appropriate for the notice.',
];

const ASSIGNMENT_EVENTS = [
  'A merger.',
  'An acquisition.',
  'Corporate restructuring.',
  'A sale of the business or of assets.',
  'A reorganisation.',
];

const SURVIVING = [
  'Confidentiality (§29).',
  'Intellectual property (§28).',
  'Privacy and data obligations (§17, §30).',
  'Payment obligations already incurred (§23, §66).',
  'Dispute resolution (§39).',
  'Limitation of liability (§43).',
  'Indemnification (§44).',
];

const LEGAL_HIERARCHY = [
  'These Master Terms & Conditions.',
  'The Privacy Policy.',
  'A Cookie Policy.',
  'A Refund and Cancellation Policy.',
  'A Disclaimer.',
  'Community Guidelines.',
  'A Vendor agreement.',
  'A Dentist or Clinic agreement.',
  'An internship agreement.',
  'A volunteer agreement.',
  'A dental college memorandum of understanding.',
  'A government or institutional agreement.',
  'Camp-specific terms.',
  'Other service-specific terms.',
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

function Definitions({ items, label }: { items: ReadonlyArray<readonly [string, string]>; label: string }) {
  return (
    <dl aria-label={label}>
      {items.map(([term, meaning]) => (
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

export default function TermsPage() {
  return (
    <div className="tl-container tl-page" style={{ maxWidth: '52rem' }}>
      <header className="tl-page__header">
        <h1>Toothlogy Master Terms &amp; Conditions</h1>
        <p className="tl-muted">
          Version {VERSION} · Effective {EFFECTIVE_DATE} · Last updated {LAST_UPDATED}
        </p>
        <p className="tl-page__lead">
          One document for everyone in the Toothlogy ecosystem. The common framework applies to all;
          the role sections say what applies to you in particular. Sections are numbered so a clause
          can be cited, and each has a stable link.
        </p>
      </header>

      <section aria-labelledby="part-1" className="tl-prose">
        <h2 id="part-1">Part 1 — Introduction and definitions</h2>

        <h3 id="s1">1. Introduction</h3>
        <p>
          Toothlogy is a technology-enabled dental-care ecosystem. The Platform may connect and
          facilitate interactions among:
        </p>
        <List items={PARTICIPANTS} label="Who takes part in the Toothlogy ecosystem" />
        <p>
          By registering, accessing, browsing, booking, purchasing, listing, providing services,
          participating in a Camp, volunteering, interning or otherwise using Toothlogy, the relevant
          party agrees to these Terms. If you do not agree, you should not use the Platform.
        </p>
        <p>
          Particular services may carry additional terms, policies, consent requirements, agreements or
          programme-specific conditions — for example a Camp protocol, an internship agreement, an
          institutional memorandum of understanding, a Vendor agreement or a consent form. Those apply
          in addition to these Terms, and §48 explains how any conflict is resolved.
        </p>

        <h3 id="s2">2. Definitions</h3>
        <Definitions items={DEFINITIONS} label="Definitions" />
        <p>
          <strong>A Dentist is not a Student, Intern or Volunteer.</strong> Only a person lawfully
          qualified and registered to practise is a Dentist under these Terms. A dental Student or
          dental Intern acts within the scope their qualification, training, institution and supervision
          permit, and a Volunteer acts in a non-clinical role unless separately authorised.
        </p>
      </section>

      <section aria-labelledby="part-2" className="tl-prose">
        <h2 id="part-2">Part 2 — Joining Toothlogy</h2>

        <h3 id="s3">3. Eligibility</h3>
        <p>Eligibility depends on the role. In each case the following apply:</p>
        <Definitions items={ELIGIBILITY} label="Eligibility by role" />
        <p>
          Toothlogy does not grant professional authorization, registration or a licence to anyone. It
          records and verifies what is submitted, and a verification on the Platform is not a
          substitute for the registration a profession requires.
        </p>

        <h3 id="s4">4. Account registration and verification</h3>
        <p>These rules apply to every account:</p>
        <List items={ACCOUNT_DUTIES} label="Account responsibilities" />
        <p>
          Patients must give accurate personal information; Dentists accurate professional information;
          Vendors accurate business information; Interns, Students and Volunteers accurate educational
          and personal information; and organizations accurate legal and authorised-representative
          information.
        </p>
        <p>
          Toothlogy may request documentation, carry out reasonable verification, and suspend an
          account or restrict functionality where that is necessary for security, safety, legal
          compliance or the integrity of the Platform.
        </p>
      </section>

      <section aria-labelledby="part-3" className="tl-prose">
        <h2 id="part-3">Part 3 — Terms for each role</h2>

        <h3 id="s5">5. Patients and Users</h3>
        <p>As a Patient or User you agree to:</p>
        <List items={PATIENT_DUTIES} label="Patient responsibilities" />
        <p>
          You must not upload another person’s Health Information unless you are authorised to act for
          them, for example as a parent or guardian. Repeated no-shows, bookings made without genuine
          intent, fraudulent claims or deliberately incorrect patient information may lead to
          restrictions under §37. Your dental record on the Platform remains yours: a Clinic sees it
          only under the access you grant, and you can withdraw that access.
        </p>

        <h3 id="s6">6. Dentists</h3>
        <p>
          A Dentist joins as an independent professional. Toothlogy provides the tools; it does not
          practise dentistry, and must never be represented as replacing a Dentist’s professional
          judgment.
        </p>
        <Definitions items={DENTIST_DUTIES} label="Dentist obligations" />
        <p>
          Dentists remain independently responsible for their professional and clinical decisions,
          including diagnosis, treatment, prescription and the records that support them.
        </p>

        <h3 id="s7">7. Dental clinics and hospitals</h3>
        <p>A Clinic or Hospital taking part agrees to:</p>
        <List items={CLINIC_DUTIES} label="Clinic and hospital obligations" />

        <h3 id="s8">8. Vendors</h3>
        <p>A Vendor agrees to:</p>
        <List items={VENDOR_DUTIES} label="Vendor obligations" />
        <p>
          Vendors remain responsible for the legality, quality, safety, authenticity and accuracy of
          their products and services, and for their listings.
        </p>

        <h3 id="s9">9. Dental laboratories and other service providers</h3>
        <p>A laboratory or other Service Provider agrees to:</p>
        <List items={LAB_DUTIES} label="Laboratory and service provider obligations" />

        <h3 id="s10">10. Dental colleges and institutions</h3>
        <p>Toothlogy may collaborate with recognised dental colleges and institutions on:</p>
        <List items={COLLEGE_SCOPE} label="Scope of college collaboration" />
        <p>
          Participation by students does not mean that the college endorses Toothlogy or any of its
          products, services, commercial activities, Dentists, Vendors or partners. Where an institution
          formally collaborates with Toothlogy, the scope is defined separately through an agreement,
          memorandum of understanding or authorisation, and nothing beyond that scope may be
          represented as agreed.
        </p>

        <h3 id="s11">11. Dental students and interns</h3>
        <p>Participation as a Student or Intern is subject to:</p>
        <List items={STUDENT_TERMS} label="Student and intern terms" />
        <p>
          A Student or Intern must not represent themselves as an independently qualified Dentist
          unless they are legally qualified and authorised to do so, and must not perform activities
          beyond their lawful scope, training or supervision requirements. Where clinical activity is
          permitted, it may be carried out only within that scope, under the supervision required, in
          line with the Camp or programme protocol, with the appropriate patient consent, and under the
          direction of a qualified professional.
        </p>

        <h3 id="s12">12. Volunteers</h3>
        <p>Volunteers may support:</p>
        <List items={VOLUNTEER_SUPPORT} label="Volunteer activities" />
        <p>Volunteers must not independently:</p>
        <List items={NEVER_INDEPENDENTLY} label="Never done independently" />
      </section>

      <section aria-labelledby="part-4" className="tl-prose">
        <h2 id="part-4">Part 4 — Camps, community programmes and consent</h2>

        <h3 id="s13">13. Dental camps and community programmes</h3>
        <p>Toothlogy may organize, or take part in:</p>
        <List items={CAMP_TYPES} label="Types of camp and programme" />
        <p>Camps may take place at:</p>
        <List items={CAMP_VENUES} label="Camp venues" />
        <p>What a particular Camp offers may vary, depending on:</p>
        <List items={CAMP_VARIABLES} label="What camp activities depend on" />

        <h3 id="s14">14. Government permission, support and collaboration</h3>
        <p>
          Toothlogy may conduct or take part in certain Camps and community programmes with permission,
          authorisation, coordination, support, participation or collaboration from a relevant
          Government Authority, where that is required. Activities fall into these categories, which
          are not interchangeable, and each activity states which applies to it:
        </p>
        <Definitions items={HOW_ORGANISED} label="How an activity may be organized" />
        <p>
          Not every Toothlogy programme is government-sponsored, and none is described as such unless it
          is. Permission, support or participation does not imply that a Government Authority endorses
          Toothlogy, its commercial activities, any Dentist, Vendor, product or service, unless a
          specific written authorisation or official arrangement provides it. Taking part in a
          government-supported programme does not make Toothlogy a government department, a Dentist or
          Intern a government employee, or a Volunteer a government representative. Where applicable,
          Toothlogy may keep documentation of permissions, approvals, letters, memoranda of
          understanding and other authorisations.
        </p>

        <h3 id="s15">15. Camp supervision</h3>
        <p>Where an activity requires supervision, these roles apply:</p>
        <Definitions items={SUPERVISION_ROLES} label="Supervision roles" />
        <p>
          Students and Volunteers must follow the supervision requirements that apply to them, and must
          refer any clinical or medical question outside their permitted scope to the appropriate
          qualified professional. Clinical activity may be carried out only by appropriately qualified
          or authorised individuals, or under legally appropriate supervision.
        </p>

        <h3 id="s16">16. Patient consent</h3>
        <Alert tone="warning" title="Nothing is done to a patient without consent">
          <p style={{ marginTop: 0 }}>
            Consent is not a formality. It is the basis on which anything may be done with or for a
            patient, it must be obtained before the activity and not after it, it covers only what was
            explained, and it may be withdrawn at any time — at which point the activity stops. A
            participant who is unsure whether consent covers what they are about to do must stop and ask
            the supervising professional.
          </p>
        </Alert>
        <p>Where applicable, the appropriate consent must be obtained before:</p>
        <List items={CONSENT_BEFORE} label="Activities requiring consent" />
        <p>
          For a minor or a person who is legally protected or cannot give consent themselves, the
          consent or authorisation of a parent, guardian or other legally authorised person is required
          where the law requires it, and the activity must stay within what that consent covers.
          Consent may be withdrawn, and an activity must then stop.
        </p>

        <h3 id="s17">17. Patient privacy and health information</h3>
        <p>The following are protected, wherever they appear:</p>
        <List items={PROTECTED_INFORMATION} label="Protected information" />
        <p>
          Only authorised persons may access such information, only for the purpose it was given, and
          only for as long as that purpose requires. Interns, Students and Volunteers must not copy,
          download, publish, sell, disclose or otherwise misuse patient information. Handling is also
          governed by the <Link href="/privacy">Toothlogy Privacy Policy</Link> and applicable privacy
          and data-protection law.
        </p>

        <h3 id="s18">18. Photography, video and social media</h3>
        <p>
          Patient photography, before-and-after photographs, Camp photography, student and volunteer
          photography, video recording, social-media publication and marketing material all require
          authorisation, and consent where consent applies.
        </p>
        <p>
          No identifiable patient content may be published without the appropriate authorisation and
          consent. Interns and Volunteers must not independently publish Camp content that represents
          Toothlogy, and no one may suggest that a Government Authority or an institution endorses
          Toothlogy, a Dentist, a Vendor, a product or a service.
        </p>

        <h3 id="s19">19. Emergency and incident management</h3>
        <p>The following must be escalated immediately:</p>
        <List items={INCIDENTS} label="Incidents to escalate" />
        <p>
          Escalation goes to the appropriate qualified professional, emergency service, supervisor,
          authority or the designated Toothlogy contact, according to the protocol for the activity. No
          participant may attempt a procedure outside their lawful scope, including in an emergency.
        </p>

        <h3 id="s20">20. Safety and infection control</h3>
        <p>Everyone taking part in an activity must comply with the applicable:</p>
        <List items={SAFETY_REQUIREMENTS} label="Safety requirements" />
        <p>
          These Terms do not set clinical standards. The professional, regulatory and institutional
          standards that apply to the activity and the venue govern, and the instructions of the
          supervising professional and the relevant authority must be followed.
        </p>
      </section>

      <section aria-labelledby="part-5" className="tl-prose">
        <h2 id="part-5">Part 5 — Using the Platform</h2>

        <h3 id="s21">21. Appointments and bookings</h3>
        <p>
          An Appointment request is subject to the Dentist’s or Clinic’s availability and confirmation,
          and to its cancellation policy, consultation charges, treatment charges and any platform
          charge that applies. Rescheduling, cancellation and no-show handling follow that policy.
        </p>
        <p>
          Toothlogy cannot guarantee that a request will be accepted, that a particular Dentist will
          remain available, or what a treatment will achieve, unless expressly stated for a specific
          service. Refunds, where any apply, follow §23 and the applicable policy.
        </p>

        <h3 id="s22">22. Marketplace and products</h3>
        <p>
          Listings, prices, orders, payment, shipping, delivery, returns, refunds, warranty and product
          authenticity are the responsibility of the Vendor that lists them, as set out in §8. A Vendor
          sells to a buyer directly; unless expressly stated for a particular service, Toothlogy is not
          the seller, importer or manufacturer. §64 sets out the vendor–buyer relationship, and §65 the
          categories of product that are restricted or prohibited.
        </p>

        <h3 id="s23">23. Payments</h3>
        <p>
          Where a payment is made through the Platform, the amount, taxes, platform fee, Dentist or
          Clinic fee, Vendor settlement, refund rules and the payment provider’s terms apply. Payments
          may be processed by third-party payment processors under their own terms.
        </p>
        <p>
          Failed transactions, chargebacks, settlement timelines and refund eligibility depend on the
          service, the applicable policy, the provider and applicable law, and are dealt with in §66.
          Where a payment provider is not connected for a particular service, the Platform says so
          rather than accepting a payment it cannot process.
        </p>

        <h3 id="s24">24. Reviews, ratings and user content</h3>
        <p>
          Users may submit reviews, ratings, comments, photographs, videos, questions and feedback. You
          remain responsible for what you submit, and confirm you have the rights and permissions to
          submit it. The following are prohibited:
        </p>
        <List items={CONTENT_PROHIBITED} label="Prohibited content" />
        <p>
          Toothlogy may moderate, restrict, remove or refuse Content in accordance with applicable law
          and platform policy, and may act on a report from a person affected by it.
        </p>

        <h3 id="s25">25. Advertising and sponsored listings</h3>
        <p>
          Paid listings, featured Dentists or Clinics, Vendor advertising, sponsored content, campaign
          sponsorship and promotional offers are permitted where they are clearly labelled as paid
          placement wherever they appear. Paid placement does not change organic ranking.
        </p>
        <p>Advertising must never imply:</p>
        <List items={ADVERTISING_NEVER} label="Claims advertising must never imply" />
      </section>

      <section aria-labelledby="part-6" className="tl-prose">
        <h2 id="part-6">Part 6 — Programmes, people and property</h2>

        <h3 id="s26">26. Intern and volunteer recruitment</h3>
        <p>Toothlogy may recruit participants through:</p>
        <List items={RECRUITMENT_CHANNELS} label="Recruitment channels" />
        <p>
          Recruitment requires appropriate verification and consent, including the permission of a
          college or institution where that is required. Toothlogy may set programme-specific
          eligibility, duration, location, attendance, training, responsibilities and certificate
          requirements, which are communicated for each programme.
        </p>

        <h3 id="s27">27. No unauthorised commercial activity</h3>
        <p>
          Interns, Volunteers, Students, Dentists, Vendors and other participants must not use a
          Toothlogy Camp, a programme, patient information or Toothlogy resources for unauthorised:
        </p>
        <List items={NO_COMMERCIAL} label="Unauthorised commercial activity" />
        <p>
          This applies during an activity and afterwards, to information and contacts obtained through
          it.
        </p>

        <h3 id="s28">28. Intellectual property</h3>
        <p>The following are owned by or licensed to Toothlogy, unless otherwise stated:</p>
        <List items={IP_PROTECTED} label="Toothlogy intellectual property" />
        <p>
          No one may copy, reproduce, modify, distribute, sell, licence, reverse engineer, scrape or
          commercially exploit them without prior written authorisation.
        </p>
        <p>
          Content submitted by a User, Dentist, Clinic, Vendor, Intern, Student, Volunteer or Partner
          remains the responsibility of the person who submitted it. By submitting it, you grant
          Toothlogy the permissions reasonably necessary to host, display, process, distribute and
          operate the relevant Platform functionality, subject to applicable law and the Privacy Policy.
          Work created specifically for Toothlogy under an internship, volunteer or project arrangement
          may be subject to Toothlogy’s rights, as that arrangement provides.
        </p>

        <h3 id="s29">29. Confidentiality</h3>
        <p>Confidentiality applies to:</p>
        <List items={CONFIDENTIAL_CATEGORIES} label="Confidential categories" />
        <p>
          Confidential information may be used only for the purpose for which access was given, and
          must not be shared with unauthorised persons, copied unnecessarily, published, or used for
          personal benefit. These obligations continue after participation or an account ends, subject
          to applicable law.
        </p>

        <h3 id="s30">30. Data protection and privacy</h3>
        <p>
          What is collected depends on the role: a Patient, a Dentist, a Vendor, a Student and a
          Volunteer do not give the same information. Collection, use, storage, disclosure and retention
          are governed by the <Link href="/privacy">Privacy Policy</Link> and applicable law, and follow
          the principles of lawful processing, consent where consent is the basis, purpose limitation,
          accuracy, security, retention for no longer than necessary, and the rights of access,
          correction and deletion where they apply.
        </p>
        <p>
          These Terms do not claim compliance with any particular statute or certification. Where a
          specific legal framework applies to you, its requirements apply in addition.
        </p>

        <h3 id="s31">31. Children and minors</h3>
        <p>
          Additional care applies wherever a minor is involved, and the consent or authorisation of a
          parent, guardian or other legally authorised person is required where the law requires it.
          Particular attention applies to:
        </p>
        <List items={MINOR_CARE} label="Where extra care applies for minors" />
        <p>
          A minor’s information may be collected only as far as the activity requires, and never
          published in identifiable form without the appropriate authorisation and consent.
        </p>

        <h3 id="s32">32. Certificates and recognition</h3>
        <p>Toothlogy may issue:</p>
        <List items={CERTIFICATE_TYPES} label="Certificates Toothlogy may issue" />
        <p>A certificate describes the person’s actual role. It does not imply:</p>
        <List items={CERTIFICATE_NEVER} label="What a certificate never implies" />
        <p>
          Academic or institutional recognition applies only where the relevant institution has formally
          approved it. Toothlogy may refuse or withdraw recognition in cases of fraud, misconduct,
          serious violation or failure to meet the applicable requirements.
        </p>

        <h3 id="s33">33. Travel, accommodation and expenses</h3>
        <p>Where a participant is deployed to a Camp, the following apply only where they are specifically communicated or agreed:</p>
        <List items={DEPLOYMENT_TERMS} label="Deployment conditions" />
        <p>
          Nothing here promises travel support, reimbursement, a stipend or insurance. Participation in a
          field activity is subject to the participant accepting the conditions communicated for that
          programme.
        </p>

        <h3 id="s34">34. Insurance and coverage</h3>
        <p>
          Toothlogy does not state that participants are insured. Any insurance or coverage applies only
          where it is expressly provided under a relevant policy, agreement, institution, government
          programme or other documented arrangement, and then only on that arrangement’s terms.
        </p>
        <p>
          Everyone taking part must comply with the applicable safety requirements, whether or not any
          coverage exists.
        </p>
      </section>

      <section aria-labelledby="part-7" className="tl-prose">
        <h2 id="part-7">Part 7 — Compliance, conduct and enforcement</h2>

        <h3 id="s35">35. Professional and regulatory compliance</h3>
        <p>
          Every party must comply with the laws and the professional and regulatory requirements that
          apply to its role: Dentists with professional registration and practice regulation; Clinics
          and Hospitals with establishment, safety and clinical-waste requirements; Vendors with
          product-safety, consumer-protection, taxation and distribution requirements; laboratories with
          the requirements for the work they undertake; and Students, Interns and Volunteers with the
          limits of their scope, training and supervision.
        </p>
        <p>
          Toothlogy does not grant licences or professional authorization, and no verification on the
          Platform substitutes for a registration, licence or approval that the law requires.
        </p>

        <h3 id="s36">36. Prohibited activities</h3>
        <p>The following are prohibited for everyone, in every role:</p>
        <List items={PROHIBITED} label="Prohibited activities" />

        <h3 id="s37">37. Suspension and termination</h3>
        <p>Where it is reasonably necessary, Toothlogy may:</p>
        <List items={ENFORCEMENT_ACTIONS} label="Enforcement actions" />
        <p>Serious grounds include:</p>
        <List items={ENFORCEMENT_GROUNDS} label="Grounds for enforcement" />
        <p>
          Where appropriate, a party is given an opportunity to resolve the issue first. On termination,
          a participant must stop representing themselves as associated with Toothlogy and return or
          delete materials, identification and access credentials as instructed. Obligations that are
          meant to continue — confidentiality in particular — continue.
        </p>

        <h3 id="s38">38. Complaints and grievance redressal</h3>
        <p>A complaint may be made about:</p>
        <List items={COMPLAINT_SUBJECTS} label="What a complaint may concern" />
        <p>
          Complaints may be sent to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Please include enough
          detail to identify what happened, when, and who was involved. Toothlogy acknowledges
          complaints, investigates them as far as it reasonably can, and acts in accordance with
          applicable law and its internal policies. A complaint about a Dentist’s clinical care may also
          be raised with the professional body with which that Dentist is registered.
        </p>
      </section>

      <section aria-labelledby="part-8" className="tl-prose">
        <h2 id="part-8">Part 8 — Legal terms</h2>

        <h3 id="s39">39. Dispute resolution and governing law</h3>
        <p>
          These Terms are governed by applicable Indian law, subject to the mandatory rights and
          protections that apply to the relevant party — including consumer, healthcare, privacy and
          professional protections, which these Terms do not displace.
        </p>
        <p>
          Disputes are to be addressed through appropriate dispute-resolution mechanisms and, where
          necessary, the courts or authorities having appropriate jurisdiction under applicable law.
        </p>

        <h3 id="s40">40. Third-party services</h3>
        <p>The Platform may integrate:</p>
        <List items={THIRD_PARTIES} label="Third-party services" />
        <p>
          Such services operate under their own terms and privacy policies. Where a provider is not
          connected for a particular capability, the Platform says so rather than appearing to perform
          it.
        </p>

        <h3 id="s41">41. Platform availability</h3>
        <p>The Platform may be affected by:</p>
        <List items={AVAILABILITY_EVENTS} label="Events affecting availability" />
        <p>
          Toothlogy aims to provide reliable and secure services, and does not promise uninterrupted
          availability unless a service-level agreement specifically provides it.
        </p>

        <h3 id="s42">42. Healthcare disclaimer</h3>
        <Alert tone="warning" title="Toothlogy does not replace professional dental care">
          <p style={{ marginTop: 0 }}>
            Toothlogy is a technology platform. It does not replace professional dental examination,
            diagnosis, treatment or emergency care, and it does not guarantee any treatment outcome.
            Independent Dentists and healthcare providers are responsible for their professional
            decisions. In an emergency, or where a condition is serious, seek appropriate emergency
            medical or dental assistance immediately — see §61, and §62 on outcomes.
          </p>
        </Alert>

        <h3 id="s43">43. Limitation of liability</h3>
        <p>
          To the maximum extent permitted by applicable law, and subject to §43’s final paragraph,
          Toothlogy is not responsible for indirect, incidental, consequential, special or punitive
          losses arising from the use of the Platform or of third-party products or services.
        </p>
        <p>Responsibility is distinguished as follows:</p>
        <ul aria-label="How responsibility is distinguished">
          <li>
            <strong>Platform functionality</strong> — Toothlogy is responsible for the Platform it
            provides, as these Terms and applicable law require.
          </li>
          <li>
            <strong>Clinical services</strong> — the independent Dentist, Clinic or Hospital is
            responsible for examination, diagnosis, treatment and their outcomes.
          </li>
          <li>
            <strong>Products</strong> — the Vendor is responsible for the product, its authenticity,
            safety, warranty and delivery.
          </li>
          <li>
            <strong>Third-party services</strong> — the provider is responsible for its own service.
          </li>
          <li>
            <strong>User-generated information</strong> — the person who submitted it is responsible for
            it.
          </li>
        </ul>
        <p>
          Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or
          limited, including liability under mandatory consumer or healthcare protections.
        </p>

        <h3 id="s44">44. Indemnification</h3>
        <p>
          To the extent permitted by applicable law, a User, Dentist, Clinic, Hospital, Vendor,
          laboratory, Student, Intern, Volunteer, Partner or Sponsor agrees to indemnify Toothlogy and
          its affiliates, officers, employees and authorised representatives against claims, losses,
          damages, liabilities, costs and expenses arising from that party’s unlawful conduct, breach of
          these Terms, infringement of a third party’s rights, fraudulent activity or misuse of the
          Platform. This clause does not apply to the extent a loss results from Toothlogy’s own act or
          omission, and does not limit rights that applicable consumer or healthcare law protects.
        </p>

        <h3 id="s45">45. Force majeure</h3>
        <p>Neither party is responsible for a failure caused by events outside its reasonable control, including:</p>
        <List items={FORCE_MAJEURE} label="Force majeure events" />

        <h3 id="s46">46. Changes to these Terms</h3>
        <p>
          Toothlogy may update these Terms to reflect changes in the Platform, services, programmes,
          business practices or applicable law. Material changes are notified through appropriate
          channels where notice is required, and the revised document carries an updated “Last updated”
          date. Continued use after the effective date may constitute acceptance, to the extent
          permitted by law.
        </p>

        <h3 id="s47">47. Severability</h3>
        <p>
          If a provision is found invalid or unenforceable, it applies to the extent it lawfully can,
          and the remaining provisions continue in force.
        </p>

        <h3 id="s48">48. Entire agreement</h3>
        <p>
          These Terms, together with the <Link href="/privacy">Privacy Policy</Link> and any applicable
          policies, consent forms, programme-specific terms and separate written agreements, form the
          agreement governing use of the Platform.
        </p>
        <p>
          Where a separate signed agreement — an internship agreement, a Vendor agreement, an
          institutional memorandum of understanding, a Camp authorisation or a sponsorship agreement —
          covers the same subject and conflicts with these Terms, that agreement prevails for the parties
          to it and for its subject matter, and these Terms continue to apply to everything else. A
          programme-specific condition that is stricter than these Terms applies as well as them. §84
          sets out the full hierarchy of documents and how a conflict between them is resolved.
        </p>

        <h3 id="s49">49. Contact</h3>
        <p>
          Toothlogy — <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
        <p className="tl-muted">
          See also <Link href="/about">About Toothlogy</Link> and the{' '}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </section>

      <section aria-labelledby="s50" className="tl-prose">
        <h2 id="s50">50. Role matrix</h2>
        <p>
          A summary, not a substitute for the sections above. Where this table and a section differ, the
          section governs.
        </p>
        <Table caption="Which obligations apply to each role">
          <thead>
            <tr>
              <th scope="col">Role</th>
              <th scope="col">Account</th>
              <th scope="col">Verification</th>
              <th scope="col">Patient data</th>
              <th scope="col">Clinical responsibility</th>
              <th scope="col">Product responsibility</th>
              <th scope="col">Camp participation</th>
            </tr>
          </thead>
          <tbody>
            {MATRIX.map((row) => (
              <tr key={row[0]}>
                <th scope="row">{row[0]}</th>
                {row.slice(1).map((cell, index) => (
                  <td key={index}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section aria-labelledby="part-9" className="tl-prose">
        <h2 id="part-9">Part 9 — Acceptance, technology and additional provisions</h2>

        <h3 id="s51">51. Electronic acceptance</h3>
        <p>
          These Terms may be accepted electronically. Acceptance may occur through any of the
          following, where the Platform presents it:
        </p>
        <List items={ACCEPTANCE_METHODS} label="Ways these Terms may be accepted" />
        <p>
          Electronic acceptance is intended to be valid and enforceable under the applicable
          electronic-contract and information-technology laws. Toothlogy may record the fact of
          acceptance, the role accepted for, the document version accepted (§83), and the date and time
          of acceptance, so that what a party agreed to can be established later.
        </p>

        <h3 id="s52">52. Role-based acceptance</h3>
        <p>
          Acceptance is recorded against the role a party joins in. Typically:
        </p>
        <Definitions items={ROLE_ACCEPTANCE} label="What each role accepts" />
        <p>
          Whatever the role, every party remains subject to the common provisions of these Master
          Terms. Accepting in one role does not accept the obligations of another, and a party acting in
          more than one role is bound by the provisions for each role it holds.
        </p>

        <h3 id="s53">53. Programme-specific terms</h3>
        <p>Toothlogy may publish additional terms for a specific programme or service, including:</p>
        <List items={PROGRAMME_TERMS} label="Programmes that may carry additional terms" />
        <p>
          Where programme-specific terms or a programme agreement exist, they supplement these Master
          Terms for that programme, and §84 sets out how a conflict is resolved. The role-specific
          document for interns and volunteers is published at{' '}
          <Link href="/terms/interns-volunteers">Terms for interns and volunteers</Link>; it supplements
          this document and does not replace it.
        </p>

        <h3 id="s54">54. Artificial intelligence and automated technology</h3>
        <p>The Platform may use artificial intelligence or other automated technology for:</p>
        <List items={AI_USES} label="Where automated technology may be used" />
        <Alert tone="warning" title="AI output is not a diagnosis">
          <p style={{ marginTop: 0 }}>
            Information produced by an automated or AI feature must not be treated as a substitute for
            professional dental examination, diagnosis, treatment or advice. Such output may be
            incomplete or inaccurate, and where a healthcare decision is involved it should be reviewed
            by an appropriately qualified professional. Toothlogy does not provide autonomous medical or
            dental diagnosis, and no feature should be described as doing so unless that specific
            service is legally authorised and designed for that purpose.
          </p>
        </Alert>
        <p>
          Where an automated decision materially affects a party, that party may ask for the matter to be
          reviewed by a person, to the extent applicable law provides.
        </p>

        <h3 id="s55">55. Teleconsultation and digital consultation</h3>
        <p>
          Where Toothlogy offers, or later introduces, an online or remote consultation service, the
          following apply to it:
        </p>
        <Definitions items={TELECONSULT_TERMS} label="Teleconsultation terms" />
        <p>
          Teleconsultation is subject to the professional, healthcare and telemedicine regulations that
          apply to the Dentist and to the place where the service is provided. Where such a service is
          not offered, nothing in this section implies that it is.
        </p>

        <h3 id="s56">56. Digital dental records</h3>
        <p>
          Where the Platform stores dental records, responsibilities are as follows:
        </p>
        <Definitions items={RECORD_DUTIES} label="Digital record responsibilities" />
        <p>
          <strong>
            Storing a record on the Platform does not make Toothlogy the owner of the patient’s
            underlying health information.
          </strong>{' '}
          The information remains the patient’s, and Toothlogy processes it as a custodian, for the
          purposes these Terms and the <Link href="/privacy">Privacy Policy</Link> describe. A provider
          may hold its own clinical records separately, as professional regulation requires of it.
        </p>

        <h3 id="s57">57. Withdrawal of consent</h3>
        <p>
          Where processing is based on consent, that consent may be withdrawn through the applicable
          Platform process or by contacting <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Withdrawal
          applies going forward and is subject to:
        </p>
        <List items={WITHDRAWAL_LIMITS} label="Limits on withdrawal of consent" />
        <p>
          Withdrawing consent may mean that a service, a feature or a programme can no longer be
          provided, and what is affected is explained where it is known. Withdrawing consent for a
          clinical activity stops that activity, as §16 provides.
        </p>

        <h3 id="s58">58. Access to your information and data portability</h3>
        <p>
          Where it is technically and legally possible, a party may request access to, or a copy of, the
          information associated with their account. Toothlogy may verify identity before responding,
          may need to redact information relating to another person, and handles such requests in
          accordance with applicable privacy law and the <Link href="/privacy">Privacy Policy</Link>.
        </p>

        <h3 id="s59">59. Account deletion</h3>
        <p>
          An account may be deleted through the applicable Platform process, or by contacting{' '}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
        <p>
          Deletion is subject to lawful retention requirements. Some information may have to be kept
          after an account is closed — for example clinical records a provider must retain, transaction
          and tax records, and information needed for a legal claim, a regulatory obligation or the
          prevention of fraud. Toothlogy therefore does not promise that every record is deleted
          immediately, and says what is retained and why, where that can be stated.
        </p>

        <h3 id="s60">60. Communication consent</h3>
        <p>Toothlogy may communicate through:</p>
        <List items={COMMUNICATION_CHANNELS} label="Communication channels" />
        <p>
          <strong>Transactional communications</strong> relate to something you have done or hold — an
          appointment confirmation or reminder, an order or delivery update, a security alert, a change
          to these Terms, or a reply to a request. These are part of the service, and are sent for as
          long as the relationship lasts.
        </p>
        <p>
          <strong>Promotional communications</strong> — offers, campaigns, newsletters and
          recommendations — are sent where consent has been given or applicable law otherwise permits,
          and can be stopped at any time through the opt-out in the message, the notification settings
          in the account, or by contacting <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Opting out of
          promotional messages does not stop transactional ones.
        </p>
        <p>
          Where a messaging, email or SMS provider is not connected for a particular channel, the
          Platform does not send on it and does not report a message as sent.
        </p>

        <h3 id="s61">61. Emergency disclaimer</h3>
        <Alert tone="danger" title="Toothlogy is not an emergency service">
          <p style={{ marginTop: 0 }}>
            Toothlogy is not an emergency medical or dental response service, unless a specific service
            expressly states otherwise. If you are experiencing a serious dental or medical emergency —
            including severe pain, uncontrolled bleeding, swelling that affects breathing or swallowing,
            facial trauma, or any condition you believe is urgent — contact your local emergency
            services, a hospital, a Dentist or your local healthcare authority immediately. Do not wait
            for a reply from the Platform, an appointment request, a message or an automated feature.
          </p>
        </Alert>

        <h3 id="s62">62. No guaranteed treatment outcome</h3>
        <List items={OUTCOME_LIMITS} label="Limits on outcome claims" />
        <p>
          No Dentist, Clinic, Vendor, Intern, Volunteer or representative may promise a guaranteed
          result on or through the Platform, and §6 and §25 apply to any claim that is made.
        </p>

        <h3 id="s63">63. The dentist–patient relationship</h3>
        <p>
          When a User engages a Dentist, Clinic or Hospital for professional care, the professional
          relationship is between that patient and that healthcare provider, subject to applicable law.
          Toothlogy is not a party to it and does not practise dentistry.
        </p>
        <p>
          Toothlogy’s role is limited to the services it expressly provides — which may include
          discovery, communication, booking, payment facilitation, records functionality and related
          technology — and to those services only.
        </p>

        <h3 id="s64">64. The vendor–buyer relationship</h3>
        <p>
          A purchase of a product or service through the marketplace may create a relationship between
          the User and the Vendor. The Vendor remains responsible for:
        </p>
        <List items={VENDOR_RESPONSIBILITY} label="Vendor responsibility" />
        <p>
          Toothlogy’s responsibility is limited to the services it expressly provides. Unless expressly
          stated for a particular service, it is not the seller, importer or manufacturer.
        </p>

        <h3 id="s65">65. Restricted and prohibited products</h3>
        <p>
          Toothlogy may prohibit or restrict a category of product or service, at its discretion and
          without notice where safety or legality requires it. Restricted categories include anything:
        </p>
        <List items={RESTRICTED_CATEGORIES} label="Restricted product categories" />
        <p>
          A Vendor must comply with applicable law and with the Platform’s restrictions, and must remove
          a listing that breaches either. Toothlogy may remove a listing, withhold a settlement relating
          to it, and act under §37.
        </p>

        <h3 id="s66">66. Payment failures, refunds and chargebacks</h3>
        <p>In addition to §23, the following are handled as set out here:</p>
        <List items={PAYMENT_EVENTS} label="Payment events" />
        <p>
          A duplicate or failed payment is reconciled with the payment provider and, where an amount was
          taken and no service or product was supplied, refunded through the original payment method
          where that is possible. A refund is subject to the applicable policy, the provider’s process
          and applicable law, and a provider’s own timeline applies to when funds appear.
        </p>
        <p>
          Where a chargeback or a payment dispute is raised, Toothlogy may provide the transaction
          information to the payment provider or financial institution, may hold a related settlement
          while it is investigated, and may act under §37 where a transaction appears fraudulent.
          Toothlogy cooperates with payment providers, financial institutions and authorities where
          applicable law requires it.
        </p>

        <h3 id="s67">67. Promotions, coupons and offers</h3>
        <p>A promotion may carry its own conditions, covering:</p>
        <List items={PROMOTION_TERMS} label="Promotion conditions" />
        <p>
          Unless a promotion states otherwise, a benefit is personal, not transferable, not exchangeable
          for cash, and cannot be combined with another offer. Toothlogy may modify or withdraw a
          promotion, subject to applicable law and to the conditions stated for that promotion, and may
          cancel a benefit obtained through misuse.
        </p>

        <h3 id="s68">68. Referral and reward programmes</h3>
        <p>
          Where a referral or reward programme is offered, the following are prohibited, and a reward may
          be withheld, reversed or cancelled where they are detected:
        </p>
        <List items={REFERRAL_ABUSE} label="Referral abuse" />
        <p>
          Repeated or deliberate abuse may also lead to action under §37. Where such a programme is not
          offered, nothing in this section implies that it is.
        </p>

        <h3 id="s69">69. Government, institutional and partner branding</h3>
        <p>The following may not be used without the authorisation of the owner:</p>
        <List items={BRANDING_PROTECTED} label="Protected names and marks" />
        <p>
          No participant may use such a name, logo, seal or emblem, or design material that resembles
          one, in a way that implies official government or institutional endorsement, approval,
          accreditation or sponsorship without a specific written authorisation for that use. §14 and
          §10 govern what a permission, support arrangement or collaboration actually means, and it may
          not be described as more than it is.
        </p>

        <h3 id="s70">70. Research and educational programmes</h3>
        <p>
          Where Toothlogy conducts or supports a research or educational programme, that programme may
          require:
        </p>
        <List items={RESEARCH_REQUIREMENTS} label="Research programme requirements" />
        <p>
          Not every data-collection activity is research. A screening record, a Camp register, a referral
          record or a programme report is operational, and is used for the purpose it was collected for.
          An activity is described as research only where it is research, and then only with the consent
          and approvals that research requires.
        </p>

        <h3 id="s71">71. Public-health and programme reporting</h3>
        <p>Toothlogy may produce reports about a Camp or programme, such as:</p>
        <List items={PUBLIC_HEALTH_REPORTS} label="Programme reporting" />
        <p>
          Such reports use aggregated or de-identified information wherever identifying an individual is
          unnecessary. Identifiable information is included only where there is a lawful basis and, where
          consent is the basis, the consent required. A report to a Government Authority, an institution
          or a Partner is made within the scope of the arrangement for that activity, and does not imply
          endorsement by the recipient.
        </p>

        <h3 id="s72">72. Anti-bribery and ethical conduct</h3>
        <p>
          Bribery, kickbacks, facilitation payments, improper payments, fraudulent incentives and
          unethical benefits are prohibited — offered, given, requested or accepted — in any dealing
          involving:
        </p>
        <List items={INTEGRITY_PARTIES} label="Parties covered by the integrity rules" />
        <p>
          This includes any payment or benefit intended to obtain a permission, an approval, a listing, a
          placement, a referral, a certificate, a rating or preferential treatment. Every party must
          comply with the applicable anti-corruption laws, and a breach is grounds for immediate action
          under §37.
        </p>

        <h3 id="s73">73. Conflict of interest</h3>
        <p>
          A material conflict of interest must be disclosed before the activity it affects, in particular
          by:
        </p>
        <List items={CONFLICT_PARTIES} label="Who must disclose a conflict" />
        <p>
          Examples include a financial interest in a product being recommended, a referral arrangement
          that is not disclosed, a family or business relationship affecting a selection, and sponsorship
          that could influence clinical or editorial content. Disclosure allows the conflict to be
          managed; concealment is a breach of these Terms.
        </p>

        <h3 id="s74">74. Reporting concerns, and protection from retaliation</h3>
        <p>A serious concern may be reported, including:</p>
        <List items={REPORTABLE} label="What may be reported" />
        <p>
          Reports may be sent to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. A report is handled
          confidentially so far as is reasonably possible and as applicable law permits, and may be
          reported to an authority where the law requires it. Retaliation against a person who makes a
          report in good faith — including exclusion from a programme, withdrawal of a certificate, or
          adverse treatment of a Student, Intern, Volunteer, employee or Partner — is prohibited to the
          extent applicable law requires, and is itself a breach of these Terms. A knowingly false report
          is also a breach.
        </p>

        <h3 id="s75">75. Accessibility and inclusion</h3>
        <p>
          Toothlogy aims to make the Platform reasonably accessible and usable by people with
          disabilities, subject to technical feasibility and applicable law, and treats an accessibility
          problem as a defect to be fixed. It does not claim conformance with a particular accessibility
          standard, or that every part of the Platform is fully accessible, unless that has been
          verified and is stated for that part. An accessibility barrier can be reported to{' '}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>, and an alternative way to complete a task will be
          offered where one is reasonably available.
        </p>

        <h3 id="s76">76. International users</h3>
        <p>
          The Platform may be used from, or extended to, jurisdictions other than India. Where it is,
          additional country-specific terms, privacy requirements, consumer protections, healthcare
          regulations and professional rules may apply, and those apply in addition to these Terms.
        </p>
        <p>
          §39 states that these Terms are governed by applicable Indian law, and that is not to be read
          as overriding a mandatory law of another jurisdiction that applies to a party there. Where a
          mandatory local law conflicts with these Terms, that law prevails for that party, and the rest
          of these Terms continue to apply.
        </p>

        <h3 id="s77">77. Language versions</h3>
        <p>
          Toothlogy may publish translations of these Terms for convenience. The English version is the
          reference version, and where a translation and the English version are inconsistent the
          English version governs — except where applicable law in a particular jurisdiction requires a
          local-language version to control, in which case that version controls for that jurisdiction.
        </p>

        <h3 id="s78">78. Notices</h3>
        <p>A legal or platform notice may be given by:</p>
        <List items={NOTICE_METHODS} label="How notices may be given" />
        <p>
          A notice is effective when sent or published by one of these methods, and it is each party’s
          responsibility to keep its contact details current (§4). A notice to Toothlogy should be sent
          to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>

        <h3 id="s79">79. Assignment</h3>
        <p>Toothlogy may transfer or assign its rights and obligations under these Terms in connection with:</p>
        <List items={ASSIGNMENT_EVENTS} label="When Toothlogy may assign" />
        <p>
          Where that happens, the rights of a User, Patient, Dentist, Vendor or other party under these
          Terms and under applicable privacy law are not reduced by the transfer alone. A User, Dentist,
          Clinic, Vendor or other party may not assign or transfer its account, profile, listing or
          participation without authorisation where the Platform prohibits it (§4).
        </p>

        <h3 id="s80">80. No waiver</h3>
        <p>
          A delay or failure to enforce a provision is not a waiver of it, and does not prevent
          enforcement later. A waiver is effective only where it is given in writing, and applies only to
          the instance it names.
        </p>

        <h3 id="s81">81. Survival</h3>
        <p>
          The following continue to apply after an account, participation or agreement ends, to the
          extent their subject matter requires and applicable law permits:
        </p>
        <List items={SURVIVING} label="Provisions that survive termination" />

        <h3 id="s82">82. Access to the legal documents</h3>
        <p>
          The legal documents are reachable from the footer of every page, and the applicable terms can
          be reviewed before a registration, booking, purchase or programme enrolment is completed.
        </p>
        <p>
          Published today: these <Link href="/terms">Master Terms &amp; Conditions</Link>, the{' '}
          <Link href="/privacy">Privacy Policy</Link>, and the{' '}
          <Link href="/terms/interns-volunteers">Terms for interns and volunteers</Link>. A Cookie
          Policy, a Refund and Cancellation Policy, a Disclaimer and Community Guidelines are not
          published at the date of this version; where one is published it will be linked from the
          footer and listed here, and until then nothing in this document should be read as
          incorporating a document that does not exist.
        </p>

        <h3 id="s83">83. Version control</h3>
        <p>
          This document is <strong>Version {VERSION}</strong>, effective {EFFECTIVE_DATE}, last updated{' '}
          {LAST_UPDATED}. Each published version carries a version number, an effective date and a
          last-updated date, and Toothlogy keeps a record of earlier versions and of material changes so
          that the version a party accepted (§51) can be identified.
        </p>
        <p className="tl-muted">
          Change history — Version 1.0 ({EFFECTIVE_DATE}): first publication of the Master Terms &amp;
          Conditions, consolidating the terms for every role into one document.
        </p>

        <h3 id="s84">84. Legal hierarchy</h3>
        <p>The documents that may govern a relationship with Toothlogy are:</p>
        <ol aria-label="Legal hierarchy">
          {LEGAL_HIERARCHY.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <p>
          These Master Terms are the general framework and apply to everyone. A policy listed above
          governs its own subject matter and is read together with these Terms. Where a specific written
          agreement legally governs a particular relationship — a Vendor agreement, a Dentist or Clinic
          agreement, an internship or volunteer agreement, a college memorandum of understanding, a
          government or institutional agreement, or Camp-specific terms — that agreement supplements
          these Terms and overrides them for the parties to it, to the extent it expressly says so and
          applicable law permits. Everything it does not cover continues to be governed by these Terms.
          A requirement that is stricter than these Terms applies in addition to them, not instead of
          them. A document in this list that has not been published is not in force.
        </p>

        <h3 id="s85">85. Contact</h3>
        <p>
          Toothlogy
          <br />
          Email: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </p>
        <p className="tl-muted">
          Toothlogy has not provided a registered legal entity name, registered office address,
          telephone number, company registration number or grievance officer details for publication, so
          none is stated here. When those details are provided they will be added to this section and to
          §38, and this document’s version will be updated.
        </p>
      </section>

      <p className="tl-muted">© Toothlogy. All rights reserved.</p>
    </div>
  );
}
