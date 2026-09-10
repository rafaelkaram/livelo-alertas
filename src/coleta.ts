import { coletarBlogs } from "./sources/blogs.js";
import { coletarParceiros } from "./sources/shopping.js";
import { coletarTransferencias } from "./sources/transfer.js";
import type { Oferta } from "./core/types.js";

export type Coleta = { ofertas: Oferta[]; erros: Error[] };

/**
 * Roda as três fontes em paralelo e devolve o que deu certo junto com o que falhou.
 * Uma fonte fora do ar não pode derrubar as outras — mas também não pode passar batido.
 */
export async function coletarTudo(): Promise<Coleta> {
  const resultados = await Promise.allSettled([coletarTransferencias(), coletarParceiros(), coletarBlogs()]);

  return {
    ofertas: resultados.flatMap((r) => (r.status === "fulfilled" ? (r.value as Oferta[]) : [])),
    erros: resultados.flatMap((r) =>
      r.status === "rejected" ? [r.reason instanceof Error ? r.reason : new Error(String(r.reason))] : [],
    ),
  };
}
