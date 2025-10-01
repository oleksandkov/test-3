const TEAM_DIRECTORY = [
  {
    name: "Oleksandr Koval",
    aliases: ["Oleksandr Kovalenko"],
    email: "muaronok@gmail.com",
    role: "Lead Engineer",
  },
  {
    name: "Halyna Liubchych",
    aliases: ["Mariana Danyliuk"],
    email: "galina.lubchich@gmail.com",
    role: "Product Strategist",
  },
  {
    name: "Andriy Koval",
    aliases: ["Taras Hrytsenko"],
    email: "andriy.koval@gov.ab.ca",
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

const TEAM_LOOKUP = new Map();

TEAM_DIRECTORY.forEach((member) => {
  const primaryKey = member.name?.toLowerCase?.() || "";
  if (primaryKey && !TEAM_LOOKUP.has(primaryKey)) {
    TEAM_LOOKUP.set(primaryKey, member);
  }

  if (Array.isArray(member.aliases)) {
    member.aliases.forEach((alias) => {
      const key = typeof alias === "string" ? alias.trim().toLowerCase() : "";
      if (key && !TEAM_LOOKUP.has(key)) {
        TEAM_LOOKUP.set(key, member);
      }
    });
  }
});

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
