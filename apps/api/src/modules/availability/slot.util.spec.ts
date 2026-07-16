import {
  generateStarts,
  fitsInWindows,
  isFree,
  freeStarts,
  type Interval,
} from "./slot.util";

// Helpers: minutos desde 00:00 (09:00 = 540).
const w = (start: number, end: number): Interval => ({ start, end });

describe("slot.util", () => {
  describe("generateStarts (passo = duração — D4)", () => {
    it("encaixa slots de 60min em 09:00–12:00 → 09:00,10:00,11:00", () => {
      expect(generateStarts([w(540, 720)], 60)).toEqual([540, 600, 660]);
    });

    it("respeita a borda: 90min em 09:00–12:00 → 09:00,10:30 (11:00+90 estoura)", () => {
      expect(generateStarts([w(540, 720)], 90)).toEqual([540, 630]);
    });

    it("cobre múltiplas faixas (ex.: manhã + tarde)", () => {
      expect(generateStarts([w(540, 660), w(780, 900)], 60)).toEqual([
        540, 600, 780, 840,
      ]);
    });

    it("duração <= 0 → nenhum slot (guarda contra loop infinito)", () => {
      expect(generateStarts([w(540, 720)], 0)).toEqual([]);
    });

    it("faixa menor que a duração → vazio", () => {
      expect(generateStarts([w(540, 570)], 60)).toEqual([]);
    });
  });

  describe("fitsInWindows", () => {
    it("cabe inteiro dentro da faixa", () => {
      expect(fitsInWindows(600, 60, [w(540, 720)])).toBe(true);
    });
    it("na borda final exata cabe", () => {
      expect(fitsInWindows(660, 60, [w(540, 720)])).toBe(true);
    });
    it("estourar a faixa não cabe", () => {
      expect(fitsInWindows(680, 60, [w(540, 720)])).toBe(false);
    });
    it("antes do início não cabe", () => {
      expect(fitsInWindows(520, 60, [w(540, 720)])).toBe(false);
    });
  });

  describe("isFree (buffer = intervalo entre atendimentos)", () => {
    const occ = [w(600, 660)]; // corte existente 10:00–11:00

    it("sem ocupados → livre", () => {
      expect(isFree(540, 60, [], 0)).toBe(true);
    });

    it("sobreposição direta → ocupado", () => {
      expect(isFree(600, 60, occ, 0)).toBe(false);
      expect(isFree(630, 60, occ, 0)).toBe(false); // começa no meio
    });

    it("interval 0: tangência é permitida (encosta sem gap)", () => {
      expect(isFree(540, 60, occ, 0)).toBe(true); // 09–10 encosta em 10:00
      expect(isFree(660, 60, occ, 0)).toBe(true); // 11–12 encosta no fim
    });

    it("interval 15: exige gap dos dois lados", () => {
      // 09:00–10:00 encostaria em 10:00 → sem os 15min de buffer → ocupado
      expect(isFree(540, 60, occ, 15)).toBe(false);
      // 11:00 encostaria no fim (11:00) → sem buffer → ocupado
      expect(isFree(660, 60, occ, 15)).toBe(false);
      // 11:15 respeita o buffer após o atendimento → livre
      expect(isFree(675, 60, occ, 15)).toBe(true);
    });
  });

  describe("freeStarts (grade filtrada por ocupação)", () => {
    it("remove o slot ocupado; tangências livres com interval 0", () => {
      // 09–12, 60min, ocupado 10:00–11:00 → sobram 09:00 e 11:00
      expect(freeStarts([w(540, 720)], [w(600, 660)], 60, 0)).toEqual([540, 660]);
    });

    it("dia totalmente livre → grade cheia", () => {
      expect(freeStarts([w(540, 720)], [], 60, 0)).toEqual([540, 600, 660]);
    });

    it("interval derruba os vizinhos imediatos do ocupado", () => {
      // com buffer 15, nem 09:00 nem 11:00 cabem colados no corte 10–11
      expect(freeStarts([w(540, 720)], [w(600, 660)], 60, 15)).toEqual([]);
    });

    it("dois cortes deixam só o buraco que sobra", () => {
      // 09–12, 60min; ocupados 09:00–10:00 e 11:00–12:00 → sobra 10:00
      expect(
        freeStarts([w(540, 720)], [w(540, 600), w(660, 720)], 60, 0),
      ).toEqual([600]);
    });
  });
});
