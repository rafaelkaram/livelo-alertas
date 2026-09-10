/** Uma janela de validade de promoção. `fim` é o que importa para a urgência. */
export type Janela = {
  inicio?: Date;
  fim?: Date;
  /** Texto original, quando não deu para parsear as datas. */
  bruto?: string;
};

/** Faixa de bônus de uma campanha de transferência ("80% para clientes Clube Livelo"). */
export type TierBonus = {
  pct: number;
  condicao: string;
};

export type OfertaTransferencia = {
  tipo: "transferencia";
  /** Chave estável do parceiro na Livelo (ex.: "AZLSkuTransfer"). */
  id: string;
  parceiro: string;
  /** Chave em `config.programas`, quando o parceiro é um programa conhecido. */
  programa?: string;
  url: string;
  /** Todas as faixas anunciadas, da menor para a maior. */
  tiers: TierBonus[];
  /** Faixa aplicável ao perfil configurado. `undefined` quando não deu para identificar. */
  meuBonusPct?: number;
  meuTierCondicao?: string;
  janela: Janela;
  /** Campanha exige cadastro prévio no site do parceiro sob pena de perder os pontos. */
  exigeOptIn: boolean;
  linkOptIn?: string;
  /** Texto das regras, já sem HTML. */
  regras: string;
  /** true quando há campanha ativa mas o percentual não foi identificado. */
  incerta: boolean;
};

export type OfertaParceiro = {
  tipo: "parceiro";
  id: string;
  parceiro: string;
  url: string;
  moeda: string;
  /** Pontos por unidade de moeda fora de promoção. */
  base: number;
  /** Pontos por unidade de moeda agora, sem Clube. */
  atual: number;
  /** Pontos por unidade de moeda agora, com Clube. */
  atualClube: number;
  campanha: string;
  janela: Janela;
  /** Termos legais sem HTML (cupom obrigatório, teto de pontos, exclusões). */
  regras: string;
};

export type OfertaBlog = {
  tipo: "blog";
  id: string;
  titulo: string;
  url: string;
  fonte: string;
  publicadoEm?: Date;
  /** Palavras-chave que fizeram o item passar no filtro. */
  motivos: string[];
};

export type Oferta = OfertaTransferencia | OfertaParceiro | OfertaBlog;

/** Oferta + veredito econômico, pronta para virar mensagem. */
export type Avaliacao = {
  oferta: Oferta;
  /** Ordena os alertas: quanto maior, mais no topo. */
  score: number;
  /** Linhas de justificativa que entram na mensagem. */
  destaques: string[];
  vale: boolean;
};

export class FonteQuebrada extends Error {
  constructor(
    readonly fonte: string,
    readonly causa: unknown,
  ) {
    super(`fonte "${fonte}": ${causa instanceof Error ? causa.message : String(causa)}`);
    this.name = "FonteQuebrada";
  }
}
