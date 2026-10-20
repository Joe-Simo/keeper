import { randomInt } from "node:crypto";
import { answers, search } from "./search";

/**
 * Keeper's house: the notes an owner writes once, the passes they hand out, and what happened
 * while they were away. Every function here is pure over a House object; store.ts persists it.
 *
 * The one rule everything else follows: a guest's question is searched only against notes their
 * pass covers. Private notes and unshared sections are never candidates, so they cannot be spoken,
 * paraphrased, or hinted at. A miss and a private hit get the same reply.
 */
export const SECTIONS = ["wifi", "kids", "pets", "kitchen", "house", "bins", "heating", "security", "emergency", "other"] as const;
export type Section = (typeof SECTIONS)[number];
export const SECTION_LABEL: Record<Section, string> = { wifi: "Wi-Fi", kids: "Kids", pets: "Pets", kitchen: "Kitchen", house: "House", bins: "Bins", heating: "Heating", security: "Security", emergency: "Emergency", other: "Other" };
export type Share = "guests" | "private";
export type Role = "sitter" | "guest" | "dog walker" | "family" | "helper";

export interface Note { id: string; title: string; section: Section; share: Share; text: string; steps?: string[]; keywords?: string[]; updatedAt: string; by: string }
export interface Pass { code: string; name: string; role: Role; sections: Section[]; from: string; until: string; createdAt: string; revokedAt?: string }
export interface Question { id: string; at: string; by: string; text: string; status: "open" | "answered"; reason: "not_found" | "not_shared"; answer?: string; answeredAt?: string; noteId?: string; told?: boolean }
export interface Activity { at: string; who?: string; text: string }
export interface House {
  id: string;
  name: string;
  owner: string;
  address: string;
  ownerKey: string;
  notes: Note[];
  passes: Pass[];
  questions: Question[];
  activity: Activity[];
  visit: { code: string; startedAt: string } | null;
  routine: { noteId: string; step: number; by: string; at: string } | null;
  lastNoteId: string | null;
  failedCodes: { at: string }[];
  seq: number;
}

export type Audience = { kind: "owner"; name: string } | { kind: "guest"; pass: Pass } | { kind: "locked" };

const now = () => new Date();
const iso = (d = now()) => d.toISOString();
const nextId = (h: House, p: string) => `${p}${(++h.seq).toString(36)}`;
const log = (h: House, text: string, who?: string) => {
  h.activity.unshift({ at: iso(), who, text });
  h.activity = h.activity.slice(0, 60);
};
const firstName = (s: string) => s.trim().split(/\s+/)[0];
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
function newCode(h: House) {
  for (;;) {
    const c = String(randomInt(1000, 10000));
    if (!h.passes.some((p) => p.code === c)) return c;
  }
}
export function newKey() {
  return Array.from({ length: 24 }, () => "abcdefghijkmnpqrstuvwxyz23456789"[randomInt(0, 32)]).join("");
}

