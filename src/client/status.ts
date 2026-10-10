/**
 * Head-chef status panel text.
 *
 * Turns the machine's state and context into the lines shown on the large screen:
 * the recipe, the next action for the team, and what each sous-chef needs to do next.
 * Pure, so it is unit-tested; head-chef-status-display.js only renders the result.
 */

export interface StatusGesture {
  gesture: string;
  preparedState?: string | null;
}

export interface StatusStation {
  stationId: string;
  chefId: string | null;
  ingredientId: string | null;
  gesturesRequired: StatusGesture[];
  currentGestureIndex: number;
  progress: number;
}

export interface StatusContext {
  currentOrder: { name: string; composition?: string; finalStep: { gesture: string } } | null;
  stations: StatusStation[];
  ingredients: { id: string; completed: boolean }[];
  stirProgress: number;
  chefGestures: Record<string, string>;
  score: number;
  completedCount: number;
  penalizedCount: number;
}

/** Lines describing where the team is and what happens next. */
export function describeHeadChefStatus(state: string, context: StatusContext): string[] {
  const order = context.currentOrder;
  const lines: string[] = [];

  if (!order) {
    lines.push('RECETTE : aucune');
    lines.push('En attente de recette');
    lines.push(...scoreLines(context));
    return lines;
  }

  const total = context.ingredients.length;
  const done = context.ingredients.filter((i) => i.completed).length;

  lines.push(`RECETTE : ${order.name.toUpperCase()}${order.composition ? ` (${order.composition})` : ''}`);
  lines.push(`Suivant : ${nextAction(state, context)}`);
  lines.push('');
  lines.push(`Ingredients : ${done}/${total} livres`);
  lines.push('');
  lines.push('Sous-chefs :');
  context.stations.forEach((station) => lines.push(stationLine(station, state, context.chefGestures)));
  lines.push('');
  lines.push(state === 'readyForFinalStir' || state === 'recipeReadyForSubmit'
    ? `Melange final (tous) : ${Math.round(context.stirProgress)}%`
    : 'Melange final : apres les ingredients');
  lines.push(...scoreLines(context));
  return lines;
}

function nextAction(state: string, context: StatusContext): string {
  const total = context.ingredients.length;
  const done = context.ingredients.filter((i) => i.completed).length;

  switch (state) {
    case 'waitingForRecipe':
      return 'attendre la recette';
    case 'preparingIngredients':
      return `preparer (${total - done} restants)`;
    case 'readyForFinalStir':
      return `tous melangent (${Math.round(context.stirProgress)}%)`;
    case 'recipeReadyForSubmit':
      return 'plat pret : bouton vert au sol';
    case 'orderSuccess':
      return 'servi ! commande suivante';
    case 'orderPenalized':
      return 'rate ou annule, commande suivante';
    case 'gameOver':
      return 'fin de partie';
    default:
      return state;
  }
}

const GESTURE_LABELS: Record<string, string> = {
  tenderize: 'Attendrir',
  slice: 'Decouper',
  stir: 'Remuer',
};

function gestureLabel(gesture: string): string {
  return GESTURE_LABELS[gesture] ?? gesture;
}

function stationLine(station: StatusStation, state: string, chefGestures: Record<string, string>): string {
  if (!station.chefId) {
    return `  ${station.stationId} : aucun chef`;
  }

  const chef = station.chefId.replace('chef-', 'Chef ');
  const doing = chefGestures[station.chefId];
  const doingSuffix = doing && doing !== 'idle' ? `  [fait : ${gestureLabel(doing)}]` : '';

  if (!station.ingredientId) {
    const idleText = state === 'readyForFinalStir' ? 'pret a melanger' : 'libre';
    return `  ${chef} : ${idleText}${doingSuffix}`;
  }

  const steps = station.gesturesRequired;
  const current = steps[station.currentGestureIndex];
  const stepText = steps.length > 1 ? ` etape ${station.currentGestureIndex + 1}/${steps.length}` : '';
  return `  ${chef} : ${gestureLabel(current.gesture)} ${station.ingredientId}${stepText} ` +
    `${Math.round(station.progress)}%${doingSuffix}`;
}

function scoreLines(context: StatusContext): string[] {
  return [`Score ${context.score}  ·  servis ${context.completedCount}  ·  rates ${context.penalizedCount}`];
}
