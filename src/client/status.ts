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
    lines.push('RECIPE: none');
    lines.push('Waiting for recipe capture');
    lines.push(...scoreLines(context));
    return lines;
  }

  const total = context.ingredients.length;
  const done = context.ingredients.filter((i) => i.completed).length;

  lines.push(`RECIPE: ${order.name.toUpperCase()}${order.composition ? ` (${order.composition})` : ''}`);
  lines.push(`Next: ${nextAction(state, context)}`);
  lines.push('');
  lines.push(`Ingredients: ${done}/${total} delivered`);
  lines.push('');
  lines.push('Sous-chefs:');
  context.stations.forEach((station) => lines.push(stationLine(station, state, context.chefGestures)));
  lines.push('');
  lines.push(state === 'readyForFinalStir' || state === 'recipeReadyForSubmit'
    ? `Final stir (all chefs): ${Math.round(context.stirProgress)}%`
    : 'Final stir: after all ingredients are ready');
  lines.push(...scoreLines(context));
  return lines;
}

function nextAction(state: string, context: StatusContext): string {
  const total = context.ingredients.length;
  const done = context.ingredients.filter((i) => i.completed).length;

  switch (state) {
    case 'waitingForRecipe':
      return 'waiting for recipe capture';
    case 'preparingIngredients':
      return `sous-chefs prepare the ingredients (${total - done} left)`;
    case 'readyForFinalStir':
      return `everyone stir together (${Math.round(context.stirProgress)}%)`;
    case 'recipeReadyForSubmit':
      return 'dish ready: press the floor button (green O) to submit';
    case 'orderSuccess':
      return 'dish served! waiting for the next crate';
    case 'orderPenalized':
      return 'order cancelled or failed, waiting for the next crate';
    case 'gameOver':
      return 'game over';
    default:
      return state;
  }
}

function stationLine(station: StatusStation, state: string, chefGestures: Record<string, string>): string {
  if (!station.chefId) {
    return `  ${station.stationId}: no chef assigned`;
  }

  const chef = station.chefId.replace('chef-', 'Chef ');
  const doing = chefGestures[station.chefId];
  const doingSuffix = doing && doing !== 'idle' ? `  [doing: ${doing}]` : '';

  if (!station.ingredientId) {
    const idleText = state === 'readyForFinalStir' ? 'ready to stir' : 'idle, nothing to prepare';
    return `  ${chef}: ${idleText}${doingSuffix}`;
  }

  const steps = station.gesturesRequired;
  const current = steps[station.currentGestureIndex];
  const stepText = steps.length > 1 ? ` step ${station.currentGestureIndex + 1}/${steps.length}` : '';
  return `  ${chef}: ${current.gesture.toUpperCase()} ${station.ingredientId}${stepText} ` +
    `${Math.round(station.progress)}%${doingSuffix}`;
}

function scoreLines(context: StatusContext): string[] {
  return [`Score ${context.score}  ·  served ${context.completedCount}  ·  failed ${context.penalizedCount}`];
}