/** The fictional demo home every new browser starts with. Phone numbers use the 555-01xx fiction range. */
export function newHouse(id: string, ownerKey = newKey()): House {
  const at = iso();
  const days = (n: number) => iso(new Date(Date.now() + n * 86_400_000));
  const n = (id: string, title: string, section: Section, share: Share, text: string, extra: Partial<Note> = {}): Note => ({ id, title, section, share, text, updatedAt: at, by: "Sam", ...extra });
  return {
    id,
    name: "14 Alder Lane",
    owner: "Sam",
    address: "14 Alder Lane",
    ownerKey,
    notes: [
      n("n-wifi", "Wi-Fi", "wifi", "guests", "The Wi-Fi network is Alder House and the password is lanternfish42, all lowercase.", { keywords: ["wifi", "password", "internet"] }),
      n("n-bedtime", "Mila's bedtime", "kids", "guests", "Mila goes to bed at 7:30. Bath first, then pajamas and teeth, two books, and the moon night light on. Leave the door open a hand's width.", {
        keywords: ["bedtime", "sleep", "mila", "night"],
        steps: ["Start the bath at 7:00. Warm, not hot. Mila washes her own hair.", "Pajamas and teeth. Her toothbrush is the green one.", "Two books, her choice. Two means two.", "Turn on the moon night light. Big light off.", "Leave the door open about a hand's width. If she asks for water once, that's fine."],
      }),
      n("n-allergy", "Mila's peanut allergy", "kids", "guests", "Mila is allergic to peanuts. No peanut butter or anything with nuts, and check labels. Her EpiPen is in the blue pouch on top of the fridge.", { keywords: ["allergy", "peanut", "epipen", "snack"] }),
      n("n-screens", "Screen time", "kids", "guests", "Mila can watch one episode after dinner. Bluey is fine. No tablet after 7.", { keywords: ["tv", "screen", "tablet", "episode"] }),
      n("n-dogfood", "Biscuit's dinner", "pets", "guests", "Biscuit eats at 6 PM: one cup of kibble from the bin under the sink, with a splash of warm water. No table scraps, even if he looks sad.", {
        keywords: ["dog", "feed", "biscuit", "dinner", "kibble"],
        steps: ["Take one cup of kibble from the bin under the sink.", "Add a splash of warm water and let it sit a minute.", "Put the bowl down on the mat by the back door.", "Refill his water bowl. Done. No scraps."],
      }),
      n("n-dogwalk", "Walking Biscuit", "pets", "guests", "The leash is on the hook by the back door. The loop around the block takes about 20 minutes. He pulls toward squirrels, so keep a short lead near the park.", { keywords: ["walk", "leash", "dog"] }),
      n("n-bins", "Trash and recycling", "bins", "guests", "The bins go out Sunday night for Monday pickup. Green is recycling, black is trash. They live beside the garage.", { keywords: ["trash", "recycling", "bins"] }),
      n("n-heat", "Thermostat", "heating", "guests", "The thermostat is in the hallway. Keep it around 68. Use the up and down arrows if you're cold or warm, but please don't change the schedule.", { keywords: ["thermostat", "heat", "temperature"] }),
      n("n-kitchen", "Kitchen", "kitchen", "guests", "Help yourself to anything in the fridge. Dishwasher tablets are under the sink; run it on Normal. The sharp knives are in the drawer left of the stove.", { keywords: ["fridge", "food", "dishwasher", "knives"] }),
      n("n-door", "The back door", "house", "guests", "The back door sticks. Lift the handle up, then push. It locks with the thumb turn.", { keywords: ["door", "back door", "lock", "stuck"] }),
      n("n-key", "Spare key", "house", "guests", "If you get locked out, Ruth next door at number 16 has a spare key.", { keywords: ["key", "locked out", "neighbor", "ruth"] }),
      n("n-emergency", "Emergency numbers", "emergency", "guests", "If anyone is hurt or in danger, call 911 first. The address is 14 Alder Lane. Sam's cell is 555-0142. Ruth next door is 555-0178. Mila's pediatrician, Dr. Okafor, is 555-0115. Biscuit's vet, Alder Vet, is 555-0190.", { keywords: ["emergency", "911", "doctor", "vet", "hospital", "phone"] }),
      n("n-alarm", "Alarm code", "security", "private", "The alarm code is 2580. Only family and Ruth have it.", { keywords: ["alarm", "code", "security"] }),
      n("n-cash", "Spare cash", "other", "private", "There's about 200 dollars in an envelope in the top desk drawer in the office.", { keywords: ["cash", "money", "envelope", "desk"] }),
      n("n-gift", "Priya's thank-you gift", "other", "private", "Priya's thank-you gift card is in the hall closet, top shelf, in the red envelope. It's a surprise.", { keywords: ["gift", "priya", "surprise", "closet"] }),
    ],
    passes: [
      { code: "4729", name: "Priya", role: "sitter", sections: ["wifi", "kids", "pets", "kitchen", "house", "bins", "heating", "emergency"], from: at, until: days(3), createdAt: at },
      { code: "6150", name: "Lee", role: "dog walker", sections: ["pets", "emergency"], from: at, until: days(3), createdAt: at },
    ],
    questions: [],
    activity: [{ at, who: "Sam", text: "set up the house manual and gave passes to Priya (sitter) and Lee (dog walker)." }],
    visit: null,
    routine: null,
    lastNoteId: null,
    failedCodes: [],
    seq: 0,
  };
}

