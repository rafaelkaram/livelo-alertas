import { coletarTudo } from "./coleta.js";
import { avaliar, selecionar } from "./core/rules.js";
import { carregarEstado, jaAlertado, marcarAlertado, registrarHistorico, salvarEstado } from "./core/state.js";
import { avisarQuebra, credenciais, enviar, formatarOferta, montarMensagem } from "./notify/telegram.js";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const forcar = args.has("--force");

const agora = new Date();

const { ofertas, erros } = await coletarTudo();
const avaliadas = ofertas.map((o) => avaliar(o, agora));
const selecionadas = selecionar(avaliadas);

const estado = await carregarEstado();
const novas = forcar ? selecionadas : selecionadas.filter((a) => !jaAlertado(estado, a.oferta));

console.log(
  `${agora.toISOString()} · ${ofertas.length} ofertas coletadas · ${avaliadas.filter((a) => a.vale).length} passam no critério · ${novas.length} inéditas${erros.length ? ` · ${erros.length} fonte(s) com erro` : ""}`,
);

for (const a of novas) console.log(`\n${formatarOferta(a).replace(/<[^>]+>/g, "")}`);
for (const e of erros) console.error(`\n⚠️  ${e.message}`);

if (dryRun) {
  console.log("\n(--dry-run: nada enviado, nada gravado)");
  process.exit(erros.length > 0 ? 1 : 0);
}

if (novas.length > 0) {
  if (credenciais()) {
    await enviar(montarMensagem(novas, `Livelo — ${novas.length} oportunidade(s)`));
  } else {
    console.warn("\nTelegram não configurado: nada enviado.");
  }

  for (const a of novas) marcarAlertado(estado, a.oferta, agora);
}

await salvarEstado(estado);
await registrarHistorico(avaliadas, agora);
await avisarQuebra(erros);

process.exit(erros.length > 0 ? 1 : 0);
