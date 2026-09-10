import type { Avaliacao } from "../core/types.js";

const API = "https://api.telegram.org";
/** O Telegram corta mensagens acima de 4096 caracteres. */
const LIMITE = 4000;

const escapar = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const link = (texto: string, url: string): string => `<a href="${escapar(url)}">${escapar(texto)}</a>`;

export function credenciais(): { token: string; chatId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  return token && chatId ? { token, chatId } : null;
}

export async function enviar(texto: string): Promise<void> {
  const cred = credenciais();
  if (!cred) throw new Error("TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID não configurados");

  for (const pedaco of fatiar(texto)) {
    const res = await fetch(`${API}/bot${cred.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: cred.chatId,
        text: pedaco,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) throw new Error(`Telegram respondeu ${res.status}: ${await res.text()}`);
  }
}

/** Quebra em blocos respeitando as linhas em branco entre ofertas. */
export function fatiar(texto: string, limite = LIMITE): string[] {
  if (texto.length <= limite) return [texto];

  const pedacos: string[] = [];
  let atual = "";

  for (const bloco of texto.split("\n\n")) {
    if (atual && `${atual}\n\n${bloco}`.length > limite) {
      pedacos.push(atual);
      atual = bloco;
    } else {
      atual = atual ? `${atual}\n\n${bloco}` : bloco;
    }
  }

  if (atual) pedacos.push(atual);
  return pedacos;
}

const ICONE = { transferencia: "✈️", parceiro: "🛒", blog: "📰" } as const;

export function formatarOferta(a: Avaliacao): string {
  const { oferta } = a;

  if (oferta.tipo === "blog") {
    return [
      `${ICONE.blog} <b>${escapar(oferta.titulo)}</b>`,
      `${escapar(oferta.fonte)} · ${link("ler", oferta.url)}`,
    ].join("\n");
  }

  const titulo =
    oferta.tipo === "transferencia"
      ? `${ICONE.transferencia} <b>${escapar(oferta.parceiro)}</b> — transferência bonificada`
      : `${ICONE.parceiro} <b>${escapar(oferta.parceiro)}</b>`;

  const links = [link("ver na Livelo", oferta.url)];
  if (oferta.tipo === "transferencia" && oferta.linkOptIn) links.unshift(link("cadastrar na campanha", oferta.linkOptIn));

  return [titulo, ...a.destaques.map((d) => escapar(d)), `→ ${links.join(" · ")}`].join("\n");
}

export function montarMensagem(avaliacoes: Avaliacao[], cabecalho: string): string {
  return [`<b>${escapar(cabecalho)}</b>`, ...avaliacoes.map(formatarOferta)].join("\n\n");
}

/** Um scraper quebrado em silêncio é pior do que não ter alerta nenhum. */
export async function avisarQuebra(erros: readonly Error[]): Promise<void> {
  if (erros.length === 0 || !credenciais()) return;

  await enviar(
    [`⚠️ <b>Alerta Livelo com problema</b>`, ...erros.map((e) => escapar(`• ${e.message}`))].join("\n"),
  );
}
