import { coletarTudo } from "./coleta.js";
import { diasRestantes } from "./core/datas.js";
import { avaliar } from "./core/rules.js";
import { registrarHistorico } from "./core/state.js";
import { avisarQuebra, credenciais, enviar, montarMensagem } from "./notify/telegram.js";

/**
 * Resumo da manhã: o alerta de rodada só dispara no que é novo, então sem isto uma
 * promoção que apareceu de madrugada some do radar antes de ser vista.
 */
const TOPO = 6;
const dryRun = process.argv.includes("--dry-run");
const agora = new Date();

const { ofertas, erros } = await coletarTudo();
const avaliadas = ofertas.map((o) => avaliar(o, agora));

const valem = avaliadas.filter((a) => a.vale && a.oferta.tipo !== "blog").sort((a, b) => b.score - a.score);
const transferencias = valem.filter((a) => a.oferta.tipo === "transferencia");
const parceiros = valem.filter((a) => a.oferta.tipo === "parceiro");

const acabamHoje = valem.filter(
  (a) => a.oferta.tipo !== "blog" && diasRestantes(a.oferta.janela.fim, agora) === 0,
);

const destaque = [...transferencias, ...parceiros.slice(0, TOPO)];
const cabecalho = `Livelo hoje — ${transferencias.length} transferência(s) e ${parceiros.length} parceiro(s) valendo${acabamHoje.length ? ` · ${acabamHoje.length} acaba(m) hoje` : ""}`;

const mensagem =
  destaque.length > 0
    ? montarMensagem(destaque, cabecalho)
    : `<b>Livelo hoje</b>\nNada acima dos seus limites nas ${ofertas.length} ofertas ativas.`;

console.log(mensagem.replace(/<[^>]+>/g, ""));

if (!dryRun) {
  if (credenciais()) await enviar(mensagem);
  else console.warn("Telegram não configurado: nada enviado.");

  await registrarHistorico(avaliadas, agora);
  await avisarQuebra(erros);
}

for (const e of erros) console.error(`⚠️  ${e.message}`);
process.exit(erros.length > 0 ? 1 : 0);
