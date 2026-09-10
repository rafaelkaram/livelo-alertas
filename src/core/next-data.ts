import { z } from "zod";

/**
 * O site da Livelo é Next.js e serializa o estado da página em
 * `<script id="__NEXT_DATA__">`. Todos os dados de promoção saem daí — sem login e
 * sem browser headless.
 */
const RE_NEXT_DATA = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;

export function extrairNextData(html: string): unknown {
  const m = RE_NEXT_DATA.exec(html);
  if (!m?.[1]) throw new Error("__NEXT_DATA__ não encontrado — a página mudou de estrutura ou veio bloqueada");

  try {
    return JSON.parse(m[1]) as unknown;
  } catch (erro) {
    throw new Error(`__NEXT_DATA__ não é JSON válido: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
}

/**
 * Os dados que interessam ficam fundos numa árvore de componentes de CMS cujo caminho
 * exato muda entre páginas e releases. Em vez de fixar o caminho, varremos a árvore
 * atrás de nós que casem com o schema — resistente a reordenação de componentes.
 */
export function colher<T>(raiz: unknown, schema: z.ZodType<T>): T[] {
  const achados: T[] = [];
  const vistos = new WeakSet<object>();

  const visitar = (no: unknown): void => {
    if (no === null || typeof no !== "object") return;
    if (vistos.has(no)) return;
    vistos.add(no);

    if (!Array.isArray(no)) {
      const r = schema.safeParse(no);
      if (r.success) achados.push(r.data);
    }

    for (const filho of Array.isArray(no) ? no : Object.values(no)) visitar(filho);
  };

  visitar(raiz);
  return achados;
}

/** Remove tags, resolve as entidades que a Livelo usa e normaliza espaços. */
export function semHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|h[1-6]|ul|ol)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&middot;/g, "·")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    // &amp; por último: decodificar antes reintroduziria as entidades já resolvidas.
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
