import { config } from "../../config.js";
import { diasRestantes, estaVigente, formatarData } from "./datas.js";
import { avaliarParceiro, avaliarTransferencia, emPct, emReais } from "./valuation.js";
import type { Avaliacao, Oferta } from "./types.js";

/** Parceiros da lista de favoritos entram com limites 40% menores. */
const FATOR_FAVORITO = 0.6;

const ehFavorito = (nome: string): boolean =>
  config.parceirosFavoritos.some((f) => nome.toLowerCase().includes(f.toLowerCase()));

const ehIgnorado = (nome: string): boolean =>
  config.ignorados.some((t) => nome.toLowerCase().includes(t.toLowerCase()));

export function avaliar(oferta: Oferta, agora = new Date()): Avaliacao {
  switch (oferta.tipo) {
    case "transferencia":
      return avaliarOfertaTransferencia(oferta, agora);
    case "parceiro":
      return avaliarOfertaParceiro(oferta, agora);
    case "blog":
      return {
        oferta,
        // Sinal de terceiro, sem número confiável: fica no rodapé do alerta.
        score: 10,
        vale: true,
        destaques: [`Sinal de blog (${oferta.fonte}) — confira na Livelo antes de agir`],
      };
  }
}

function avaliarOfertaTransferencia(oferta: Extract<Oferta, { tipo: "transferencia" }>, agora: Date): Avaliacao {
  const conta = avaliarTransferencia(oferta);
  const destaques: string[] = [];

  if (!estaVigente(oferta.janela, agora)) {
    return { oferta, score: 0, vale: false, destaques: ["campanha fora da janela de validade"] };
  }

  if (!conta) {
    // Há campanha no ar mas o percentual não saiu do texto: melhor um alerta impreciso
    // do que perder a janela.
    return {
      oferta,
      score: 500,
      vale: true,
      destaques: ["campanha ativa com percentual não identificado — abra a página da Livelo"],
    };
  }

  const faixa = oferta.tiers.map((t) => t.pct);
  const limite = config.limites.bonusTransferenciaMin;
  const baratoOSuficiente = conta.referencia !== undefined && conta.custoMilheiro <= conta.referencia;
  const vale = conta.bonusPct >= limite || baratoOSuficiente;

  destaques.push(
    oferta.incerta
      ? `Faixa provável: ${conta.bonusPct}%${faixa.length > 1 ? ` (anunciado ${Math.min(...faixa)}%–${Math.max(...faixa)}%)` : ""} — perfil não identificado nas regras`
      : `Seu bônus: ${conta.bonusPct}%${faixa.length > 1 ? ` · faixa ${Math.min(...faixa)}%–${Math.max(...faixa)}%` : ""}`,
  );

  destaques.push(
    conta.referencia !== undefined
      ? `Milheiro final ${emReais(conta.custoMilheiro)} (ref. ${emReais(conta.referencia)} → ${conta.desconto! >= 0 ? `${emPct(conta.desconto!)} abaixo` : `${emPct(-conta.desconto!)} acima`})`
      : `Milheiro final ${emReais(conta.custoMilheiro)} (sem valor de referência no config)`,
  );

  if (conta.pontosParaMinimo) {
    destaques.push(`Mínimo do programa: ${conta.minTransferencia!.toLocaleString("pt-BR")} milhas ≈ ${conta.pontosParaMinimo.toLocaleString("pt-BR")} pts Livelo`);
  }

  destaques.push(prazo(oferta.janela.fim, agora));

  if (oferta.exigeOptIn) destaques.push("⚠️ Exige cadastro na campanha antes de transferir");

  // Transferência é evento raro e de valor alto: fica sempre acima dos parceiros.
  return { oferta, score: 500 + conta.bonusPct, vale, destaques };
}

function avaliarOfertaParceiro(oferta: Extract<Oferta, { tipo: "parceiro" }>, agora: Date): Avaliacao {
  const conta = avaliarParceiro(oferta);

  if (ehIgnorado(oferta.parceiro)) {
    return { oferta, score: 0, vale: false, destaques: ["categoria na lista de ignorados"] };
  }
  if (!estaVigente(oferta.janela, agora)) {
    return { oferta, score: 0, vale: false, destaques: ["fora da janela de validade"] };
  }
  if (conta.pontos <= oferta.base) {
    return { oferta, score: 0, vale: false, destaques: ["paridade igual ou abaixo da base"] };
  }

  const fator = ehFavorito(oferta.parceiro) ? FATOR_FAVORITO : 1;
  const limiteCashback = config.limites.cashbackEfetivoMin * fator;
  const limiteMultiplicador = config.limites.multiplicadorMin * fator;

  const razaoCashback = conta.cashbackEfetivo / limiteCashback;
  const razaoMultiplicador = conta.multiplicador / limiteMultiplicador;
  const vale = razaoCashback >= 1 || razaoMultiplicador >= 1;

  const destaques = [
    `${conta.pontos} pts por ${oferta.moeda} 1 (base ${oferta.base} → ${conta.multiplicador.toFixed(1)}x)`,
    `Retorno efetivo ${emPct(conta.cashbackEfetivo, 1)} do valor gasto`,
    prazo(oferta.janela.fim, agora),
  ];

  if (oferta.campanha === "PROMOTION_ONLY_CLUB") destaques.push("Só vale para assinantes do Clube Livelo");
  if (ehFavorito(oferta.parceiro)) destaques.push("Parceiro favorito — limite reduzido");
  if (/cupom/i.test(oferta.regras)) destaques.push("⚠️ Exige cupom — confira as regras");
  if (/limitad[oa]|limite de|m[áa]ximo de \d|at[ée] [\d.]+ pontos/i.test(oferta.regras)) destaques.push("⚠️ Tem teto de pontos");

  return { oferta, score: 100 * Math.max(razaoCashback, razaoMultiplicador), vale, destaques };
}

function prazo(fim: Date | undefined, agora: Date): string {
  const dias = diasRestantes(fim, agora);
  if (dias === undefined) return "Sem prazo informado";
  if (dias <= 0) return `⏰ Acaba hoje, ${formatarData(fim)}`;
  if (dias === 1) return `Vale até amanhã, ${formatarData(fim)}`;
  return `Vale até ${formatarData(fim)} (${dias} dias)`;
}

/**
 * O score só é comparável dentro de um mesmo tipo, então a ordenação é por tipo
 * primeiro: transferência bonificada é evento raro e de valor alto, vem sempre antes.
 */
const PRIORIDADE = { transferencia: 0, parceiro: 1, blog: 2 } as const;

/** Ordena e corta o excesso de parceiros para a mensagem não virar spam. */
export function selecionar(avaliacoes: Avaliacao[]): Avaliacao[] {
  const valem = avaliacoes
    .filter((a) => a.vale)
    .sort((a, b) => PRIORIDADE[a.oferta.tipo] - PRIORIDADE[b.oferta.tipo] || b.score - a.score);

  const tetos: Record<string, number> = {
    parceiro: config.limites.maxParceirosPorRodada,
    blog: config.limites.maxBlogsPorRodada,
  };
  const contagem: Record<string, number> = {};

  return valem.filter((a) => {
    const teto = tetos[a.oferta.tipo];
    if (teto === undefined) return true;
    contagem[a.oferta.tipo] = (contagem[a.oferta.tipo] ?? 0) + 1;
    return contagem[a.oferta.tipo]! <= teto;
  });
}
