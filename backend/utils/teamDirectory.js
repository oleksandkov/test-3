const TEAM_DIRECTORY = [
  {
    name: "Oleksandr Kovalenko",
    email: "muaronok@gmail.com",
    role: "Lead Engineer",
  },
  {
    name: "Mariana Danyliuk",
    email: "mariana@smallco.com",
    role: "Product Strategist",
  },
  {
    name: "Taras Hrytsenko",
    email: "taras@smallco.com",
    role: "UX Researcher",
  },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseAdHocRecipient(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const angleMatch = trimmed.match(/<([^>]+)>/);
  if (angleMatch) {
    const email = angleMatch[1].trim();
    if (EMAIL_REGEX.test(email)) {
      const name = trimmed.replace(angleMatch[0], "").trim() || null;
      return { name, email };
    }
  }

  const candidate = trimmed.replace(/^mailto:\s*/i, "");
  if (EMAIL_REGEX.test(candidate)) {
    return { name: null, email: candidate };
  }

  const inlineMatch = trimmed.match(/([\w.+-]+@[\w.-]+\.[\w.-]+)/);
  if (inlineMatch) {
    const email = inlineMatch[1].trim();
    if (EMAIL_REGEX.test(email)) {
      const label =
        trimmed.replace(inlineMatch[1], "").replace(/[<>]/g, "").trim() || null;
      return { name: label, email };
    }
  }

  return null;
}

const TEAM_LOOKUP = new Map(
  TEAM_DIRECTORY.map((member) => [member.name.toLowerCase(), member])
);

export function findTeamMember(name) {
  if (!name) return null;
  const normalized = String(name).trim().toLowerCase();
  if (!normalized) return null;
  return TEAM_LOOKUP.get(normalized) || null;
}

export function getContactsForMembers(names = []) {
  if (!Array.isArray(names)) return { contacts: [], missing: [] };
  const contacts = [];
  const missing = new Set();
  const seenEmails = new Set();

  names.forEach((entry) => {
    const member = findTeamMember(entry);
    if (member?.email) {
      const lower = member.email.toLowerCase();
      if (!seenEmails.has(lower)) {
        contacts.push({ name: member.name, email: member.email });
        seenEmails.add(lower);
      }
      return;
    }

    const normalized = typeof entry === "string" ? entry.trim() : "";
    if (!normalized) {
      return;
    }

    const adHoc = parseAdHocRecipient(normalized);
    if (adHoc?.email) {
      const lower = adHoc.email.toLowerCase();
      if (!seenEmails.has(lower)) {
        contacts.push({
          name: adHoc.name || adHoc.email,
          email: adHoc.email,
        });
        seenEmails.add(lower);
      }
      return;
    }

    missing.add(normalized);
  });

  return { contacts, missing: Array.from(missing) };
}

export function listTeamMemberEmails() {
  return TEAM_DIRECTORY.map((member) => member.email).filter(Boolean);
}

export { TEAM_DIRECTORY };
