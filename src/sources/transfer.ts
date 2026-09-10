import { z } from "zod";
import { config } from "../../config.js";
import { buscarTexto, emSerie } from "../core/http.js";
import { colher, extrairNextData, semHtml } from "../core/next-data.js";
import { parseJanelaTexto } from "../core/datas.js";
import { FonteQuebrada, type OfertaTransferencia, type TierBonus } from "../core/types.js";

export const URL_LISTA_TRANSFERENCIA = "https://www.livelo.com.br/livelo-para-parceiros";
const BASE = "https://www.livelo.com.br";

const ParceiroLista = z
  .object({
    skuid: z.string(),
    nomeParceiro: z.string(),
    redirectUrl: z.string(),
    status: z.string().optional(),
  })
  .loose();

const Campanha = z
  .object({
    bonus: z.string().nullish(),
    earnBonus: z.string().nullish(),
    longDescription: z.string().nullish(),
    offerLink: z.object({ title: z.string().nullish(), href: z.string().nullish() }).loose().nullish(),
    bannerUrl: z.object({ url: z.string() }).loose().nullish(),
  })
  .loose();

const ComCampanha = z.object({ campaign: Campanha }).loose();

export type ParceiroTransferencia = { skuid: string; nome: string; url: string };

export function parseListaParceiros(html: string): ParceiroTransferencia[] {
  const encontrados = colher(extrairNextData(html), ParceiroLista);
  if (encontrados.length === 0) throw new Error("lista de parceiros de transferência vazia — payload mudou");

  const porSku = new Map<string, ParceiroTransferencia>();
  for (const p of encontrados) {
    if (p.status && p.status.toLowerCase() !== "ativo") continue;
    porSku.set(p.skuid, {
      skuid: p.skuid,
      nome: p.nomeParceiro.trim(),
      url: p.redirectUrl.startsWith("http") ? p.redirectUrl : `${BASE}${p.redirectUrl}`,
    });
  }
  return [...porSku.values()];
}

/** Placeholder de template que a Livelo deixa na página quando não há campanha ativa. */
const RE_PLACEHOLDER = /\{\{\s*\w+\s*\}\}/;
const RE_TIER = /(\d{1,3})\s*%\s*de\s*b[ôo]nus/i;
const RE_TODOS_PCT = /(\d{1,3})\s*%\s*de\s*b[ôo]nus/gi;
const RE_OPT_IN = /obrigat[óo]ri[ao]\s+o?\s*cadastro|cadastre-se na campanha|necess[áa]rio se cadastrar/i;
const RE_PRAZO = /\b\d+\s*(?:meses|m[êe]s|anos?)\b/i;
// "com mais de 6 e menos de 12 meses", "com 12 a 35 meses", "com mais de 60 meses".
const RE_ENTRE = /mais de\s*(\d+)\s*e\s*menos de\s*(\d+)\s*(meses|m[êe]s|anos?)/i;
const RE_FAIXA = /(?:com|de)\s*(\d+)\s*a\s*(\d+)\s*(meses|m[êe]s|anos?)/i;
const RE_ACIMA = /mais de\s*(\d+)\s*(meses|m[êe]s|anos?)/i;
const RE_NEGATIVA = /n[ãa]o\s+(?:assinantes?|clientes?|clube)|demais\s+clientes|sem\s+clube|n[ãa]o\s+clube/i;

/** Clubes que aparecem nas regras escalonadas. Usados para casar a faixa com o seu perfil. */
const CLUBES = [
  "livelo",
  "azul",
  "smiles",
  "latam",
  "tap",
  "iberia",
  "copa",
  "british",
  "flying blue",
  "etihad",
  "aeroméxico",
  "accor",
  "hilton",
  "ihg",
] as const;

const normalizar = (s: string) => s.toLowerCase().normalize("NFC");

/** Clube → meses de assinatura (`undefined` quando não informado no config). */
export type PerfilClubes = Map<string, number | undefined>;

function clubesDoPerfil(): PerfilClubes {
  const m: PerfilClubes = new Map();
  if (config.perfil.clubeLivelo) m.set("livelo", undefined);
  for (const c of config.perfil.clubesParceiros) {
    m.set(normalizar(c.clube).replace(/^clubes?\s+/, "").trim(), c.mesesAssinatura);
  }
  return m;
}

/** Converte a exigência de tempo da regra em meses e testa contra a assinatura. */
function cumpreTempo(condicao: string, meses: number | undefined): boolean {
  if (meses === undefined) return false;

  const emMeses = (valor: string, unidade: string) =>
    /ano/i.test(unidade) ? Number(valor) * 12 : Number(valor);

  const entre = RE_ENTRE.exec(condicao);
  if (entre) return meses > emMeses(entre[1]!, entre[3]!) && meses < emMeses(entre[2]!, entre[3]!);

  const faixa = RE_FAIXA.exec(condicao);
  if (faixa) return meses >= emMeses(faixa[1]!, faixa[3]!) && meses <= emMeses(faixa[2]!, faixa[3]!);

  const acima = RE_ACIMA.exec(condicao);
  if (acima) return meses > emMeses(acima[1]!, acima[2]!);

  // Menciona tempo em um formato que não sabemos ler: não assume a faixa.
  return false;
}