// ---------------- who is speaking ----------------

export function passActive(p: Pass, at = now()) {
  return !p.revokedAt && new Date(p.from) <= at && at < new Date(p.until);
}

/** The owner key unlocks owner mode. Otherwise the device speaks for whoever's pass is active. */
export function audienceOf(h: House, ownerKey?: string | null): Audience {
  if (ownerKey && ownerKey === h.ownerKey) return { kind: "owner", name: h.owner };
  const p = h.visit ? h.passes.find((x) => x.code === h.visit!.code) : undefined;
  if (p && passActive(p)) return { kind: "guest", pass: p };
  return { kind: "locked" };
}

/** Notes this audience may hear. Emergency notes are always included, even when locked. */
export function visibleNotes(h: House, a: Audience): Note[] {
  if (a.kind === "owner") return h.notes;
  if (a.kind === "locked") return h.notes.filter((n) => n.section === "emergency" && n.share === "guests");
  return h.notes.filter((n) => n.share === "guests" && (n.section === "emergency" || a.pass.sections.includes(n.section)));
}

const who = (a: Audience) => (a.kind === "owner" ? a.name : a.kind === "guest" ? a.pass.name : undefined);
const notOwner = (h: House) => ({ kind: "denied" as const, speech: `Only ${h.owner} can change the house manual or passes.` });

export function publicNote(n: Note) {
  return { id: n.id, title: n.title, section: n.section, sectionLabel: SECTION_LABEL[n.section], share: n.share, text: n.text, steps: n.steps ?? null, updatedAt: n.updatedAt };
}
const publicPass = (p: Pass) => ({ code: p.code, name: p.name, role: p.role, sections: p.sections, until: p.until, active: passActive(p), revoked: !!p.revokedAt });

const LOCKED = (h: House) => `I can share ${h.owner}'s house notes once you tell me your pass code. For an emergency, say "emergency".`;

// ---------------- visits ----------------

export function startVisit(h: House, rawCode: string) {
  const code = rawCode.replace(/\D/g, "");
  const recent = h.failedCodes.filter((f) => Date.now() - new Date(f.at).getTime() < 10 * 60_000);
  h.failedCodes = recent;
  if (recent.length >= 5) return { kind: "visit" as const, ok: false, speech: "Too many wrong codes. Please wait ten minutes and try again.", pass: null };
  const p = h.passes.find((x) => x.code === code);
  if (!p || p.revokedAt) {
    h.failedCodes.push({ at: iso() });
    return { kind: "visit" as const, ok: false, speech: `That code doesn't match a pass. Please check it with ${h.owner}.`, pass: null };
  }
  if (!passActive(p)) {
    const ended = new Date(p.until) <= now();
    return { kind: "visit" as const, ok: false, speech: ended ? `That pass ended. ${h.owner} can give you a new one.` : "That pass hasn't started yet.", pass: null };
  }
  h.visit = { code, startedAt: iso() };
  h.routine = null;
  h.failedCodes = [];
  log(h, `arrived (${p.role} pass).`, p.name);
  const labels = p.sections.filter((s) => s !== "emergency").map((s) => SECTION_LABEL[s]);
  const answered = h.questions.filter((q) => q.by === p.name && q.status === "answered" && !q.told);
  for (const q of answered) q.told = true;
  const news = answered.length ? ` ${h.owner} answered ${answered.length === 1 ? "your question" : `${answered.length} of your questions`}: ${answered.map((q) => q.answer).join(" ")}` : "";
  return {
    kind: "visit" as const,
    ok: true,
    speech: `Welcome, ${p.name}. I can help with ${list([...labels.map((l) => (l === "Wi-Fi" ? l : l.toLowerCase())), "emergencies"])}.${news}`,
    pass: publicPass(p),
    sectionLabels: labels,
    answered: answered.map((q) => ({ question: q.text, answer: q.answer! })),
  };
}

