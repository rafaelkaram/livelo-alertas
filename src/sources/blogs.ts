import { config } from "../../config.js";
import { buscarTexto } from "../core/http.js";
import { semHtml } from "../core/next-data.js";
import { FonteQuebrada, type OfertaBlog } from "../core/types.js";

const RE_ITEM = /<item\b[\s\S]*?<\/item>/gi;
const campo = (xml: string, tag: string): string | undefined => {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, "i").exec(xml);
  return m?.[1]?.trim();
};

const normalizar = (s: string) => s.toLowerCase().normalize("NFC");

/**
 * Os feeds de milhas publicam dezenas de posts por dia. O termo obrigatório tem que
 * estar no **título** — exigi-lo só no corpo deixava passar qualquer promoção de
 * passagem que citasse a Livelo de passagem no rodapé.
 */
export function filtrar(titulo: string, descricao: string): string[] | null {
  const tituloNorm = normalizar(titulo);
  if (!config.filtroBlogs.obrigatorias.some((t) => tituloNorm.includes(normalizar(t)))) return null;

  const texto = normalizar(`${titulo} ${descricao}`);
  const assuntos = config.filtroBlogs.assuntos.filter((t) => texto.includes(normalizar(t)));
  return assuntos.length > 0 ? [...new Set(assuntos)] : null;
}

export function parseFeed(xml: string, fonte: string, agora = new Date()): OfertaBlog[] {
  const itens = xml.match(RE_ITEM) ?? [];
  if (itens.length === 0) throw new Error(`feed de ${fonte} sem itens`);

  const ofertas: OfertaBlog[] = [];

  for (const item of itens) {
    const titulo = campo(item, "title");
    const link = campo(item, "link");
    if (!titulo || !link) continue;

    const descricao = semHtml(campo(item, "description"));
    const motivos = filtrar(titulo, descricao);
    if (!motivos) continue;

    const pub = campo(item, "pubDate");
    const publicadoEm = pub ? new Date(pub) : undefined;

    // Post velho não é alerta: o feed traz semanas de histórico na primeira execução.
    if (publicadoEm && agora.getTime() - publicadoEm.getTime() > 3 * 86_400_000) continue;

    ofertas.push({
      tipo: "blog",
      id: campo(item, "guid") ?? link,
      titulo: semHtml(titulo),
      url: link,
      fonte,
      publicadoEm: publicadoEm && !Number.isNaN(publicadoEm.getTime()) ? publicadoEm : undefined,
      motivos,
    });
  }

  return ofertas;
}

export async function coletarBlogs(): Promise<OfertaBlog[]> {
  const resultados = await Promise.allSettled(
    config.blogs.map(async (b) => parseFeed(await buscarTexto(b.url), b.nome)),
  );

  const ofertas = resultados.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const falharam = resultados.filter((r) => r.status === "rejected");

  // Blog é sinal secundário: uma falha isolada não derruba a rodada, mas se todos
  // caírem é sinal de que algo mudou de verdade.
  if (falharam.length === config.blogs.length) {
    throw new FonteQuebrada("blogs", (falharam[0] as PromiseRejectedResult).reason);
  }

  return ofertas;
}
