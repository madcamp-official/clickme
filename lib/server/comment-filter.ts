// Baseline anonymous-comment moderation: profanity/slurs and spam-style
// contact info (links, emails, phone numbers). This is a best-effort
// substring/pattern filter, not a full NLP moderation system, and it never
// reveals which rule tripped so evasion can't be tuned against the response.

const BANNED_SUBSTRINGS = [
  // Korean profanity, slurs, and common insult forms, including the
  // "시바"/"씨바" euphemistic misspellings people use specifically to dodge
  // naive filters, and the bare jamo abbreviations typed the same way.
  "씨발", "씨팔", "시발", "시팔", "시바", "씨바", "ㅅㅂ", "ㅄ", "개새끼", "개새기",
  "병신", "븅신", "지랄", "미친놈", "미친년", "쌍놈", "쌍년", "개년", "걸레같은",
  "좆같", "좃같", "니미", "니애미", "느금마", "느금", "화냥년", "잡년", "년아",
  "놈아", "걸레년",
  // English profanity and slurs.
  "fuck", "shit", "bitch", "asshole", "cunt", "nigger", "nigga", "faggot", "retard",
];

// Compound words that would otherwise false-positive against a banned
// substring above (시바견 = Shiba Inu, a completely ordinary word containing
// "시바"). Strip these out before matching.
const ALLOWED_COMPOUNDS = ["시바견", "씨바견"];

// Only collapse obfuscation characters sitting *between* two non-space
// characters (e.g. "시*발" -> "시발"). Real spaces between separate words are
// left untouched so ordinary sentences don't collapse into a false match.
function normalize(input: string): string {
  const collapsed = input.toLowerCase().replace(/(?<=\S)[*.\-_~]+(?=\S)/g, "");
  return ALLOWED_COMPOUNDS.reduce((text, compound) => text.replaceAll(compound, ""), collapsed);
}

const URL_PATTERN = /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|kr|io|xyz|me|co|shop|link|click|top|info)\b/i;
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_PATTERN = /01[016789][\s.-]?\d{3,4}[\s.-]?\d{4}/;

export function isCommentBodyAllowed(body: string): boolean {
  const normalized = normalize(body);
  if (BANNED_SUBSTRINGS.some((word) => normalized.includes(word))) return false;
  if (URL_PATTERN.test(body) || EMAIL_PATTERN.test(body) || PHONE_PATTERN.test(body)) return false;
  return true;
}
