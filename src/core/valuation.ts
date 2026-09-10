import { config } from "../../config.js";
import type { OfertaParceiro, OfertaTransferencia } from "./types.js";

/**
 * Quanto vale, em reais, 1 ponto Livelo parado na conta.
 *
 * Um ponto só vira valor depois de transferido, então o valor de referência é o do
 * melhor programa de destino, já contando com o bônus de transferência que se
 * consegue esperando (`bonusTransferenciaAssumido`).
 */
export function valorPontoLivelo(): number {
  const melhor = Object.values(config.programas).reduce(
    (max, p) => Math.max(max, (p.valorMilheiro / 1000) * p.ratio),
    0,
  );
  return melhor * (1 + config.bonusTransferenciaAssumido);
}

export type ContaTransferencia = {
  bonusPct: number;
  /** Quanto custa 1.000 milhas no destino, considerando o custo do ponto Livelo. */
  custoMilheiro: number;
  /** Valor de referência do milheiro naquele programa, vindo do config. */
  referencia?: number;
  /** Fração abaixo da referência. 0.14 = milheiro saindo 14% mais barato. */
  desconto?: number;
  minTransferencia?: number;
  /** Pontos Livelo necessários para atingir o mínimo do programa. */
  pontosParaMinimo?: number;
};

export function avaliarTransferencia(oferta: OfertaTransferencia): ContaTransferencia | undefined {
  const bonusPct = oferta.meuBonusPct;
  if (bonusPct === undefined) return undefined;

  const programa = oferta.programa
    ? (config.programas as Record<string, (typeof config.programas)[keyof typeof config.programas] | undefined>)[oferta.programa]
    : undefined;

  const ratio = programa?.ratio ?? 1;
  const multiplicador = (1 + bonusPct / 100) * ratio;
  const custoMilheiro = (config.custoPontoLivelo * 1000) / multiplicador;

  return {
    bonusPct,
    custoMilheiro,
    referencia: programa?.valorMilheiro,
    desconto: programa ? 1 - custoMilheiro / programa.valorMilheiro : undefined,
    minTransferencia: programa?.minTransferencia,
    pontosParaMinimo: programa ? Math.ceil(programa.minTransferencia / multiplicador) : undefined,
  };
}

export type ContaParceiro = {
  /** Pontos por unidade de moeda válidos para o seu perfil. */
  pontos: number;
  /** Retorno em valor por unidade gasta. 0.30 = R$ 0,30 de pontos por R$ 1. */
  cashbackEfetivo: number;
  /** Paridade atual sobre a paridade base. */
  multiplicador: number;
  ganhoExtra: number;
};

export function avaliarParceiro(oferta: OfertaParceiro): ContaParceiro {
  const pontos = config.perfil.clubeLivelo ? oferta.atualClube : oferta.atual;
  const base = oferta.base > 0 ? oferta.base : 1;

  return {
    pontos,
    cashbackEfetivo: pontos * valorPontoLivelo(),
    multiplicador: pontos / base,
    ganhoExtra: pontos - oferta.base,
  };
}

export const emReais = (v: number): string =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

export const emPct = (fracao: number, casas = 0): string =>
  `${(fracao * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`;
