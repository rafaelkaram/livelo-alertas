/**
 * Regrava as fixtures a partir das páginas ao vivo. Rodar quando um parser quebrar,
 * para ver o que a Livelo mudou.
 *
 * `transfer-azul-com-campanha.html` é um retrato de uma campanha real (set/2026) e
 * fica de fora por padrão — sem ele não há como testar a extração das faixas de
 * bônus, e campanhas de transferência são raras.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buscarTexto } from "../src/core/http.js";

const DIR = fileURLToPath(new URL("../test/fixtures/", import.meta.url));

const ALVOS = [
  { arquivo: "shopping-todos-os-parceiros.html", url: "https://www.livelo.com.br/juntar-pontos/todos-os-parceiros" },
  { arquivo: "transfer-lista-parceiros.html", url: "https://www.livelo.com.br/livelo-para-parceiros" },
  { arquivo: "transfer-smiles-sem-campanha.html", url: "https://www.livelo.com.br/livelo-para-parceiros/smiles/SMLTransfer" },
  { arquivo: "transfer-iberia-placeholder.html", url: "https://www.livelo.com.br/livelo-para-parceiros/iberia/LIVK0004" },
];

await mkdir(DIR, { recursive: true });

for (const alvo of ALVOS) {
  const html = await buscarTexto(alvo.url);
  await writeFile(new URL(alvo.arquivo, `file://${DIR}`), html);
  console.log(`${alvo.arquivo}: ${(html.length / 1024).toFixed(0)} KB`);
}