export function endVisit(h: House) {
  const p = h.visit ? h.passes.find((x) => x.code === h.visit!.code) : undefined;
  h.visit = null;
  h.routine = null;
  if (p) log(h, "left. Keeper is locked again.", p.name);
  return { kind: "visit_end" as const, speech: p ? `Thanks, ${p.name}. Keeper is locked again.` : "Keeper is already locked." };
}

// ---------------- asking ----------------

/** The note lexical search would answer with for this person, or null. Pure; used to decide whether to ask the resolver. */
export function lexicalAnswer(h: House, a: Audience, question: string): string | null {
  if (a.kind === "locked") return null;
  return search(question.trim(), visibleNotes(h, a), 3, h.notes).filter(answers)[0]?.id ?? null;
}

/**
 * Answers from the notes this person may hear. `resolvedId` is an optional note chosen by the
 * resolver (src/lib/resolver.ts) when lexical search misses; it is only used if that note is
 * visible to this person, so a resolver mistake can never reach a private note.
 */
export function ask(h: House, a: Audience, question: string, resolvedId?: string | null) {
  const q = question.trim();
  if (a.kind === "locked") {
    const em = /emergenc|911|hurt|bleed|fire|ambulance|police|poison|can't breathe|choking/i.test(q);
    if (em) return emergency(h, a);
    return { kind: "answer" as const, found: false, speech: LOCKED(h), note: null, related: [], loggedQuestion: null, locked: true };
  }
  const visible = visibleNotes(h, a);
  let hits = search(q, visible, 3, h.notes).filter(answers);
  if (!hits.length && resolvedId && visible.some((n) => n.id === resolvedId)) hits = [{ id: resolvedId, score: 0, coverage: 0, matched: [] }];
  if (hits.length) {
    const top = visible.find((n) => n.id === hits[0].id)!;
    const related = hits.slice(1).filter((x) => x.score * x.coverage >= hits[0].score * hits[0].coverage * 0.75).map((x) => visible.find((n) => n.id === x.id)!).slice(0, 2);
    h.lastNoteId = top.id;
    if (a.kind === "guest") log(h, `asked "${q}" and heard "${top.title}".`, a.pass.name);
    const walk = top.steps?.length ? ` I can walk you through it, ${top.steps.length} steps. Just say "walk me through it".` : "";
    return { kind: "answer" as const, found: true, speech: `${top.text}${walk}`, note: publicNote(top), related: related.map(publicNote), loggedQuestion: null, locked: false, via: hits[0].score ? ("search" as const) : ("resolver" as const) };
  }
  // Not answerable for this person. Record it for the owner, with whether a hidden note might cover it.
  if (a.kind === "owner") return { kind: "answer" as const, found: false, speech: "That isn't in your notes yet. You can say \"remember that\" followed by the answer.", note: null, related: [], loggedQuestion: null, locked: false };
  const hidden = search(q, h.notes.filter((n) => !visible.includes(n)), 3, h.notes).filter(answers);
  const item: Question = { id: nextId(h, "q"), at: iso(), by: a.pass.name, text: q, status: "open", reason: hidden.length ? "not_shared" : "not_found" };
  h.questions.unshift(item);
  h.questions = h.questions.slice(0, 50);
  log(h, `asked "${q}". It isn't in what ${h.owner} shared, so it went to ${h.owner}.`, a.pass.name);
  // Identical words whether a private note exists or not, so the reply leaks nothing.
  return { kind: "answer" as const, found: false, speech: `That isn't in ${h.owner}'s notes for you. I've sent ${h.owner} your question.`, note: null, related: [], loggedQuestion: { id: item.id, text: item.text }, locked: false };
}

