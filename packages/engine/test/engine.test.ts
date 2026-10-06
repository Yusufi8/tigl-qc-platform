import { describe, expect, it } from "vitest";
import { evalParam, parseDecimal, summarize, type ParameterDefinition, type TemplateDefinition } from "../src/index.js";
import axisSeed from "../../../TIGL-QC-Dev-Packet/seed/axis_templates.json" with { type: "json" };

const range = (min: number, max: number, extra: Partial<ParameterDefinition> = {}): ParameterDefinition =>
  ({ id: "p", type: "range", min, max, ...extra });

describe("decimal rules", () => {
  it.each([["0.05", 0.05], ["0,03", 0.03], ["1,000", 1], ["-0.2", -0.2], [".5", 0.5], ["1.", 1]])(
    "parses %s", (input, expected) => expect(parseDecimal(input)).toBe(expected),
  );
  it.each(["0.03mm", "1e3", "NaN", "Infinity", "  ", "0,1.2"])(
    "rejects malformed %s", (input) => expect(parseDecimal(input)).toBeUndefined(),
  );
  it("compares exact decimal boundaries without binary float drift", () => {
    expect(evalParam(range(0, 0.3), { v: "0.300000000000000000" })).toBe("pass");
    expect(evalParam(range(0, 0.3), { v: "0.300000000000000001" })).toBe("fail");
  });
  it.each([
    [range(0, 0.05), "0.05", "pass"], [range(0, 0.05), "0.0501", "fail"],
    [range(0, 0.05), "0,03", "pass"], [range(0, 0.05), "0.03mm", "invalid"],
    [range(-0.2, 0.2), "-0.2", "pass"], [range(89.5, 90.5), "90.6", "fail"],
  ] as const)("evaluates range", (parameter, value, expected) => expect(evalParam(parameter, { v: value })).toBe(expected));
});

describe("parameter rules", () => {
  it("checks quantity and exact values numerically", () => {
    expect(evalParam({ id: "q", type: "qty", expected: 4 }, { v: "4.0" })).toBe("pass");
    expect(evalParam({ id: "q", type: "qty", expected: 4 }, { v: "3" })).toBe("fail");
    expect(evalParam({ id: "e", type: "exact", expected: 1440 }, { v: "1440.0" })).toBe("pass");
    expect(evalParam({ id: "e", type: "exact", expected: "15:1" }, { v: " 15:1 " })).toBe("pass");
  });
  it("checks choice and boolean rules", () => {
    expect(evalParam({ id: "s", type: "select", accept: ["IE2", "IE3"] }, { v: "IE1" })).toBe("fail");
    expect(evalParam({ id: "y", type: "yes_no", expected: "Yes" }, { v: "No" })).toBe("fail");
    expect(evalParam({ id: "p", type: "pass_fail" }, { v: "Pass" })).toBe("pass");
  });
  it("requires evidence and handles text", () => {
    expect(evalParam({ id: "p", type: "pass_fail", evidence: true }, { v: "Pass" })).toBe("evidence");
    expect(evalParam({ id: "p", type: "pass_fail", evidence: true }, { v: "Fail" })).toBe("fail");
    expect(evalParam({ id: "t", type: "text" }, { v: "SN-123" })).toBe("recorded");
  });
  it("distinguishes mandatory and optional empty values", () => {
    expect(evalParam({ id: "m", type: "text" }, { v: "" })).toBe("missing");
    expect(evalParam({ id: "m", type: "text", evidence: true }, { v: "" })).toBe("evidence");
    expect(evalParam({ id: "o", type: "qty", expected: 1, mandatory: false }, { v: "" })).toBe("na");
  });
});

describe("summary precedence and variants", () => {
  it("uses critical fail > incomplete > hold > pass", () => {
    const criticalAndMissing: TemplateDefinition = { stages: [{ code: "S", sections: [{ params: [
      { id: "bad", type: "pass_fail", critical: true }, { id: "missing", type: "text" },
    ] }] }] };
    expect(summarize(criticalAndMissing, { bad: { v: "Fail" } }).result).toBe("FAIL");
    const holdAndMissing: TemplateDefinition = { stages: [{ code: "S", sections: [{ params: [
      { id: "bad", type: "pass_fail" }, { id: "missing", type: "text" },
    ] }] }] };
    expect(summarize(holdAndMissing, { bad: { v: "Fail" } }).result).toBe("INCOMPLETE");
    const oneCheck: TemplateDefinition = { stages: [{ code: "S", sections: [{ params: [{ id: "p", type: "pass_fail" }] }] }] };
    expect(summarize(oneCheck, { p: { v: "Fail" } }).result).toBe("HOLD");
    expect(summarize(oneCheck, { p: { v: "Pass" } }).result).toBe("PASS");
  });
  it("omits checks belonging to other variants", () => {
    const template: TemplateDefinition = { stages: [{ code: "S", sections: [{ params: [
      { id: "auto", type: "pass_fail", applies: ["Automatic"] },
      { id: "manual", type: "pass_fail", applies: ["Manual"] },
    ] }] }] };
    const result = summarize(template, { auto: { v: "Fail" }, manual: { v: "Pass" } }, "Manual");
    expect(result.total).toBe(1);
    expect(result.result).toBe("PASS");
  });
});

describe("AXIS seed contract", () => {
  it("loads both templates with unique IDs and valid rule definitions", () => {
    const templates = axisSeed.templates as Array<{ code: string; stages: Array<{ sections: Array<{ params: ParameterDefinition[] }> }> }>;
    const counts = new Map<string, number>();
    for (const template of templates) {
      const params = template.stages.flatMap((stage) => stage.sections.flatMap((section) => section.params));
      expect(new Set(params.map((p) => p.id)).size).toBe(params.length);
      counts.set(template.code, params.length);
      for (const p of params) {
        expect(["qty", "range", "exact", "yes_no", "pass_fail", "select", "text"]).toContain(p.type);
        if (p.type === "range") {
          expect(Number.isFinite(p.min)).toBe(true);
          expect(Number.isFinite(p.max)).toBe(true);
          expect(p.min).toBeLessThanOrEqual(p.max as number);
        }
        if (p.type === "select") expect(p.accept?.length).toBeGreaterThan(0);
        if (["qty", "exact", "yes_no"].includes(p.type)) expect(p.expected).toBeDefined();
      }
    }
    expect(counts.get("AXIS-MM")).toBe(171);
    expect(counts.get("AXIS-TMH")).toBe(188);
  });
});
