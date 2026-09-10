/**
 * Único arquivo que precisa ser editado no dia a dia.
 *
 * Os valores de milheiro são a *sua* avaliação de quanto vale 1.000 milhas em cada
 * programa — é o que separa "promoção" de "promoção que vale a pena". Comece com os
 * valores abaixo, acompanhe os alertas por algumas semanas e calibre usando o que
 * ficou registrado em `history/`.
 */
export const config = {
  perfil: {
    /** Assinante do Clube Livelo? Define se o alerta usa `parity` ou `parityClub`. */
    clubeLivelo: true,
    /**
     * Clubes de parceiros que você assina. As campanhas escalonam o bônus por clube
     * *e* por tempo de casa — na campanha Azul de set/2026, Clube Livelo sozinho dava
     * 80%, somado ao Clube Azul dava 90%, e passava de 100% conforme os meses de
     * assinatura. Deixe `mesesAssinatura` de fora se não souber: a faixa que depende
     * de tempo nunca é assumida, então o alerta erra para menos, nunca para mais.
     */
    clubesParceiros: [
      { clube: "azul", mesesAssinatura: undefined as number | undefined },
    ],
  },

  /**
   * Programas de destino. `chave` casa com o nome do parceiro na Livelo via `aliases`.
   * `ratio`: quantas milhas você recebe por ponto Livelo transferido (1 na maioria).
   */
  programas: {
    smiles: { nome: "Smiles", aliases: ["smiles"], valorMilheiro: 20, minTransferencia: 1_000, ratio: 1 },
    latamPass: { nome: "LATAM Pass", aliases: ["latam"], valorMilheiro: 22, minTransferencia: 12_000, ratio: 1 },
    azul: { nome: "Azul Fidelidade", aliases: ["azul"], valorMilheiro: 18, minTransferencia: 1_000, ratio: 1 },
    iberia: { nome: "Iberia Plus", aliases: ["iberia"], valorMilheiro: 30, minTransferencia: 1_000, ratio: 1 },
    flyingBlue: { nome: "Flying Blue", aliases: ["flying blue"], valorMilheiro: 28, minTransferencia: 1_000, ratio: 1 },
    britishAirways: { nome: "British Airways", aliases: ["british"], valorMilheiro: 28, minTransferencia: 1_000, ratio: 1 },
    copa: { nome: "Copa Airlines", aliases: ["copa"], valorMilheiro: 24, minTransferencia: 1_000, ratio: 1 },
    mileagePlus: { nome: "MileagePlus", aliases: ["mileageplus"], valorMilheiro: 26, minTransferencia: 1_000, ratio: 1 },
    etihad: { nome: "Etihad Guest", aliases: ["etihad"], valorMilheiro: 22, minTransferencia: 1_000, ratio: 1 },
    aeromexico: { nome: "Aeroméxico Rewards", aliases: ["aeroméxico", "aeromexico"], valorMilheiro: 20, minTransferencia: 1_000, ratio: 1 },
  },

  /** Quanto lhe custa, em reais, 1 ponto Livelo (compra, mensalidade do Clube, gasto no cartão). */
  custoPontoLivelo: 0.028,

  /**
   * Bônus de transferência que você considera "normal" conseguir esperando.
   * Usado para valorar 1 ponto Livelo parado na conta — e, com isso, o cashback
   * efetivo de comprar em um parceiro. 0.8 = 80%.
   */
  bonusTransferenciaAssumido: 0.8,

  limites: {
    /** Bônus de transferência mínimo, em %, para virar alerta. */
    bonusTransferenciaMin: 80,
    /**
     * Retorno mínimo em pontos por real gasto, como fração do valor gasto.
     * Cuidado ao baixar: com 1 ponto Livelo valendo ~5 centavos, um parceiro de
     * 2 pts/R$ já devolve 10% — o filtro só discrimina de verdade acima de 0.4.
     */
    cashbackEfetivoMin: 0.5,
    /** Paridade atual dividida pela paridade base. 3 = "o triplo do normal". */
    multiplicadorMin: 3,
    /** Máximo de ofertas de parceiro por rodada, para a mensagem não virar spam. */
    maxParceirosPorRodada: 8,
    /** Máximo de itens de blog por rodada — é sinal secundário, não pode dominar. */
    maxBlogsPorRodada: 4,
  },

  /** Parceiros que você realmente usa: entram com limites 40% menores. */
  parceirosFavoritos: ["Amazon", "Magazine Luiza", "Booking", "Mercado Livre", "iFood"],

  /** Nunca alertar sobre parceiros cujo nome contenha estes termos (case-insensitive). */
  ignorados: ["consórcio", "seguro", "previdência"],

  /** Feeds de blogs de milhas — sinal secundário, para o que o site deslogado não expõe. */
  blogs: [
    { nome: "Passageiro de Primeira", url: "https://passageirodeprimeira.com/feed/" },
    { nome: "Melhores Cartões", url: "https://www.melhorescartoes.com.br/feed" },
    { nome: "Melhores Destinos", url: "https://www.melhoresdestinos.com.br/feed" },
  ],

  /**
   * Um item de blog só vira alerta se casar com um termo de `obrigatorias` E um de
   * `assuntos`. Mantém fora as centenas de posts de passagem promocional.
   */
  filtroBlogs: {
    obrigatorias: ["livelo"],
    assuntos: [
      "bônus",
      "bonus",
      "transferência",
      "transferencia",
      "compra de pontos",
      "comprar pontos",
      "clube livelo",
      "pontos por real",
    ],
  },
} as const;

export type Config = typeof config;
export type Programa = Config["programas"][keyof Config["programas"]];
