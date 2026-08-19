import { describe, it, expect } from "vitest";
import { toCsv, csvAmount } from "./csv";

describe("csv", () => {
  it("monta CSV com separador ; e linhas CRLF", () => {
    expect(toCsv(["A", "B"], [["1", "2"], ["3", "4"]])).toBe(
      "A;B\r\n1;2\r\n3;4",
    );
  });

  it("escapa campos com separador, aspas ou quebra de linha", () => {
    expect(toCsv(["X"], [["a;b"]])).toBe('X\r\n"a;b"');
    expect(toCsv(["X"], [['a"b']])).toBe('X\r\n"a""b"');
    expect(toCsv(["X"], [["a\nb"]])).toBe('X\r\n"a\nb"');
  });

  it("csvAmount usa vírgula decimal (Excel BR)", () => {
    expect(csvAmount(50)).toBe("50,00");
    expect(csvAmount(1234.5)).toBe("1234,50");
    expect(csvAmount(0)).toBe("0,00");
  });
});
