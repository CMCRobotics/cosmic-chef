# Cosmic Chef — Physics Reference

> **Purpose.** This is the single source of truth for the physics behind *Cosmic Chef*. It serves two audiences at once:
>
> - **Humans** (designers, artists, physics reviewers) — to keep the science story coherent.
> - **Coding agents** — to author new content (ingredients, dishes, recipes, UI copy, tutorials) without inventing fake physics.
>
> Each section gives the **straight physics** first, then the **game framing** in the kitchen metaphor.
>
> **Authoring rule:** update this document *first*, then make game content mirror it. This doc is the authority; scene fragments, components and data files are its implementation.
>
> *Scope:* content correctness only. For code architecture, build and conventions, see [`AGENTS.md`](../AGENTS.md).

---

## 1. The pitch

You are a **cosmic chef**. The universe is the kitchen, fundamental particles are the **ingredients**, and the laws of the Standard Model are the **rules of the kitchen**. Combining ingredients the way nature actually allows produces **bound states** — the **dishes** you serve to the never-ending appetite of the primordial chaos.

Core loop: **capture a recipe → direct the sous-chefs to prepare it → serve the dish.**

The design bet: the *presentation* is surreal and cosmic, but the *mechanics* are physics-honest. Players learn real particle physics by cooking with it.

---

## 2. Matter ingredients: quarks and leptons

**Physics.** The Standard Model (SM) describes all known elementary particles and three of the four fundamental forces (it does **not** include gravity). Matter is built from **6 quarks** and **6 leptons**, arranged in **3 generations**. Generations are copies of each other with increasing mass; heavier generations are unstable and decay toward generation 1, which is what ordinary matter is made of.

**Game framing.** Quarks and leptons are the pickups. Generation = rarity tier.

### 2.1 Quarks

| Gen | Flavour | Symbol | Mass (approx.) | Electric charge | Rarity tier |
|-----|---------|--------|----------------|-----------------|-------------|
| 1 | up | `u` | ~2.2 MeV | +2⁄3 | common |
| 1 | down | `d` | ~4.7 MeV | −1⁄3 | common |
| 2 | strange | `s` | ~93 MeV | −1⁄3 | exotic |
| 2 | charm | `c` | ~1.27 GeV | +2⁄3 | exotic |
| 3 | bottom | `b` | ~4.18 GeV | −1⁄3 | rare |
| 3 | top | `t` | ~173 GeV | +2⁄3 | legendary |

Quarks also carry **colour charge** (red / green / blue — nothing to do with visual colour). Colour is why quarks are never found alone (see §4, Rule 1).

### 2.2 Leptons

| Gen | Flavour | Symbol | Mass (approx.) | Electric charge | Rarity tier |
|-----|---------|--------|----------------|-----------------|-------------|
| 1 | electron | `e` | 0.511 MeV | −1 | common |
| 1 | electron neutrino | `νe` | < 1 eV (≈ 0) | 0 | common, elusive |
| 2 | muon | `μ` | 105.7 MeV | −1 | exotic |
| 2 | muon neutrino | `νμ` | < 1 eV | 0 | exotic, elusive |
| 3 | tau | `τ` | 1.777 GeV | −1 | rare |
| 3 | tau neutrino | `ντ` | < 1 eV | 0 | rare, elusive |

Leptons carry **no colour charge**, so they are not confined — the electron exists happily on its own.

> **Use these exact names, symbols and numbers in content.** They are deliberately rounded "kitchen approximations"; do not re-derive or invent alternatives.

### 2.3 Antimatter

Every quark and lepton has an **antiparticle** with the same mass and opposite charge: anti-up `ū` (−2⁄3), positron `e⁺` (+1), and so on. Matter meeting its antiparticle **annihilates** into energy.

**Game framing.** Antimatter is the mirror ingredient. Annihilation is a spectacular, expensive event — good for a set-piece moment, bad as a routine mechanic. Antiquarks are required for mesons (§3.1), so they must exist as pickups.

---

## 3. Forces: the cooking techniques

**Physics.** Particles interact by exchanging **force-carrier bosons**.

| Boson | Force | What it does | Game framing |
|-------|-------|--------------|--------------|
| gluon `g` | strong | binds quarks into hadrons; acts only at nuclear range | **heat** — the technique that fuses ingredients |
| photon `γ` | electromagnetic | binds electrons to nuclei; acts between charges | **light** — plating electrons around a nucleus |
| `W⁺`, `W⁻`, `Z` | weak | **changes one flavour into another**; drives decay | **transformation** — swap an ingredient in place |
| Higgs `H` | (Higgs field) | gives particles their mass | **seasoning/lore** — background, not a pickup |

Gravity is *not* part of the Standard Model. Content may mention it, but never list it as one of the kitchen's rules.

**Game framing.** Bosons are techniques/tools, not ingredients you serve. The gluon matters most in gameplay; W/Z is the "transmutation" tool; the photon assembles atoms; the Higgs is lore.

