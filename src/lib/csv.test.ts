import { describe, expect, it } from "vitest";
import { csvField, toCsv } from "./csv";

describe("csvField", () => {
  it("passes plain values through and renders empties as blank", () => {
    expect(csvField("hello")).toBe("hello");
    expect(csvField(42)).toBe("42");
    expect(csvField(0)).toBe("0");
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
    expect(csvField(true)).toBe("true");
    expect(csvField(NaN)).toBe("");
  });

  it("quotes fields containing commas, quotes or newlines and doubles embedded quotes", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
    expect(csvField("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("neutralises spreadsheet formulas in text", () => {
    expect(csvField("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvField("+1+1")).toBe("'+1+1");
    expect(csvField("-2+3")).toBe("'-2+3");
    expect(csvField("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvField("\tcmd")).toBe("'\tcmd");
  });

  it("does not mangle legitimate negative numbers or dates", () => {
    expect(csvField(-5)).toBe("-5");
    expect(csvField(new Date("2026-10-15T10:00:00.000Z"))).toBe("2026-10-15T10:00:00.000Z");
  });
});

describe("toCsv", () => {
  it("writes a BOM, a header row and CRLF line endings", () => {
    const csv = toCsv(
      [
        { header: "Reference", value: (r: { ref: string; n: number | null }) => r.ref },
        { header: "Minutes", value: (r) => r.n },
      ],
      [
        { ref: "FP-1", n: 12 },
        { ref: "FP-2", n: null },
      ],
    );
    expect(csv).toBe("﻿Reference,Minutes\r\nFP-1,12\r\nFP-2,\r\n");
  });

  it("emits only the header for no rows", () => {
    expect(toCsv([{ header: "A", value: () => 1 }], [])).toBe("﻿A\r\n");
  });
});
