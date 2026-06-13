// Visual + classification constants, ported verbatim from the original
// dashboard so a SaaS upload scores and colours identically to the CLI build.

export const SECTORS: Record<string, string> = {
  "Banking & finance": "#378ADD",
  "Telco & infrastructure": "#1D9E75",
  "Security & consulting": "#7F77DD",
  "Cloud & tech": "#D85A30",
  Utilities: "#BA7517",
  Education: "#D4537E",
  Other: "#888780",
};

export const SECDARK: Record<string, string> = {
  "Banking & finance": "#0C447C",
  "Telco & infrastructure": "#0F6E56",
  "Security & consulting": "#3C3489",
  "Cloud & tech": "#993C1D",
  Utilities: "#633806",
  Education: "#72243E",
  Other: "#4A4A48",
};

export const COMPANY_SECTOR: Record<string, string> = {
  ANZ: "Banking & finance",
  "Commonwealth Bank": "Banking & finance",
  NAB: "Banking & finance",
  Telstra: "Telco & infrastructure",
  Optus: "Telco & infrastructure",
  "nbn® Australia": "Telco & infrastructure",
  "Australia Post": "Telco & infrastructure",
  Infotrust: "Security & consulting",
  Versent: "Security & consulting",
  Accenture: "Security & consulting",
  "Self-employed": "Security & consulting",
  Hays: "Security & consulting",
  "Logicalis AP": "Security & consulting",
  Rapid7: "Security & consulting",
  Vanta: "Security & consulting",
  Freelance: "Security & consulting",
  CyberCX: "Security & consulting",
  AWS: "Cloud & tech",
  Cisco: "Cloud & tech",
  Microsoft: "Cloud & tech",
  Google: "Cloud & tech",
  "Yarra Valley Water": "Utilities",
  "La Trobe University": "Education",
  "RMIT University": "Education",
  "Uni of Melbourne": "Education",
};

export const ROLECOL: Record<string, string> = {
  Exec: "#7F77DD",
  "Director/Head": "#534AB7",
  Security: "#1D9E75",
  "Risk/Compliance": "#378ADD",
  Architecture: "#D85A30",
  Engineering: "#BA7517",
  Consulting: "#D4537E",
  Management: "#888780",
  "Sales/BD": "#639922",
  Analyst: "#085041",
  Recruitment: "#993C1D",
  Other: "#B4B2A9",
};

export const TOP_N = 25;
export const TITLE_MAX = 70;
export const SCAN_MIN_SCORE = 3;

export const ROLE_MAP: [string, string[]][] = [
  ["Exec", ["ceo", "cto", "ciso", "cfo", "coo", "chief", "founder", "owner", "managing director", "president"]],
  ["Director/Head", ["director", "head of", "vp", "vice president", "partner"]],
  ["Security", ["security", "cyber", "grc", "soc", "threat"]],
  ["Risk/Compliance", ["risk", "compliance", "audit", "assurance", "governance"]],
  ["Architecture", ["architect"]],
  ["Engineering", ["engineer", "developer", "devops", "sre"]],
  ["Consulting", ["consultant", "advisor", "consulting"]],
  ["Management", ["manager", "lead", "program", "project"]],
  ["Sales/BD", ["sales", "business development", "account", "partnership"]],
  ["Analyst", ["analyst"]],
  ["Recruitment", ["recruit", "talent"]],
];

export const SCAM_TERMS = [
  "crypto", "bitcoin", "forex", "binary option", "binary options", "trader", "trading coach",
  "investment opportunity", "guaranteed return", "1000x", "double your", "passive income",
  "work from home", "earn from home", "make money", "financial freedom", "loan", "sugar daddy",
  "sugar baby", "escort", "onlyofans", "onlyfans", "adult content", "hookup", "dating", "telegram",
  "whatsapp me", "dm me", "dm for", "click the link", "click link", "herbalife", "forever living",
  "arbonne", "mlm", "ponzi", "giveaway", "free money", "btc", "usdt",
];

export const NAME_SCAM_HINTS = SCAM_TERMS.concat(["http", "www.", ".com", "@", "official", "vip"]);

export const CONTACT_IN_TITLE = /(https?:\/\/|www\.|t\.me\/|@[\w.]+|\+?\d[\d ()-]{8,})/i;
export const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
export const NON_NAME = /[0-9$£€!?*#~^=<>{}[\]|\\/]/;

export const HEURISTIC_WEIGHTS = {
  no_company_or_title: 3,
  no_title: 1,
  scam_term_in_title: 3,
  promo_text_in_name: 3,
  contact_in_title: 2,
  missing_name_part: 2,
  symbols_in_name: 2,
  emoji_in_name: 1,
  implausibly_short_name: 2,
  all_caps_name: 1,
  duplicate_url: 2,
  duplicate_empty_profile: 2,
  no_url: 1,
};
