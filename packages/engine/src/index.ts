export type ParameterType = "qty" | "range" | "exact" | "yes_no" | "pass_fail" | "select" | "text";
export type ParameterResult = "pass" | "fail" | "missing" | "invalid" | "evidence" | "recorded" | "na";
export type InspectionResult = "PASS" | "FAIL" | "HOLD" | "INCOMPLETE";

export interface ParameterDefinition {
  id: string; type: ParameterType; mandatory?: boolean; critical?: boolean; evidence?: boolean;
  expected?: string | number; min?: number; max?: number; options?: string[]; accept?: string[]; applies?: string[];
}
export interface ParameterEntry { v?: unknown; ev?: unknown[] }
export interface TemplateStage { code: string; sections: Array<{ params: ParameterDefinition[] }> }
export interface TemplateDefinition { stages: TemplateStage[] }
export interface StageSummary { total: number; done: number; pass: number; fail: number; missing: number; evidence: number }
export interface InspectionSummary extends StageSummary {
  critFail: number; result: InspectionResult; failed: ParameterDefinition[]; byStage: Record<string, StageSummary>;
}

const NUMERIC = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;
interface Decimal { coefficient: bigint; scale: number }

function decimal(value: unknown): Decimal | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "number" && !Number.isFinite(value)) return undefined;
  const text = String(value).trim();
  if (!NUMERIC.test(text)) return undefined;
  const negative = text.startsWith("-");
  const unsigned = text.replace(/^[+-]/, "").replace(",", ".");
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const digits = `${whole || "0"}${fraction}`.replace(/^0+(?=\d)/, "");
  let coefficient = BigInt(digits || "0") * (negative ? -1n : 1n);
  let scale = fraction.length;
  while (scale > 0 && coefficient % 10n === 0n) { coefficient /= 10n; scale--; }
  return { coefficient, scale };
}

function compare(left: Decimal, right: Decimal): number {
  const scale = Math.max(left.scale, right.scale);
  const a = left.coefficient * 10n ** BigInt(scale - left.scale);
  const b = right.coefficient * 10n ** BigInt(scale - right.scale);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Parse a plain decimal; units, grouping separators, exponents, NaN and Infinity are rejected. */
export function parseDecimal(value: unknown): number | undefined {
  const parsed = decimal(value);
  if (!parsed) return undefined;
  const result = Number(parsed.coefficient) / 10 ** parsed.scale;
  return Number.isFinite(result) ? result : undefined;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function exactMatch(value: unknown, expected: unknown): boolean {
  const a = decimal(value);
  const b = decimal(expected);
  if (a && b) return compare(a, b) === 0;
  return String(value).trim().toLocaleLowerCase("en-US") === String(expected).trim().toLocaleLowerCase("en-US");
}

export function evalParam(parameter: ParameterDefinition, entry?: ParameterEntry): ParameterResult {
  const value = entry?.v;
  const empty = isEmpty(value);
  let result: ParameterResult;
  if (empty) result = parameter.mandatory === false ? "na" : "missing";
  else switch (parameter.type) {
    case "qty": {
      const actual = decimal(value), expected = decimal(parameter.expected);
      result = !actual || !expected ? "invalid" : compare(actual, expected) === 0 ? "pass" : "fail";
      break;
    }
    case "range": {
      const actual = decimal(value), min = decimal(parameter.min), max = decimal(parameter.max);
      if (!actual || !min || !max || compare(min, max) > 0) return "invalid";
      result = compare(actual, min) >= 0 && compare(actual, max) <= 0 ? "pass" : "fail";
      break;
    }
    case "exact": result = exactMatch(value, parameter.expected) ? "pass" : "fail"; break;
    case "yes_no": result = value === parameter.expected ? "pass" : "fail"; break;
    case "pass_fail": result = value === "Pass" ? "pass" : "fail"; break;
    case "select":
      if (!Array.isArray(parameter.accept)) return "invalid";
      result = parameter.accept.includes(String(value)) ? "pass" : "fail";
      break;
    case "text": result = "recorded"; break;
    default: return "invalid";
  }
  if (parameter.evidence && !entry?.ev?.length) return result === "fail" ? "fail" : "evidence";
  return result;
}

/** Central precedence: critical FAIL > INCOMPLETE > HOLD > PASS. */
export function summarize(
  template: TemplateDefinition,
  values: Record<string, ParameterEntry | undefined>,
  variant?: string,
): InspectionSummary {
  const total: InspectionSummary = {
    total: 0, done: 0, pass: 0, fail: 0, missing: 0, evidence: 0, critFail: 0,
    result: "PASS", failed: [], byStage: {},
  };
  for (const stage of template.stages) {
    const stageResult: StageSummary = { total: 0, done: 0, pass: 0, fail: 0, missing: 0, evidence: 0 };
    total.byStage[stage.code] = stageResult;
    for (const section of stage.sections) for (const parameter of section.params) {
      if (parameter.applies?.length && (!variant || !parameter.applies.includes(variant))) continue;
      const result = evalParam(parameter, values[parameter.id]);
      if (result === "na") continue;
      total.total++; stageResult.total++;
      if (result === "missing" || result === "invalid") { total.missing++; stageResult.missing++; continue; }
      total.done++; stageResult.done++;
      if (result === "evidence") { total.evidence++; stageResult.evidence++; }
      else if (result === "pass" || result === "recorded") { total.pass++; stageResult.pass++; }
      else if (result === "fail") {
        total.fail++; stageResult.fail++; total.failed.push(parameter);
        if (parameter.critical) total.critFail++;
      }
    }
  }
  total.result = total.critFail ? "FAIL" : total.missing + total.evidence ? "INCOMPLETE" : total.fail ? "HOLD" : "PASS";
  return total;
}
