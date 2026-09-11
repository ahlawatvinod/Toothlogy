/**
 * Phone numbers and email addresses in text meant for the public — community
 * posts, reviews. One rule, used wherever public text is accepted, so a
 * number refused in one place is not accepted in another.
 *
 * Indian mobiles in any usual format (+91, 0, spaces, dashes) and email
 * addresses. Deliberately not a general PII detector: false positives here
 * cost a person an edit, false negatives expose someone's number.
 */

// Digits, not word boundaries, delimit the number: "+919827012345" has no
// boundary between the 91 and the number, so a \b-based rule misses it.
const CONTACT = /(\b[\w.+-]+@[\w-]+\.[\w.-]+\b)|((?<!\d)(?:\+?91[\s-]?|0)?[6-9](?:[\s-]?\d){9}(?!\d))/;

export function containsContactDetails(text: string): boolean {
  return CONTACT.test(text);
}
