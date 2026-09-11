import { describe, expect, it, vi } from "vitest";
import { despachar } from "../src/notify/despachar.js";
import { chaveDe } from "../src/core/state.js";
import { avaliar } from "../src/core/rules.js";
import type { Avaliacao } from "../src/core/types.js";

const AGORA = new Date("2026-09-10T12:00:00-03:00");

const umAlerta = (): Avaliacao =>
  avaliar(
    {
      tipo: "transferencia",
      id: "AZLSkuTransfer",
      parceiro: "Azul Fidelidade",
      programa: "azul",
      url: "https://exemplo",
      tiers: [{ pct: 90, condicao: "Clube Livelo E Clube Azul" }],
      meuBonusPct: 90,
      janela: { fim: new Date("2026-09-10T23:59:00-03:00") },
      exigeOptIn: true,
      regras: "",
      incerta: false,
    },
    AGORA,
  );

describe("despachar", () => {
  it("marca como alertado depois de enviar", async () => {
    const estado: { alertados: Record<string, string> } = { alertados: {} };
    const enviar = vi.fn(async () => {});
    const alerta = umAlerta();

    const erros = await despachar([alerta], estado, "Livelo", AGORA, { credenciais: () => ({}), enviar });

    expect(erros).toEqual([]);
    expect(enviar).toHaveBeenCalledOnce();
    expect(estado.alertados[chaveDe(alerta.oferta)]).toBe(AGORA.toISOString());
  });

  it("não marca nada quando o Telegram não está configurado", async () => {
    // O bug que fez a primeira configuração real perder os alertas do dia: as rodadas
    // agendadas antes dos secrets marcavam tudo como avisado e não enviavam.
    const estado: { alertados: Record<string, string> } = { alertados: {} };
    const enviar = vi.fn(async () => {});

    const erros = await despachar([umAlerta()], estado, "Livelo", AGORA, { credenciais: () => null, enviar });

    expect(erros).toEqual([]);
    expect(enviar).not.toHaveBeenCalled();
    expect(estado.alertados).toEqual({});
  });

  it("não marca nada quando o envio falha", async () => {
    const estado: { alertados: Record<string, string> } = { alertados: {} };
    const enviar = vi.fn(async () => {
      throw new Error("Telegram respondeu 401");
    });

    const erros = await despachar([umAlerta()], estado, "Livelo", AGORA, { credenciais: () => ({}), enviar });

    expect(erros.map((e) => e.message)).toEqual(["Telegram respondeu 401"]);
    expect(estado.alertados).toEqual({});
  });

  it("não envia mensagem vazia quando não há nada novo", async () => {
    const enviar = vi.fn(async () => {});
    await despachar([], { alertados: {} }, "Livelo", AGORA, { credenciais: () => ({}), enviar });
    expect(enviar).not.toHaveBeenCalled();
  });
});
