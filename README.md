# livelo-alertas

Avisa no Telegram quando aparece promoção da Livelo que **vale a pena** — transferência
bonificada para programa aéreo, parceiro pagando muito acima da paridade normal, ou
promoção de compra de pontos / Clube.

O filtro não é "tem promoção?", é **quanto custa o milheiro no fim** e **quanto do valor
gasto volta em pontos**. Num dia comum, 93 dos 254 parceiros da Livelo estão em alguma
promoção; sem critério econômico o alerta vira ruído.

## Como funciona

Três fontes, a cada 30 minutos, via GitHub Actions:

| Fonte | O que traz | Confiança |
| --- | --- | --- |
| `juntar-pontos/todos-os-parceiros` | 254 parceiros com paridade atual **e** paridade base (`parityBau`) | alta — dado estruturado |
| 15 páginas de `livelo-para-parceiros/*` | campanhas de transferência com todas as faixas de bônus | alta — texto das regras |
| RSS de blogs de milhas | compra de pontos, Clube e bônus segmentado | baixa — sinal para conferir |

O site da Livelo é Next.js e serializa tudo em `<script id="__NEXT_DATA__">`. Não há login,
captcha nem browser headless envolvido — só um `User-Agent` de browser (com o UA padrão do
Node a Livelo devolve 403).

Duas armadilhas que o código já contorna:

- **`campanhaAtiva.ativa` mente.** Na campanha Azul de set/2026 esse flag da página de
  listagem estava `false` com a promoção no ar. Por isso as 15 páginas de parceiro são
  visitadas a cada rodada.
- **Placeholder `{{bonus}}`.** Algumas páginas trazem o template não preenchido; isso é
  ausência de campanha, não campanha de 0%.

## Configuração

Tudo que se ajusta no dia a dia está em [`config.ts`](./config.ts).

O campo mais importante é `programas[].valorMilheiro`: **quanto você considera que vale
1.000 milhas** em cada programa. É ele que transforma "10 pontos por real" em "54% do valor
gasto de volta". Os valores que vêm no arquivo são um chute razoável — calibre com o que for
ficando em `history/`.

Perfil de clube muda o resultado de forma relevante. As campanhas escalonam o bônus por
clube **e** por tempo de casa:

```ts
perfil: {
  clubeLivelo: true,
  clubesParceiros: [{ clube: "azul", mesesAssinatura: 24 }],
}
```

Na campanha Azul de set/2026 isso era a diferença entre 80% (só Clube Livelo), 90% (+ Clube
Azul), 100% (12–35 meses de Clube Azul) e 120% (mais de 60 meses). **Sem `mesesAssinatura`
o alerta usa a faixa menor** — erra para menos, nunca para mais.

Outros limites:

| Campo | Efeito |
| --- | --- |
| `limites.bonusTransferenciaMin` | bônus mínimo, em %, para alertar |
| `limites.cashbackEfetivoMin` | retorno mínimo como fração do gasto (0.5 = 50%) |
| `limites.multiplicadorMin` | paridade atual ÷ paridade base |
| `parceirosFavoritos` | entram com limites 40% menores |
| `ignorados` | nunca alertam (consórcio, seguro, previdência) |

## Instalação

```bash
npm ci
npm run check -- --dry-run   # mostra o que alertaria, sem enviar nem gravar nada
```

Para receber no Telegram:

1. Fale com o [@BotFather](https://t.me/BotFather), `/newbot`, guarde o token.
2. Mande qualquer mensagem para o bot e pegue o seu chat id em
   `https://api.telegram.org/bot<TOKEN>/getUpdates`.
3. No GitHub: **Settings → Secrets and variables → Actions** → `TELEGRAM_BOT_TOKEN` e
   `TELEGRAM_CHAT_ID`.
4. **Settings → Actions → General → Workflow permissions** → *Read and write* (o job
   commita o estado de volta).

Use um repositório **público**: 48 rodadas por dia estouram os 2.000 minutos mensais do
plano gratuito em repositório privado. Nada sensível vai para o código — só os seus valores
de milheiro; os tokens ficam em secrets. Preferindo privado, restrinja o cron à janela
`*/30 8-23 * * *`.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run check` | rodada normal: coleta, avalia, alerta só o que é novo |
| `npm run check -- --dry-run` | imprime no terminal, sem enviar nem gravar |
| `npm run check -- --force` | reenvia ignorando o dedupe (para testar a mensagem) |
| `npm run digest` | resumo de tudo que está valendo agora |
| `npm run verify` | typecheck + testes |
| `npm run fixtures` | rebaixa as páginas ao vivo quando um parser quebrar |

## Estado e histórico

- `state/seen.json` — dedupe. A chave inclui os números da oferta, então **bônus que sobe ou
  promoção prorrogada alertam de novo**; repetição do mesmo número, não.
- `history/AAAA-MM.jsonl` — tudo que foi visto, tenha alertado ou não. É a base para
  calibrar `valorMilheiro` depois de alguns meses.

Ambos são commitados pelo próprio workflow.

## Quando quebrar

A Livelo pode mudar o `__NEXT_DATA__` a qualquer momento. Os schemas são tolerantes
(`zod` com `.loose()`, campos opcionais) e a varredura procura os dados pela **forma** em vez
de por caminho fixo, então reordenar componentes não quebra nada. Mudança de nome de campo,
sim.

Se quebrar, o alerta **não fica em silêncio**: chega um `⚠️ Alerta Livelo com problema` no
Telegram e o job sai com código 1. Aí é rodar `npm run fixtures`, ver o que mudou no payload
e ajustar o schema — os testes rodam todos contra fixtures salvas, sem rede.
