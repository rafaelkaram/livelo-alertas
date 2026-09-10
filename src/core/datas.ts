import type { Janela } from "./types.js";

/** Formato da Livelo no payload de parceiros: "2026-09-09-23:59:00 GMT-03:00". */
const RE_DATA_LIVELO = /^(\d{4})-(\d{2})-(\d{2})-(\d{2}):(\d{2}):(\d{2})\s*GMT([+-]\d{2}:\d{2})$/;

export function parseDataLivelo(valor: string | null | undefined): Date | undefined {
  if (!valor) return undefined;

  const m = RE_DATA_LIVELO.exec(valor.trim());
  if (!m) {
    const solta = new Date(valor);
    return Number.isNaN(solta.getTime()) ? undefined : solta;
  }

  const [, ano, mes, dia, hora, min, seg, fuso] = m;
  const d = new Date(`${ano}-${mes}-${dia}T${hora}:${min}:${seg}${fuso}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * As campanhas de transferência descrevem a validade em texto corrido, tipicamente
 * "Válida das 09h do dia 08/09 às 23h59 de 10/09/26". O ano costuma vir só na data
 * final (e às vezes em nenhuma das duas).
 */
const RE_PERIODO_TEXTO =
  /v[áa]lid[ao].{0,40}?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?.{0,40}?(?:at[ée]|a)\s.{0,20}?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/is;
const RE_ATE_TEXTO = /(?:at[ée]|v[áa]lid[ao] at[ée])\s(?:o dia\s)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i;

function montar(dia: string, mes: string, ano: string | undefined, fimDoDia: boolean, referencia: Date): Date | undefined {
  const anoNum = ano ? (ano.length === 2 ? 2000 + Number(ano) : Number(ano)) : referencia.getFullYear();
  const hora = fimDoDia ? "23:59:00" : "00:00:00";
  const d = new Date(`${anoNum}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}T${hora}-03:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Extrai a janela de validade de um texto livre de campanha. */
export function parseJanelaTexto(texto: string, agora = new Date()): Janela {
  const periodo = RE_PERIODO_TEXTO.exec(texto);
  if (periodo) {
    const [, d1, m1, a1, d2, m2, a2] = periodo;
    const fim = montar(d2!, m2!, a2, true, agora);
    return {
      inicio: montar(d1!, m1!, a1 ?? a2, false, agora),
      fim,
      bruto: periodo[0].trim(),
    };
  }

  const ate = RE_ATE_TEXTO.exec(texto);
  if (ate) {
    const [, d, m, a] = ate;
    return { fim: montar(d!, m!, a, true, agora), bruto: ate[0].trim() };
  }

  return {};
}

export function estaVigente(janela: Janela, agora = new Date()): boolean {
  if (janela.fim && janela.fim.getTime() < agora.getTime()) return false;
  if (janela.inicio && janela.inicio.getTime() > agora.getTime()) return false;
  return true;
}

const FUSO_BR = "America/Sao_Paulo";

export function formatarData(d: Date | undefined): string {
  if (!d) return "sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO_BR,
  }).format(d);
}

/** Dias inteiros até o fim da promoção. 0 = acaba hoje. */
export function diasRestantes(fim: Date | undefined, agora = new Date()): number | undefined {
  if (!fim) return undefined;
  return Math.floor((fim.getTime() - agora.getTime()) / 86_400_000);
}
