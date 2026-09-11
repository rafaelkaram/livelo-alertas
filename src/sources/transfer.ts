import { z } from "zod";
import { config } from "../../config.js";
import { buscarTexto, emSerie } from "../core/http.js";
import { colher, extrairNextData, semHtml } from "../core/next-data.js";
import { parseJanelaTexto } from "../core/datas.js";
import { FonteQuebrada, type OfertaTransferencia, type TierBonus } from "../core/types.js";

const BASE = "https://www.livelo.com.br";

/**
 * A descoberta dos parceiros vem do sitemap, não de um componente de CMS.
 *
 * A primeira versão lia `listPartners` da página `/livelo-para-parceiros`; em set/2026
 * a Livelo refez essa página como artigo/FAQ e o componente sumiu, derrubando o
 * monitoramento de transferência inteiro. Sitemap é contrato de SEO — sobrevive a
 * redesenho de página.
 */
export const URL_SITEMAP = "https://www.livelo.com.br/sitemap/static-sitemap-0.xml";

/** `/livelo-para-parceiros/<slug>/<sku>` — a página índice, sem sku, não entra. */
const RE_URL_PARCEIRO = /<loc>\s*(https?:\/\/[^<\s]*\/livelo-para-parceiros\/([^/<\s]+)\/([^/<\s]+))\s*<\/loc>/gi;

/**
 * Rede de segurança para quando a descoberta falhar: sem isto, uma mudança no sitemap
 * zera os alertas de transferência em silêncio. Com isto, o pior caso é não enxergar
 * um parceiro recém-criado.
 */
const PARCEIROS_FALLBACK: readonly ParceiroTransferencia[] = [
  ["azul", "AZLTransfer"],
  ["smiles", "SMLTransfer"],
  ["latam", "MTPTransfer"],
  ["iberia", "LIVK0004"],
  ["flying-blue", "LIVK0007"],
  ["british-airways", "LIVK0003"],
  ["milageplus", "LIVK0001"],
  ["etihad", "LIVK0005"],
  ["aeromexico", "LIVK0002"],
  ["copa", "CPATransfer"],
  ["accor", "ACRTransfer"],
  ["hilton-honors", "HILTransfer"],
  ["ihg", "LIVK0008"],
  ["dotz", "DTZTransfer"],
  ["seedz", "SEDTransfer"],
].map(([slug, skuid]) => ({
  slug: slug!,
  skuid: skuid!,
  url: `${BASE}/livelo-para-parceiros/${slug}/${skuid}`,
}));

/** Resposta de API embutida na página — mais estável que o conteúdo de CMS ao lado. */
const PartnerApi = z
  .object({
    productId: z.string(),
    displayName: z.string(),
    enable: z.boolean().optional(),
    maintenanceEnable: z.boolean().optional(),
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

export type ParceiroTransferencia = { skuid: string; slug: string; url: string; nome?: string };

export function parseSitemapParceiros(xml: string): ParceiroTransferencia[] {
  const porSku = new Map<string, ParceiroTransferencia>();

  for (const [, url, slug, skuid] of xml.matchAll(RE_URL_PARCEIRO)) {
    porSku.set(skuid!, { skuid: skuid!, slug: slug!, url: url! });
  }

  return [...porSku.values()];
}

/** Usa o sitemap; se ele falhar ou vier raso demais, cai na lista conhecida. */
export async function descobrirParceiros(): Promise<ParceiroTransferencia[]> {
  try {
    const doSitemap = parseSitemapParceiros(await buscarTexto(URL_SITEMAP));
    if (doSitemap.length >= 5) return doSitemap;
    console.warn(`sitemap devolveu só ${doSitemap.length} parceiro(s); usando a lista conhecida`);
  } catch (erro) {
    console.warn(`descoberta pelo sitemap falhou (${erro instanceof Error ? erro.message : String(erro)}); usando a lista conhecida`);
  }

  return [...PARCEIROS_FALLBACK];
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
  const raiz = extrairNextData(html);
  const [api] = colher(raiz, PartnerApi);
  const [encontrado] = colher(raiz, ComCampanha);
  const rotulo = api?.displayName ?? parceiro.nome ?? parceiro.slug;

  // URL órfã no sitemap: responde 200 mas não é página de parceiro. Não é quebra.
  if (!api && !encontrado) return null;

  // Com a API presente e a campanha ausente, aí sim o payload mudou de forma.
  if (!encontrado) throw new Error(`objeto campaign não encontrado na página de ${rotulo}`);

  // Parceiro desativado ou em manutenção não deve virar alerta.
  if (api?.enable === false || api?.maintenanceEnable === true) return null;

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
    parceiro: rotulo,
    programa: programaDe(rotulo, parceiro.slug),
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

/** Casa contra o nome exibido e contra o slug da URL, que muda menos. */
export function programaDe(nomeParceiro: string, slug = ""): string | undefined {
  const alvo = `${normalizar(nomeParceiro)} ${normalizar(slug).replace(/-/g, " ")}`;
  for (const [chave, p] of Object.entries(config.programas)) {
    if (p.aliases.some((a) => alvo.includes(normalizar(a)))) return chave;
  }
  return undefined;
}

export async function coletarTransferencias(): Promise<OfertaTransferencia[]> {
  const parceiros = await descobrirParceiros();

  // Não há atalho: o flag `campanhaAtiva` da listagem já veio `false` com campanha
  // ativa em curso, então cada página é visitada a cada rodada.
  const resultados = await emSerie(parceiros, 400, async (p) => {
    try {
      return { oferta: parsePaginaParceiro(await buscarTexto(p.url), p) };
    } catch (erro) {
      return { erro: erro instanceof Error ? erro : new Error(String(erro)) };
    }
  });

  const falhas = resultados.flatMap((r) => ("erro" in r && r.erro ? [r.erro] : []));

  // Uma página fora do ar é rotina; um terço delas falhando é mudança estrutural.
  const tolerancia = Math.max(1, Math.floor(parceiros.length / 3));
  if (falhas.length > tolerancia) {
    throw new FonteQuebrada(
      "livelo-transferencia",
      new Error(`${falhas.length}/${parceiros.length} páginas falharam: ${falhas[0]!.message}`),
    );
  }

  for (const erro of falhas) console.warn(`parceiro ignorado nesta rodada: ${erro.message}`);

  return resultados.flatMap((r) => ("oferta" in r && r.oferta ? [r.oferta] : []));
}
