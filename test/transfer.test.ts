import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  extrairTiers,
  parseListaParceiros,
  parsePaginaParceiro,
  tierSeAplica,
  type ParceiroTransferencia,
  type PerfilClubes,
} from "../src/sources/transfer.js";

const fixture = (nome: string) => readFileSync(new URL(`./fixtures/${nome}`, import.meta.url), "utf8");

const parceiro = (nome: string, skuid: string): ParceiroTransferencia => ({
  skuid,
  nome,
  url: `https://www.livelo.com.br/livelo-para-parceiros/${skuid}`,
});

describe("parseListaParceiros", () => {
  it("lê os parceiros de transferência ativos", () => {
    const lista = parseListaParceiros(fixture("transfer-lista-parceiros.html"));
    expect(lista.length).toBe(15);
    expect(lista.map((p) => p.nome)).toContain("Smiles");
    expect(lista.every((p) => p.url.startsWith("https://"))).toBe(true);
  });
});

describe("parsePaginaParceiro", () => {
  it("extrai todas as faixas da campanha Azul", () => {
    const oferta = parsePaginaParceiro(
      fixture("transfer-azul-com-campanha.html"),
      parceiro("Azul Fidelidade", "AZLSkuTransfer"),
      new Date("2026-09-09T12:00:00-03:00"),
    );

    expect(oferta).not.toBeNull();
    expect(oferta!.tiers.map((t) => t.pct)).toEqual([50, 80, 90, 95, 100, 110, 120]);
    expect(oferta!.programa).toBe("azul");
  });

  it.each([
    ["só Clube Livelo", new Map([["livelo", undefined]]), 80, /Clube Livelo OU Clube Azul/i],
    ["Clube Livelo + Clube Azul, tempo não informado", new Map([["livelo", undefined], ["azul", undefined]]), 90, /Clube Livelo E Clube Azul/i],
    ["Clube Azul com 9 meses", new Map([["livelo", undefined], ["azul", 9]]), 95, /mais de 6 e menos de 12 meses/i],
    ["Clube Azul com 24 meses", new Map([["livelo", undefined], ["azul", 24]]), 100, /12 a 35 meses/i],
    ["Clube Azul com 72 meses", new Map([["livelo", undefined], ["azul", 72]]), 120, /mais de 60 meses/i],
  ] as [string, PerfilClubes, number, RegExp][])(
    "escolhe a faixa do perfil — %s = %i%%",
    (_nome, clubes, esperado, condicao) => {
      const oferta = parsePaginaParceiro(
        fixture("transfer-azul-com-campanha.html"),
        parceiro("Azul Fidelidade", "AZLSkuTransfer"),
        new Date("2026-09-09T12:00:00-03:00"),
        clubes,
      )!;

      expect(oferta.meuBonusPct).toBe(esperado);
      expect(oferta.incerta).toBe(false);
      expect(oferta.meuTierCondicao).toMatch(condicao);
    },
  );

  it("captura a janela de validade e a exigência de opt-in", () => {
    const oferta = parsePaginaParceiro(
      fixture("transfer-azul-com-campanha.html"),
      parceiro("Azul Fidelidade", "AZLSkuTransfer"),
      new Date("2026-09-09T12:00:00-03:00"),
    )!;

    expect(oferta.janela.fim?.toISOString()).toBe("2026-09-11T02:59:00.000Z"); // 10/09 23h59 BRT
    expect(oferta.exigeOptIn).toBe(true);
    expect(oferta.linkOptIn).toContain("voeazul.com.br");
  });

  it("não inventa campanha quando os campos estão vazios", () => {
    const oferta = parsePaginaParceiro(fixture("transfer-smiles-sem-campanha.html"), parceiro("Smiles", "SMLSkuTransfer"));
    expect(oferta).toBeNull();
  });

  it("trata placeholder {{bonus}} como ausência de campanha", () => {
    const oferta = parsePaginaParceiro(fixture("transfer-iberia-placeholder.html"), parceiro("Iberia Plus", "K04LIVSKU"));
    expect(oferta).toBeNull();
  });
});

describe("tierSeAplica", () => {
  const perfil = (...pares: [string, number | undefined][]): PerfilClubes => new Map(pares);
  const meus = perfil(["livelo", undefined]);
  const comAzul = (meses?: number) => perfil(["livelo", undefined], ["azul", meses]);

  it("descarta a faixa de quem não é assinante", () => {
    expect(tierSeAplica("50% de bônus para não assinantes dos Clubes Livelo ou Azul", meus)).toBe(false);
  });

  it("aceita a faixa com conector OU", () => {
    expect(tierSeAplica("80% de bônus para clientes Clube Livelo OU Clube Azul", meus)).toBe(true);
  });

  it("recusa a faixa com conector E quando falta um clube", () => {
    expect(tierSeAplica("90% de bônus para clientes Clube Livelo E Clube Azul", meus)).toBe(false);
  });

  it("não assume faixa por tempo de casa quando o clube não é seu", () => {
    expect(tierSeAplica("120% de bônus para clientes Clube Azul com mais de 60 meses", meus)).toBe(false);
  });

  it("não assume faixa por tempo de casa sem `mesesAssinatura` no config", () => {
    expect(tierSeAplica("120% de bônus para clientes Clube Azul com mais de 60 meses", comAzul())).toBe(false);
  });

  it("aplica a faixa quando o tempo de assinatura cumpre a regra", () => {
    expect(tierSeAplica("100% de bônus para Clube Azul com 12 a 35 meses de assinatura", comAzul(24))).toBe(true);
    expect(tierSeAplica("110% de bônus para Clube Azul com 36 a 59 meses de assinatura", comAzul(24))).toBe(false);
    expect(tierSeAplica("120% de bônus para Clube Azul com mais de 60 meses", comAzul(72))).toBe(true);
  });

  it("lê a faixa aberta 'mais de 6 e menos de 12 meses'", () => {
    expect(tierSeAplica("95% de bônus para Clube Azul com mais de 6 e menos de 12 meses", comAzul(9))).toBe(true);
    expect(tierSeAplica("95% de bônus para Clube Azul com mais de 6 e menos de 12 meses", comAzul(24))).toBe(false);
  });

  it("converte anos em meses", () => {
    expect(tierSeAplica("120% de bônus para Clube Azul com mais de 5 anos", comAzul(72))).toBe(true);
    expect(tierSeAplica("120% de bônus para Clube Azul com mais de 5 anos", comAzul(48))).toBe(false);
  });

  it("aceita faixa sem condição de clube", () => {
    expect(tierSeAplica("100% de bônus para todos os clientes", meus)).toBe(true);
  });
});

describe("extrairTiers", () => {
  it("ignora percentuais que não são de bônus", () => {
    const tiers = extrairTiers("• 80% de bônus para Clube Livelo\n• Voucher de 15% OFF em voos nacionais");
    expect(tiers).toEqual([{ pct: 80, condicao: "80% de bônus para Clube Livelo" }]);
  });
});
