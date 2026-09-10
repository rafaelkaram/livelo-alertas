/**
 * A Livelo devolve 403 para o User-Agent padrão do Node. Um UA de browser resolve —
 * não há login, captcha nem rate limit agressivo envolvidos.
 */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type OpcoesBusca = {
  tentativas?: number;
  timeoutMs?: number;
};

/** GET com UA de browser, timeout e retry com backoff. Lança em erro definitivo. */
export async function buscarTexto(url: string, { tentativas = 3, timeoutMs = 30_000 }: OpcoesBusca = {}): Promise<string> {
  let ultimoErro: unknown;

  for (let i = 0; i < tentativas; i++) {
    if (i > 0) await dorme(500 * 2 ** (i - 1));

    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": UA,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
      return await res.text();
    } catch (erro) {
      ultimoErro = erro;
    }
  }

  throw ultimoErro instanceof Error ? ultimoErro : new Error(String(ultimoErro));
}

/** Executa em sequência com pausa entre as chamadas — 15 páginas de parceiro por rodada. */
export async function emSerie<T, R>(itens: readonly T[], pausaMs: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = [];
  for (const [i, item] of itens.entries()) {
    if (i > 0) await dorme(pausaMs);
    saida.push(await fn(item));
  }
  return saida;
}
