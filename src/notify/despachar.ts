import { marcarAlertado } from "../core/state.js";
import { credenciais as credenciaisPadrao, enviar as enviarPadrao, montarMensagem } from "./telegram.js";
import type { Avaliacao } from "../core/types.js";

type Estado = { alertados: Record<string, string> };

export type Dependencias = {
  credenciais: () => unknown;
  enviar: (texto: string) => Promise<void>;
};

/**
 * Envia e só então marca como alertado.
 *
 * A ordem importa: marcar antes de enviar (ou marcar sem ter enviado, quando o
 * Telegram não está configurado) queima o alerta em silêncio — a promoção fica no
 * estado como "já avisada" e nunca chega em ninguém. É melhor repetir um alerta do
 * que perder um.
 */
export async function despachar(
  novas: Avaliacao[],
  estado: Estado,
  cabecalho: string,
  agora = new Date(),
  deps: Dependencias = { credenciais: credenciaisPadrao, enviar: enviarPadrao },
): Promise<Error[]> {
  if (novas.length === 0) return [];

  if (!deps.credenciais()) {
    console.warn(
      `Telegram não configurado: ${novas.length} alerta(s) seguem pendentes para a próxima rodada.`,
    );
    return [];
  }

  try {
    await deps.enviar(montarMensagem(novas, cabecalho));
  } catch (erro) {
    return [erro instanceof Error ? erro : new Error(String(erro))];
  }

  for (const a of novas) marcarAlertado(estado, a.oferta, agora);
  return [];
}
