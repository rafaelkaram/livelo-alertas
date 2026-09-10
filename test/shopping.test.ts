import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseParceiros } from "../src/sources/shopping.js";

const html = readFileSync(new URL("./fixtures/shopping-todos-os-parceiros.html", import.meta.url), "utf8");

describe("parseParceiros", () => {
  const parceiros = parseParceiros(html);

  it("lê a lista inteira de parceiros", () => {
    expect(parceiros.length).toBeGreaterThan(200);
  });

  it("traz paridade base ao lado da promocional", () => {
    const sams = parceiros.find((p) => p.parceiro === "Sam's Club");
    expect(sams).toBeDefined();
    expect(sams!.base).toBe(14);
    expect(sams!.atual).toBe(84);
    expect(sams!.atualClube).toBe(84);
    expect(sams!.campanha).toBe("PROMOTION");
  });

  it("distingue promoção exclusiva de Clube", () => {
    const petlove = parceiros.find((p) => p.parceiro === "Petlove Saúde");
    expect(petlove).toMatchObject({ base: 6, atual: 40, atualClube: 50, campanha: "PROMOTION_CLUB" });
  });

  it("parseia as datas no formato da Livelo", () => {
    const sams = parceiros.find((p) => p.parceiro === "Sam's Club")!;
    expect(sams.janela.fim?.toISOString()).toBe("2026-09-11T02:59:00.000Z"); // 10/09 23h59 BRT
  });

  it("limpa o HTML dos termos legais", () => {
    const comTermos = parceiros.find((p) => p.regras.length > 40)!;
    expect(comTermos.regras).not.toMatch(/<[a-z]/i);
  });
});