---

## 4. Dishes: legal combinations

**Physics.** Quarks bind into **hadrons**, and hadrons plus electrons build atoms. The rules below are not flavour text — they are the constraints any generated recipe must satisfy.

### Rule 1 — Confinement: no bare quarks
A quark can never be isolated; it must sit inside a colour-neutral bound state:

- **Baryon** = 3 quarks (e.g. proton `uud`, neutron `udd`)
- **Meson** = 1 quark + 1 antiquark (e.g. π⁺ = `ud̄`, K⁻ = `sū`)

**Game framing.** A lone quark is never a servable dish. It is an ingredient in hand; only the bound state is plateable.

### Rule 2 — Electric charge is conserved
The dish's charge is the sum of its parts, and total charge in must equal total charge out.

- proton `uud` = +2⁄3 +2⁄3 −1⁄3 = **+1**
- neutron `udd` = +2⁄3 −1⁄3 −1⁄3 = **0**
- π⁺ `ud̄` = +2⁄3 +1⁄3 = **+1**

**Game framing.** This is the puzzle mechanic: "balance the charge". Charges must land on a whole number, and each real dish has a target value.

### Rule 3 — Heavy flavours decay downward
Generation 2 and 3 flavours are unstable and decay via the weak force toward generation 1.

**Game framing.** Exotic and rare ingredients are perishable — they cannot sit on the shelf. This justifies timers, urgency and higher scores for gen-2/gen-3 dishes.

### Rule 4 — Leptons do not form hadrons
Leptons have no colour charge, so they never bind by the strong force. Electrons bind to nuclei **electromagnetically** to form atoms; neutrinos barely interact at all.

**Game framing.** Electrons are the plating step (nucleus → atom). Neutrinos pass straight through the kitchen — ghost ingredients, nearly impossible to catch.

### Rule 5 — Exotic hadrons are allowed
Tetraquarks (4) and pentaquarks (5) genuinely exist. Larger assemblies are legal content as long as they remain colour-neutral bound states.

### Reference dishes

| Dish | Composition | Charge | Kitchen tier |
|------|-------------|--------|--------------|
| proton | `uud` | +1 | staple |
| neutron | `udd` | 0 | staple |
| pion π⁺ | `ud̄` | +1 | quick bite |
| kaon K⁻ | `sū` | −1 | exotic |
| lambda Λ | `uds` | 0 | exotic |
| J/ψ | `cc̄` | 0 | showpiece |
| hydrogen atom | proton + electron | 0 | plated course |

---

## 5. Translation table

The authoritative mapping. Stay inside it when writing copy or designing interactions.

| Physics | Kitchen | Note |
|---------|---------|------|
| quark / lepton | ingredient | the raw pickups |
| antiparticle | mirror ingredient | needed for mesons |
| boson | technique / tool | never a served dish |
| generation 1 / 2 / 3 | common / exotic / rare | rarity and perishability |
| hadron (baryon, meson) | dish | the servable unit |
| nucleus + electrons | plated course | atoms |
| legal bound state | valid recipe | must satisfy §4 |
| decay | spoiling / expiry | drives urgency |
| charge conservation | charge balance | the core puzzle |
| confinement | "never serve it raw" | no bare quarks |

---

## 6. Accuracy guardrails

Claims to avoid, and the correct version. **Surreal presentation is welcome; incorrect physics is not.**

| ❌ Don't say | ✅ Say instead |
|-------------|---------------|
| "Serve a single up quark." | "Bind it into a hadron first" — confinement forbids free quarks. |
| "The electron is the smallest particle." | "The electron is a *fundamental* particle." Use *fundamental*, not *smallest*. |
| "Protons are the smallest building blocks." | Protons are composite hadrons made of quarks. |
| "The Standard Model has four forces including gravity." | Three forces: strong, electromagnetic, weak. Gravity is outside the SM. |
| "Quark colour is its visual colour." | Colour charge is a strong-force property, unrelated to visible colour. |
| "Neutrinos are easy to catch." | Neutrinos almost never interact — that is the point of them. |
| "Bosons are ingredients you cook." | Bosons carry forces; they are techniques, not dish components. |

Accurate and safe to reuse: 6 quarks, 6 leptons, 3 generations, 12 matter ingredients plus force carriers.

---

## 7. From this doc to the game

This document defines the **content contract**, not the storage format. The current codebase has no physics data yet; when you add it, keep the factual tables centralised here and never scatter Standard Model facts across gameplay code.

Two options consistent with the existing architecture (see [`AGENTS.md`](../AGENTS.md)):

1. **Component-driven** — a new A-Frame component in `public/components/` that owns ingredient/dish behaviour, matching the existing `load-fragment` / `linear-animation` pattern.
2. **Fragment-driven** — declare entities directly in a scene fragment such as `public/scene.html`, for small fixed sets.

Whichever is chosen, the values above remain the ground truth.

---

*Keep this document in sync with any content change that touches physics facts.*