export function emergency(h: House, a: Audience) {
  const notes = h.notes.filter((n) => n.section === "emergency" && n.share === "guests");
  const text = notes.map((n) => n.text).join(" ") || `Call 911. The address is ${h.address}.`;
  log(h, "asked for emergency information.", who(a));
  return { kind: "answer" as const, found: true, speech: text, note: notes[0] ? publicNote(notes[0]) : null, related: notes.slice(1).map(publicNote), loggedQuestion: null, locked: a.kind === "locked", emergency: true };
}

// ---------------- routines ----------------

export function walk(h: House, a: Audience, move: "start" | "next" | "back" | "repeat" | "stop", routine?: string) {
  if (a.kind === "locked") return { kind: "routine" as const, ok: false, speech: LOCKED(h), routine: null };
  const visible = visibleNotes(h, a).filter((n) => n.steps?.length);
  let note: Note | undefined;
  if (move === "start" || routine) {
    if (routine) {
      const hit = search(routine, visible, 3, h.notes).filter(answers)[0];
      note = hit ? visible.find((n) => n.id === hit.id) : undefined;
    } else note = visible.find((n) => n.id === h.lastNoteId) ?? undefined;
    if (!note) {
      const names = visible.map((n) => n.title.toLowerCase());
      return { kind: "routine" as const, ok: false, speech: names.length ? `I can walk you through ${list(names)}. Which one?` : "There are no step-by-step routines in what you can see.", routine: null };
    }
    h.routine = { noteId: note.id, step: 0, by: who(a) ?? "", at: iso() };
  } else {
    note = h.routine ? visible.find((n) => n.id === h.routine!.noteId) : undefined;
    if (!note || !h.routine) return { kind: "routine" as const, ok: false, speech: "We're not in a routine right now. Ask for bedtime or Biscuit's dinner, then say walk me through it.", routine: null };
    if (move === "stop") {
      h.routine = null;
      return { kind: "routine" as const, ok: true, speech: `Okay, stopped ${note.title.toLowerCase()}.`, routine: null };
    }
    if (move === "next") h.routine.step = Math.min(h.routine.step + 1, note.steps!.length);
    if (move === "back") h.routine.step = Math.max(h.routine.step - 1, 0);
    h.routine.at = iso();
  }
  const steps = note.steps!;
  const i = h.routine!.step;
  if (i >= steps.length) {
    h.routine = null;
    if (a.kind === "guest") log(h, `finished ${note.title.toLowerCase()}.`, a.pass.name);
    return { kind: "routine" as const, ok: true, speech: `That's everything for ${note.title.toLowerCase()}. Nice work.`, routine: { noteId: note.id, title: note.title, step: steps.length, total: steps.length, text: "All done.", steps, done: true } };
  }
  const prefix = i === 0 && move === "start" ? `${note.title}, ${steps.length} steps. ` : "";
  const tail = i === steps.length - 1 ? " That's the last step." : ` Say "next" when you're ready.`;
  return { kind: "routine" as const, ok: true, speech: `${prefix}Step ${i + 1}: ${steps[i]}${tail}`, routine: { noteId: note.id, title: note.title, step: i + 1, total: steps.length, text: steps[i], steps, done: false } };
}

// ---------------- owner: notes ----------------

const SECTION_HINTS: [Section, RegExp][] = [
  ["wifi", /wi-?fi|internet|router|password/i],
  ["emergency", /emergenc|911|hospital|doctor|pediatric|vet\b|poison/i],
  ["security", /alarm|security|safe\b|camera/i],
  ["kids", /\bmila\b|kid|child|bedtime|school|homework|friend|playdate/i],
  ["pets", /\bdog\b|biscuit|cat\b|leash|kibble|walk/i],
  ["bins", /trash|recycl|bins?\b|garbage/i],
  ["heating", /thermostat|heat|furnace|\bac\b|air con/i],
  ["kitchen", /fridge|kitchen|dishwasher|stove|oven|food|snack/i],
  ["house", /door|key|lock|window|light|garage|plant|water/i],
];
export const guessSection = (text: string): Section => SECTION_HINTS.find(([, re]) => re.test(text))?.[0] ?? "other";

