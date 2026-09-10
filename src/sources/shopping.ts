import { z } from "zod";
import { buscarTexto } from "../core/http.js";
import { colher, extrairNextData, semHtml } from "../core/next-data.js";
import { parseDataLivelo } from "../core/datas.js";
import { FonteQuebrada, type OfertaParceiro } from "../core/types.js";

export const URL_TODOS_PARCEIROS = "https://www.livelo.com.br/juntar-pontos/todos-os-parceiros";

/**
 * Cada parceiro do Livelo Shopping traz a paridade atual (`parity`/`parityClub`) ao
 * lado da paridade base (`parityBau`) — dá para medir o tamanho da promoção sem
 * manter histórico próprio.
 */
const Paridade = z.object({
  currency: z.string().default("R$"),
  currencyValue: z.number().default(1),
  parity: z.number(),
  parityClub: z.number().optional(),
  parityBau: z.number().optional(),
  promotion: z.boolean().optional(),
  activeCampaign: z.string().optional(),
  dateStart: z.string().nullish(),
  dateEnd: z.string().nullish(),
  legalTerms: z.string().nullish(),
});

const Parceiro = z
  .object({
    id: z.string(),
    name: z.string(),
    partnerDetailsPage: z.string().optional(),
    parity: Paridade,
  })
  .loose();

export function parseParceiros(html: string, agora = new Date()): OfertaParceiro[] {
  const parceiros = colher(extrairNextData(html), Parceiro);
  if (parceiros.length === 0) {
    throw new Error("nenhum parceiro com paridade encontrado — o payload da Livelo mudou");
  }

  const porId = new Map<string, OfertaParceiro>();

  for (const p of parceiros) {
    const { parity: q } = p;
    const base = q.parityBau ?? q.parity;

    porId.set(p.id, {
      tipo: "parceiro",
      id: p.id,
      parceiro: p.name.trim(),
      url: p.partnerDetailsPage ?? URL_TODOS_PARCEIROS,
      moeda: q.currency,
      base,
      atual: q.parity,
      atualClube: q.parityClub ?? q.parity,
      campanha: q.activeCampaign ?? (q.promotion ? "PROMOTION" : "BAU"),
      janela: { inicio: parseDataLivelo(q.dateStart), fim: parseDataLivelo(q.dateEnd) },
      regras: semHtml(q.legalTerms),
    });
  }

  void agora;
  return [...porId.values()];
}

export async function coletarParceiros(): Promise<OfertaParceiro[]> {
  try {
    return parseParceiros(await buscarTexto(URL_TODOS_PARCEIROS));
  } catch (erro) {
    throw new FonteQuebrada("livelo-shopping", erro);
  }
}