function clubesCitados(condicao: string): string[] {
  const t = normalizar(condicao);
  return CLUBES.filter((c) => t.includes(c));
}

/**
 * Decide se uma faixa se aplica ao perfil configurado.
 *
 * As regras vêm em português corrido ("80% de bônus para clientes Clube Livelo OU
 * Clube Azul"), então isto é heurística — mas erra para o lado seguro: faixa que
 * depende de tempo de assinatura (`RE_PRAZO`) nunca é assumida como sua.
 */
export function tierSeAplica(condicao: string, meusClubes: PerfilClubes = clubesDoPerfil()): boolean {
  const citados = clubesCitados(condicao);

  if (RE_NEGATIVA.test(condicao)) {
    return citados.every((c) => !meusClubes.has(c));
  }

  if (RE_PRAZO.test(condicao)) {
    // Faixa por tempo de casa: exige ter todos os clubes citados e cumprir o prazo.
    if (citados.length === 0 || !citados.every((c) => meusClubes.has(c))) return false;
    return citados.some((c) => cumpreTempo(condicao, meusClubes.get(c)));
  }

  if (citados.length === 0) return true;

  const exigeTodos = !/\bou\b/i.test(condicao) && /\be\b/i.test(condicao);
  return exigeTodos ? citados.every((c) => meusClubes.has(c)) : citados.some((c) => meusClubes.has(c));
}

export function extrairTiers(regras: string): TierBonus[] {
  const tiers: TierBonus[] = [];

  for (const linha of regras.split("\n")) {
    const m = RE_TIER.exec(linha);
    if (!m) continue;
    tiers.push({ pct: Number(m[1]), condicao: linha.replace(/^[•\s]+/, "").trim() });
  }

  return tiers.sort((a, b) => a.pct - b.pct);
}

export function parsePaginaParceiro(
  html: string,
  parceiro: ParceiroTransferencia,
  agora = new Date(),
  meusClubes: PerfilClubes = clubesDoPerfil(),
): OfertaTransferencia | null {
  const [encontrado] = colher(extrairNextData(html), ComCampanha);
  if (!encontrado) throw new Error(`campanha não encontrada na página de ${parceiro.nome}`);

  const c = encontrado.campaign;
  const descricao = c.longDescription ?? "";
  const chamadas = [c.bonus ?? "", c.earnBonus ?? ""].filter((t) => t && !RE_PLACEHOLDER.test(t));
  const temBanner = Boolean(c.bannerUrl?.url);
  const temDescricao = descricao.trim().length > 0 && !RE_PLACEHOLDER.test(descricao);

  // Sem banner, sem regras e sem chamada preenchida: não há campanha ativa.
  if (!temBanner && !temDescricao && chamadas.length === 0) return null;

  const regras = semHtml(descricao);
  const tiers = extrairTiers(regras);

  const aplicaveis = tiers.filter((t) => tierSeAplica(t.condicao, meusClubes));
  const meu = aplicaveis.at(-1);

  // Sem faixas identificadas, aproveita o "até N% de bônus" da chamada — marcado como incerto.
  const pctChamada = chamadas
    .flatMap((t) => [...t.matchAll(RE_TODOS_PCT)].map((m) => Number(m[1])))
    .sort((a, b) => a - b)
    .at(-1);

  const janela = parseJanelaTexto(regras || chamadas.join(" "), agora);
  const textoCompleto = `${regras}\n${chamadas.join("\n")}`;

  return {
    tipo: "transferencia",
    id: parceiro.skuid,
    parceiro: parceiro.nome,
    programa: programaDe(parceiro.nome),
    url: parceiro.url,
    tiers: tiers.length > 0 ? tiers : pctChamada ? [{ pct: pctChamada, condicao: "conforme a chamada da campanha" }] : [],
    meuBonusPct: meu?.pct ?? (tiers.length > 0 ? tiers[0]!.pct : pctChamada),
    meuTierCondicao: meu?.condicao,
    janela,
    exigeOptIn: RE_OPT_IN.test(textoCompleto) || Boolean(c.offerLink?.href),
    linkOptIn: c.offerLink?.href ?? undefined,
    regras,
    incerta: aplicaveis.length === 0,
  };
}

export function programaDe(nomeParceiro: string): string | undefined {
  const alvo = normalizar(nomeParceiro);
  for (const [chave, p] of Object.entries(config.programas)) {
    if (p.aliases.some((a) => alvo.includes(normalizar(a)))) return chave;
  }
  return undefined;
}

export async function coletarTransferencias(): Promise<OfertaTransferencia[]> {
  try {
    const parceiros = parseListaParceiros(await buscarTexto(URL_LISTA_TRANSFERENCIA));

    // O flag `campanhaAtiva` da listagem já veio `false` com campanha ativa em curso,
    // então cada página precisa ser visitada — 15 requisições por rodada.
    const resultados = await emSerie(parceiros, 400, async (p) =>
      parsePaginaParceiro(await buscarTexto(p.url), p),
    );

    return resultados.filter((o): o is OfertaTransferencia => o !== null);
  } catch (erro) {
    throw new FonteQuebrada("livelo-transferencia", erro);
  }
}
