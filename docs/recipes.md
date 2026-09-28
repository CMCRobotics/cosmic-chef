# Cosmic Chef — Basic Recipes

> **Purpose.** This is the catalogue of playable recipes. Each recipe maps game gestures to particle combinations, bridging [`physics.md`](physics.md) (the particles and rules) and [`game.md`](game.md) (the sous-chef gestures and UI flow).
>
> **Authoring rule:** when adding a recipe, verify it against the binding rules in [`physics.md`](physics.md) §4. Each recipe must be a legal hadron under the confinement, charge, and decay rules.

---

## Gesture rule of thumb

- **Tenderize** = Up-type quarks (up, charm, top)
- **Slice** = Down-type quarks (down, strange, bottom)
- **Stir** = Exotic & antimatter (generation 2+, antiparticles)

Each recipe assigns these gestures to ingredients. Sous-chefs work through them in sequence (or in parallel if multiple sous-chefs are available). Once all ingredients are prepared, the head chef triggers a final **Stir** to assemble the dish.

---

## Recipe 1: The Proton (staple)

| Ingredient | Gesture | Prepared State |
|-----------|---------|-----------------|
| Up | Tenderize | Tender Up |
| Up | Tenderize | Tender Up |
| Down | Slice | Sliced Down |

**Head chef Stirs** → **Proton** (composition: `uud`, charge +1)

**Physics:** Three quarks bound by the strong force into a stable baryon. The most common hadron in ordinary matter. See [`physics.md`](physics.md) §4, reference dishes.

---

## Recipe 2: The Neutron (staple)

| Ingredient | Gesture | Prepared State |
|-----------|---------|-----------------|
| Up | Tenderize | Tender Up |
| Down | Slice | Sliced Down |
| Down | Slice | Sliced Down |

**Head chef Stirs** → **Neutron** (composition: `udd`, charge 0)

**Physics:** A baryon with different quark mix; electrically neutral but still bound by the strong force. Stable when inside nuclei, free neutrons decay. See [`physics.md`](physics.md) §4, reference dishes.

---

## Recipe 3: The Pion π⁺ (quick bite — introduces antimatter)

| Ingredient | Gesture | Prepared State |
|-----------|---------|-----------------|
| Up | Tenderize | Tender Up |
| Anti-Down | Stir | Stirred Anti-Down |

**Head chef Stirs** → **Pion π⁺** (composition: `ud̄`, charge +1)

**Physics:** A meson (quark + antiquark bound state). Lighter and less stable than baryons; exotic gesture reflects the rarity of antimatter. See [`physics.md`](physics.md) §4, reference dishes, and §2.3 (antimatter).

---

## Recipe 4: The Lambda Λ (exotic — introduces strange quark)

| Ingredient | Gesture | Prepared State |
|-----------|---------|-----------------|
| Up | Tenderize | Tender Up |
| Down | Slice | Sliced Down |
| Strange | Stir | Stirred Strange |

**Head chef Stirs** → **Lambda Λ** (composition: `uds`, charge 0)

**Physics:** A baryon with a generation-2 (exotic) quark. Generation-2 particles are unstable and decay; the Stir gesture reflects the need for careful handling of perishable ingredients. See [`physics.md`](physics.md) §3 (decay) and §4, reference dishes.

---

*Keep this document in sync with the binding rules in [`physics.md`](physics.md). When adding recipes, verify charge conservation (§4, Rule 2) and confinement (§4, Rule 1).*
