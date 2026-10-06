import { summarize } from '../../../packages/engine/src/index.ts';

/** The template argument must come from persisted server data; ignore all client result claims. */
export function evaluateInspection(templateFromDatabase, requestBody) {
  return summarize(templateFromDatabase, requestBody.values || {}, requestBody.variant);
}
