---
framework_version: 1.0.0
---

# US Application Specifics

US application portals (Greenhouse, Lever, Ashby, Workday, iCIMS) ask a set of questions
that don't appear on a CV or cover letter and don't exist in most non-US markets. This
file governs how to answer them. Read it alongside `08-application-forms.md` whenever a
posting or portal asks for work-authorization, demographic, salary, or acknowledgement
fields — `/apply`'s free-text-fields pass (its final step) routes into `08`, and these
US-specific fields travel with it.

**The grounding rule from `08-application-forms.md` still holds:** every answer is
*selected from* what the profile already states — here, the **Work Authorization** block in
`CLAUDE.md` / `01-candidate-profile.md` and the user's recorded preferences. Never guess a
legal status, a demographic, or a salary figure the profile doesn't support. When a form
demands an answer the profile doesn't cover, **stop and ask the user** — do not pick a
plausible value.

---

## Work-authorization questions

Almost every US application asks these two, usually as yes/no dropdowns:

| Question (varies in wording) | Answer from the profile |
|---|---|
| "Are you legally authorized to work in the United States?" | **Yes** if Status is US citizen, permanent resident, or any currently-valid work permit (OPT, STEM OPT, H-1B, TN, …). **No** only if the candidate has no current authorization. |
| "Will you now or in the future require sponsorship for employment visa status (e.g. H-1B)?" | Copy the **"Needs sponsorship now or in the future"** value verbatim. A candidate on OPT who will need H-1B later answers **Yes** here even though they can work now — the question is about the future, and answering No is a misrepresentation that surfaces at the offer stage. |

- These two are independent. The common true combination for an international new grad is
  *authorized: Yes* / *needs sponsorship: Yes*.
- If the posting already failed the Work Authorization Gate (`04-job-evaluation.md`), you
  are not filling this form — that check runs first.
- Some Workday forms add "What is your current work authorization type?" with a picklist.
  Match the profile's Status to the closest option; if none fits, pick "Other" and, where
  there's a text field, state the status plainly (e.g. "F-1 STEM OPT, EAD valid through
  2027-06").

---

## EEO / voluntary self-identification

After the application proper, US employers present a separate section asking for
**race/ethnicity, gender, veteran status, and disability status** (the last often as
federal form CC-305). Rules:

1. **It is voluntary and legally firewalled.** These responses go to HR/compliance, not
   the hiring team, and cannot lawfully affect the hiring decision. "I don't wish to
   answer" / "I choose not to self-identify" / "Decline to self-identify" is always a
   valid, consequence-free choice and is offered on every field.
2. **The assistant never infers demographics.** Not from a name, a photo, a school, a
   country of origin, anything. If the user has **pre-declared** answers during `/setup`,
   fill those. For every field they haven't pre-declared, select **"Decline to
   self-identify"** — that is the safe default, not a guess.
3. **Disability (CC-305)** has three options: yes / no / don't wish to answer. Same rule —
   the user's pre-declared answer, or "don't wish to answer".
4. **Veteran status** — the user's pre-declared answer, or "I don't wish to answer".
5. Never talk the user into or out of self-identifying. If they ask, the neutral facts:
   it's voluntary, it's separated from hiring, some candidates self-identify to support
   employer diversity reporting or because a category (protected veteran, disability) can
   carry affirmative-action benefits, others decline on privacy grounds. Their call.

---

## Salary questions

Two different questions, and the distinction is legally loaded:

| Question | How to answer |
|---|---|
| **"Desired / expected compensation"** or "What are your salary expectations?" | A researched **range** for this role, level, and metro — from `salary_lookup.py` if configured, else a brief market estimate the user confirms. Give a range, not a point. It is fine to answer "Open / negotiable, targeting $X–$Y based on the role and location" where the form allows text. |
| **"Current salary" / "salary history" / "most recent compensation"** | **Do not supply a prior-salary figure.** Asking for salary *history* is banned in much of the US — California, New York State & City, Colorado, Washington, Massachusetts, New Jersey, Illinois, Connecticut, Nevada, and more (state law, not federal, and the list keeps growing). Where the field is optional, leave it blank. Where it's a **required** field, flag it to the user: they can enter `0`, leave it as `N/A`, or answer with their *expected* range instead — but the assistant should never fabricate or carry over a real prior figure, and should tell the user the question may itself be unlawful for a role based in a ban state. |

- Many postings now include a pay range by law (CA, CO, NY, WA, IL, …). Use it: anchor the
  "expected compensation" answer inside or slightly above the posted band, and note the
  posted range in the `NOTE TO SELF` block for negotiation.
- Never put a salary figure in the CV or cover letter.

---

## References

- **"Available upon request"** on the résumé — don't list names/contact details on the
  document itself.
- If the form has dedicated reference fields, fill them from `01-candidate-profile.md`'s
  References section. Do not invent references or list someone the user hasn't named.
- US employers typically contact references directly by phone/email late in the process;
  don't attach reference letters unless the posting explicitly asks.

---

## Acknowledgement checkboxes

Forms end with checkboxes: at-will employment acknowledgement, background-check consent,
drug-test consent, "information is accurate" attestation, e-signature.

- These are **the user's decisions**, not the assistant's. Present them plainly, note what
  each commits to (a background check runs after an offer; some states/roles restrict
  what a background check can consider; marijuana drug-testing rules vary by state), and
  let the user check them.
- The "all information provided is accurate and complete" attestation is a real reason the
  no-fabrication rule matters: a padded date or an inflated title on an application the
  user then attests to is grounds for rescinding an offer or termination for cause.

---

## Quick reference — order these appear on a typical portal

1. Résumé + cover letter upload → 2. Contact info → 3. Work-authorization dropdowns →
4. Screening / custom questions (see `08-application-forms.md`) → 5. Demographic /
EEO self-ID (voluntary) → 6. Acknowledgements + e-signature.
