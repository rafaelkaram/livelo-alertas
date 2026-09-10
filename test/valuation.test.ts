import { describe, expect, it } from "vitest";
import { config } from "../config.js";
import { avaliarParceiro, avaliarTransferencia, valorPontoLivelo } from "../src/core/valuation.js";
import { avaliar, selecionar } from "../src/core/rules.js";
import type { OfertaParceiro, OfertaTransferencia } from "../src/core/types.js";

const AGORA = new Date("2026-09-09T12:00:00-03:00");
const AMANHA = new Date("2026-09-10T23:59:00-03:00");

const parceiro = (over: Partial<OfertaParceiro>): OfertaParceiro => ({
  tipo: "parceiro",
  id: "XXX",
  parceiro: "Loja Teste",
  url: "https://exemplo",
  moeda: "R$",
  base: 1,
  atual: 1,
  atualClube: 1,
  campanha: "BAU",
  janela: { fim: AMANHA },
  regras: "",
  ...over,
});

const transferencia = (over: Partial<OfertaTransferencia>): OfertaTransferencia => ({
  tipo: "transferencia",
  id: "AZLSkuTransfer",
  parceiro: "Azul Fidelidade",
  programa: "azul",
  url: "https://exemplo",
  tiers: [{ pct: 80, condicao: "Clube Livelo" }],
  meuBonusPct: 80,
  janela: { fim: AMANHA },
  exigeOptIn: false,
  regras: "",
  incerta: false,
  ...over,
});

describe("valorPontoLivelo", () => {
  it("usa o melhor programa somado ao bônus que se consegue esperando", () => {
    // Iberia a R$ 30/milheiro é o melhor do config; 0,030 × 1,8 = 0,054.
    expect(valorPontoLivelo()).toBeCloseTo(0.054, 6);
  });
});

describe("avaliarTransferencia", () => {
  it("calcula o milheiro final e o desconto contra a referência", () => {
    const conta = avaliarTransferencia(transferencia({}))!;
    // R$ 0,028 × 1.000 ÷ 1,8 = R$ 15,56 contra os R$ 18 de referência da Azul.
    expect(conta.custoMilheiro).toBeCloseTo(15.56, 2);
    expect(conta.desconto).toBeCloseTo(0.1358, 3);
    expect(conta.pontosParaMinimo).toBe(556);
  });

  it("respeita o mínimo alto do LATAM Pass", () => {
    const conta = avaliarTransferencia(transferencia({ programa: "latamPass", meuBonusPct: 100 }))!;
    expect(conta.pontosParaMinimo).toBe(6000); // 12.000 milhas com 100% de bônus
  });
});

describe("avaliar transferência", () => {
  it("alerta quando o bônus passa do limite", () => {
    expect(avaliar(transferencia({}), AGORA).vale).toBe(true);
  });

  it("não alerta bônus baixo que também não deixa o milheiro barato", () => {
    const a = avaliar(transferencia({ meuBonusPct: 30, tiers: [{ pct: 30, condicao: "" }] }), AGORA);
    expect(a.vale).toBe(false);
  });

  it("alerta bônus abaixo do limite quando o milheiro fica abaixo da referência", () => {
    // 60% de bônus → milheiro a R$ 17,50, ainda abaixo dos R$ 18 da Azul.
    const a = avaliar(transferencia({ meuBonusPct: 60, tiers: [{ pct: 60, condicao: "" }] }), AGORA);
    expect(a.vale).toBe(true);
  });

  it("alerta mesmo sem conseguir identificar o percentual", () => {
    const a = avaliar(transferencia({ meuBonusPct: undefined, tiers: [] }), AGORA);
    expect(a.vale).toBe(true);
    expect(a.destaques[0]).toMatch(/não identificado/);
  });

  it("descarta campanha vencida", () => {
    const a = avaliar(transferencia({ janela: { fim: new Date("2026-09-01T00:00:00-03:00") } }), AGORA);
    expect(a.vale).toBe(false);
  });

  it("avisa sobre opt-in obrigatório", () => {
    const a = avaliar(transferencia({ exigeOptIn: true }), AGORA);
    expect(a.destaques.join(" ")).toMatch(/cadastro na campanha/);
  });
});

describe("avaliar parceiro", () => {
  it("mede o multiplicador contra a paridade base", () => {
    const conta = avaliarParceiro(parceiro({ base: 14, atual: 84, atualClube: 84 }));
    expect(conta.multiplicador).toBe(6);
    expect(conta.cashbackEfetivo).toBeCloseTo(4.536, 3); // 84 × 0,054
  });

  it("usa a paridade de Clube quando o perfil é assinante", () => {
    expect(config.perfil.clubeLivelo).toBe(true);
    expect(avaliarParceiro(parceiro({ base: 6, atual: 40, atualClube: 50 })).pontos).toBe(50);
  });

  it("alerta promoção muito acima da base", () => {
    expect(avaliar(parceiro({ parceiro: "Sam's Club", base: 14, atual: 84, atualClube: 84 }), AGORA).vale).toBe(true);
  });

  it("não alerta parceiro sem promoção", () => {
    expect(avaliar(parceiro({ base: 2, atual: 2, atualClube: 2 }), AGORA).vale).toBe(false);
  });

  it("não alerta alta pequena sobre a base", () => {
    // 4 → 6 pts: só 1,5x e retorno de 32%, abaixo dos dois gatilhos.
    expect(avaliar(parceiro({ base: 4, atual: 6, atualClube: 6 }), AGORA).vale).toBe(false);
  });

  it("alerta retorno absoluto alto mesmo com multiplicador modesto", () => {
    // 12 → 14 pts é só 1,17x, mas 14 × 0,054 = 76% do valor gasto de volta.
    expect(avaliar(parceiro({ base: 12, atual: 14, atualClube: 14 }), AGORA).vale).toBe(true);
  });

  it("respeita a lista de ignorados", () => {
    const a = avaliar(parceiro({ parceiro: "Bradesco Consórcios", base: 1, atual: 30, atualClube: 30 }), AGORA);
    expect(a.vale).toBe(false);
    expect(a.destaques[0]).toMatch(/ignorados/);
  });

  it("sinaliza cupom obrigatório e teto de pontos", () => {
    const a = avaliar(
      parceiro({ base: 4, atual: 20, atualClube: 20, regras: "mediante uso do cupom LIVELO45X, limitado a 30.000 pontos" }),
      AGORA,
    );
    expect(a.destaques.join(" ")).toMatch(/cupom/);
    expect(a.destaques.join(" ")).toMatch(/teto/);
  });
});

describe("selecionar", () => {
  it("põe transferência no topo e limita o número de parceiros", () => {
    const muitos = Array.from({ length: 20 }, (_, i) =>
      avaliar(parceiro({ id: `P${i}`, base: 1, atual: 10 + i, atualClube: 10 + i }), AGORA),
    );
    const escolhidas = selecionar([...muitos, avaliar(transferencia({}), AGORA)]);

    expect(escolhidas[0]!.oferta.tipo).toBe("transferencia");
    expect(escolhidas.filter((a) => a.oferta.tipo === "parceiro")).toHaveLength(
      config.limites.maxParceirosPorRodada,
    );
  });
});