function titleFrom(text: string) {
  const t = text.replace(/^(that|the)\s+/i, "").split(/[.,;:]/)[0].split(/\s+/).slice(0, 5).join(" ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function addNote(h: House, a: Audience, input: { text: string; title?: string; section?: Section; share?: Share; steps?: string[] }) {
  if (a.kind !== "owner") return notOwner(h);
  const text = input.text.trim().replace(/\s+/g, " ");
  const sentence = /[.!?]$/.test(text) ? text : `${text}.`;
  const note: Note = {
    id: nextId(h, "n-"),
    title: input.title?.trim() || titleFrom(text),
    section: input.section ?? guessSection(text),
    share: input.share ?? "private",
    text: sentence.charAt(0).toUpperCase() + sentence.slice(1),
    ...(input.steps?.length ? { steps: input.steps } : {}),
    updatedAt: iso(),
    by: a.name,
  };
  h.notes.push(note);
  h.lastNoteId = note.id;
  log(h, `added "${note.title}" (${note.share === "private" ? "private" : "shared with guests"}).`, a.name);
  const speech = note.share === "private" ? `Saved "${note.title}" as private. Say "share it" if guests should hear it.` : `Saved "${note.title}" and shared it with guests who have the ${SECTION_LABEL[note.section].toLowerCase()} section.`;
  return { kind: "note_saved" as const, speech, note: publicNote(note) };
}

export function updateNote(h: House, a: Audience, input: { note?: string; share?: Share; text?: string; section?: Section }) {
  if (a.kind !== "owner") return notOwner(h);
  const target = input.note ? findNote(h, input.note) : h.notes.find((n) => n.id === h.lastNoteId);
  if (!target) return { kind: "note_saved" as const, speech: "I couldn't tell which note you mean. Try its name, like \"the Wi-Fi note\".", note: null };
  if (input.text) target.text = input.text.trim();
  if (input.section) target.section = input.section;
  if (input.share) target.share = input.share;
  target.updatedAt = iso();
  h.lastNoteId = target.id;
  log(h, `${input.share === "guests" ? "shared" : input.share === "private" ? "made private" : "updated"} "${target.title}".`, a.name);
  const speech = input.share === "guests" ? `"${target.title}" is now shared with guests who have the ${SECTION_LABEL[target.section].toLowerCase()} section.` : input.share === "private" ? `"${target.title}" is private now. Guests won't hear it.` : `Updated "${target.title}".`;
  return { kind: "note_saved" as const, speech, note: publicNote(target) };
}

export function removeNote(h: House, a: Audience, name: string) {
  if (a.kind !== "owner") return notOwner(h);
  const target = findNote(h, name);
  if (!target) return { kind: "note_removed" as const, speech: "I couldn't find that note.", removed: null };
  h.notes = h.notes.filter((n) => n !== target);
  log(h, `removed "${target.title}".`, a.name);
  return { kind: "note_removed" as const, speech: `Removed "${target.title}".`, removed: target.title };
}

function findNote(h: House, name: string) {
  const exact = h.notes.find((n) => n.id === name || n.title.toLowerCase() === name.toLowerCase());
  if (exact) return exact;
  const hit = search(name, h.notes).filter((x) => x.coverage >= 0.5)[0];
  return hit ? h.notes.find((n) => n.id === hit.id) : undefined;
}

export function manual(h: House, a: Audience) {
  const notes = visibleNotes(h, a);
  const bySection = SECTIONS.map((s) => ({ section: s, label: SECTION_LABEL[s], notes: notes.filter((n) => n.section === s).map(publicNote) })).filter((g) => g.notes.length);
  const shared = notes.filter((n) => n.share === "guests").length;
  const speech = a.kind === "owner" ? `Your manual has ${plural(notes.length, "note")}: ${shared} shared with guests and ${notes.length - shared} private.` : a.kind === "guest" ? `You can ask about ${list(bySection.filter((g) => g.section !== "emergency").map((g) => g.label.toLowerCase()))}, and emergencies.` : LOCKED(h);
  return { kind: "manual" as const, speech, sections: a.kind === "locked" ? [] : bySection, owner: a.kind === "owner" };
}

// ---------------- owner: passes ----------------

export function createPass(h: House, a: Audience, input: { name: string; role?: Role; sections?: Section[]; days?: number; hours?: number }) {
  if (a.kind !== "owner") return notOwner(h);
  const name = firstName(input.name);
  const sections = [...new Set([...(input.sections?.length ? input.sections : SECTIONS.filter((s) => s !== "security" && s !== "other")), "emergency" as Section])];
  const ms = ((input.days ?? 0) * 24 + (input.hours ?? 0)) * 3_600_000 || 2 * 86_400_000;
  const old = h.passes.filter((p) => p.name.toLowerCase() === name.toLowerCase() && !p.revokedAt);
  for (const p of old) p.revokedAt = iso();
  const pass: Pass = { code: newCode(h), name, role: input.role ?? "guest", sections, from: iso(), until: iso(new Date(Date.now() + Math.min(ms, 30 * 86_400_000))), createdAt: iso() };
  h.passes.push(pass);
  log(h, `gave ${name} a ${pass.role} pass for ${list(sections.filter((s) => s !== "emergency").map((s) => SECTION_LABEL[s].toLowerCase()))}.`, a.name);
  const digits = pass.code.split("").join(" ");
  return { kind: "pass" as const, speech: `${name}'s code is ${digits}. It works until ${spokenTime(pass.until)} and covers ${list(sections.filter((s) => s !== "emergency").map((s) => SECTION_LABEL[s].toLowerCase()))}, plus emergencies.${old.length ? " Their old code no longer works." : ""}`, pass: publicPass(pass) };
}

export function revokePass(h: House, a: Audience, name: string) {
  if (a.kind !== "owner") return notOwner(h);
  const live = h.passes.filter((p) => p.name.toLowerCase() === firstName(name).toLowerCase() && !p.revokedAt);
  if (!live.length) return { kind: "pass" as const, speech: `${firstName(name)} doesn't have a pass.`, pass: null };
  for (const p of live) p.revokedAt = iso();
  if (h.visit && live.some((p) => p.code === h.visit!.code)) h.visit = null;
  log(h, `ended ${live[0].name}'s pass.`, a.name);
  return { kind: "pass" as const, speech: `Done. ${live[0].name}'s code no longer works.`, pass: publicPass(live[0]) };
}

export function passes(h: House, a: Audience) {
  if (a.kind !== "owner") return notOwner(h);
  const live = h.passes.filter((p) => passActive(p));
  const speech = live.length ? `${plural(live.length, "pass")} active: ${list(live.map((p) => `${p.name}, ${p.role}`))}.` : "No passes are active.";
  return { kind: "passes" as const, speech, passes: h.passes.filter((p) => !p.revokedAt).map(publicPass), visit: h.visit ? h.passes.find((p) => p.code === h.visit!.code)?.name ?? null : null };
}

// ---------------- owner: questions and recap ----------------

export function openQuestions(h: House, a: Audience) {
  if (a.kind !== "owner") return notOwner(h);
  const open = h.questions.filter((q) => q.status === "open");
  const speech = open.length ? `${plural(open.length, "question")} waiting. ${open.slice(0, 3).map((q) => `${q.by} asked: ${q.text.replace(/[?.!]*$/, "?")}`).join(" ")}` : "No questions are waiting.";
  return { kind: "questions" as const, speech, questions: open.map((q) => ({ id: q.id, by: q.by, text: q.text, at: q.at, reason: q.reason })) };
}

export function answerQuestion(h: House, a: Audience, input: { answer: string; question_id?: string; save_as_note?: boolean; share?: Share }) {
  if (a.kind !== "owner") return notOwner(h);
  const q = input.question_id ? h.questions.find((x) => x.id === input.question_id) : h.questions.find((x) => x.status === "open");
  if (!q) return { kind: "answered" as const, speech: "There's no open question to answer.", question: null, note: null };
  const answer = input.answer.trim();
  q.status = "answered";
  q.answer = /[.!?]$/.test(answer) ? answer : `${answer}.`;
  q.answeredAt = iso();
  let note: Note | null = null;
  if (input.save_as_note !== false) {
    const res = addNote(h, a, { text: q.answer, title: titleFrom(q.text.replace(/^(can|is|are|do|does|where|what|when|how|should)\s+(i|we|she|he|it|the)?\s*/i, "")), share: input.share ?? "guests" });
    note = "note" in res && res.note ? h.notes.find((n) => n.id === res.note!.id) ?? null : null;
    if (note) q.noteId = note.id;
  }
  // If the asker is here now, they hear it next time they speak; otherwise when they next arrive.
  log(h, `answered ${q.by}'s question.`, a.name);
  const shared = note && note.share === "guests";
  return {
    kind: "answered" as const,
    speech: `Got it. I'll tell ${q.by}${shared ? `, and it's saved to the manual for every guest with the ${SECTION_LABEL[note!.section].toLowerCase()} section` : ""}.`,
    question: { id: q.id, by: q.by, text: q.text, answer: q.answer },
    note: note ? publicNote(note) : null,
  };
}

/** Pending answers for a guest who is here now. Called by the server on every guest turn. */
export function deliverAnswers(h: House, a: Audience): string | null {
  if (a.kind !== "guest") return null;
  const ready = h.questions.filter((q) => q.by === a.pass.name && q.status === "answered" && !q.told);
  if (!ready.length) return null;
  for (const q of ready) q.told = true;
  return `Also, ${h.owner} answered your question: ${ready.map((q) => q.answer).join(" ")}`;
}

export function recap(h: House, a: Audience, limit = 8) {
  if (a.kind !== "owner") return notOwner(h);
  const items = h.activity.slice(0, limit);
  const open = h.questions.filter((q) => q.status === "open").length;
  const guests = [...new Set(items.filter((x) => x.who && x.who !== h.owner).map((x) => x.who!))];
  const here = h.visit ? h.passes.find((p) => p.code === h.visit!.code)?.name : null;
  const lines = guests.map((g) => {
    const heard = [...new Set(items.filter((x) => x.who === g).map((x) => x.text.match(/ and heard "(.+)"\.$/)?.[1]).filter(Boolean) as string[])];
    const sent = h.questions.filter((q) => q.by === g && q.status === "open").map((q) => q.text);
    const parts = [heard.length ? `heard ${list(heard)}` : "", sent.length ? `asked you ${sent.length === 1 ? `"${sent[0]}"` : `${sent.length} questions`}` : ""].filter(Boolean);
    return `${g} ${parts.length ? list(parts) : "checked in"}.`;
  });
  const speech = guests.length ? `${lines.join(" ")}${here ? ` ${here} is here now.` : ""}${open ? ` ${plural(open, "question")} need${open === 1 ? "s" : ""} your answer.` : " Nothing is waiting on you."}` : "No guests have used Keeper yet.";
  return { kind: "recap" as const, speech, activity: items, open, here: here ?? null };
}

export function spokenTime(isoTime: string) {
  const d = new Date(isoTime);
  return d.toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " Eastern";
}

/** What the simulator's side panel shows. Never includes the owner key. */
export function snapshot(h: House) {
  const here = h.visit ? h.passes.find((p) => p.code === h.visit!.code) : null;
  return {
    id: h.id,
    name: h.name,
    owner: h.owner,
    here: here ? { name: here.name, role: here.role } : null,
    passes: h.passes.filter((p) => !p.revokedAt).map(publicPass),
    notes: h.notes.map((n) => ({ id: n.id, title: n.title, section: n.section, share: n.share })),
    questions: h.questions.slice(0, 8).map((q) => ({ id: q.id, by: q.by, text: q.text, status: q.status, answer: q.answer ?? null })),
    activity: h.activity.slice(0, 8),
    routine: h.routine,
  };
}
