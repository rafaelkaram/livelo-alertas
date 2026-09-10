import { coletarTudo } from "./coleta.js";
import { avaliar, selecionar } from "./core/rules.js";
import { carregarEstado, jaAlertado, registrarHistorico, salvarEstado } from "./core/state.js";
import { despachar } from "./notify/despachar.js";
import { avisarQuebra, formatarOferta } from "./notify/telegram.js";

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

erros.push(...(await despachar(novas, estado, `Livelo — ${novas.length} oportunidade(s)`, agora)));

await salvarEstado(estado);
await registrarHistorico(avaliadas, agora);

// O aviso de quebra usa o mesmo canal que pode ter falhado: não deixar derrubar a rodada.
try {
  await avisarQuebra(erros);
} catch (erro) {
  console.error(`não foi possível avisar sobre a quebra: ${erro instanceof Error ? erro.message : String(erro)}`);
}

process.exit(erros.length > 0 ? 1 : 0);
