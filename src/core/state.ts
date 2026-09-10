import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Avaliacao, Oferta } from "./types.js";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const ARQUIVO_ESTADO = join(RAIZ, "state/seen.json");
const DIR_HISTORICO = join(RAIZ, "history");

/** Guarda a última vez que cada oferta foi alertada, por chave. */
type Estado = { alertados: Record<string, string> };

/** Nada de novo depois deste prazo é considerado "o mesmo alerta". */
const VALIDADE_DIAS = 45;

/**
 * A chave carrega os números da oferta, não só a identidade: se o bônus sobe ou a
 * promoção é prorrogada, a chave muda e o alerta é reenviado — que é o comportamento
 * desejado. Repetição do mesmo número não alerta duas vezes.
 */
export function chaveDe(oferta: Oferta): string {
  switch (oferta.tipo) {
    case "transferencia":
      return `xfer:${oferta.id}:${oferta.tiers.map((t) => t.pct).join("-")}:${oferta.janela.fim?.toISOString() ?? "sem-fim"}`;
    case "parceiro":
      return `shop:${oferta.id}:${oferta.atual}:${oferta.atualClube}:${oferta.janela.fim?.toISOString() ?? "sem-fim"}`;
    case "blog":
      return `blog:${oferta.id}`;
  }
}

export async function carregarEstado(): Promise<Estado> {
  try {
    return JSON.parse(await readFile(ARQUIVO_ESTADO, "utf8")) as Estado;
  } catch {
    return { alertados: {} };
  }
}

export async function salvarEstado(estado: Estado): Promise<void> {
  const corte = Date.now() - VALIDADE_DIAS * 86_400_000;
  const alertados = Object.fromEntries(
    Object.entries(estado.alertados).filter(([, quando]) => new Date(quando).getTime() >= corte),
  );

  await mkdir(dirname(ARQUIVO_ESTADO), { recursive: true });
  await writeFile(ARQUIVO_ESTADO, `${JSON.stringify({ alertados }, null, 2)}\n`);
}

export function jaAlertado(estado: Estado, oferta: Oferta): boolean {
  return chaveDe(oferta) in estado.alertados;
}

export function marcarAlertado(estado: Estado, oferta: Oferta, agora = new Date()): void {
  estado.alertados[chaveDe(oferta)] = agora.toISOString();
}

/**
 * Registra tudo que foi visto, tenha virado alerta ou não. É a base para calibrar
 * os valores de milheiro do config depois de alguns meses de coleta.
 */
export async function registrarHistorico(avaliacoes: Avaliacao[], agora = new Date()): Promise<void> {
  if (avaliacoes.length === 0) return;

  const arquivo = join(DIR_HISTORICO, `${agora.toISOString().slice(0, 7)}.jsonl`);
  const linhas = avaliacoes
    .map((a) => JSON.stringify({ visto_em: agora.toISOString(), score: Number(a.score.toFixed(2)), vale: a.vale, ...a.oferta }))
    .join("\n");

  await mkdir(DIR_HISTORICO, { recursive: true });
  await appendFile(arquivo, `${linhas}\n`);
}
