import { describe, expect, it } from "vitest";
import { filtrar, parseFeed } from "../src/sources/blogs.js";
import { semHtml } from "../src/core/next-data.js";
import { fatiar, formatarOferta } from "../src/notify/telegram.js";
import { avaliar } from "../src/core/rules.js";

describe("filtrar", () => {
  it("aceita post de Livelo sobre bônus", () => {
    expect(filtrar("9/9 Livelo! Acumule até 15 pontos por real gasto", "")).toEqual(["pontos por real"]);
  });

  it("recusa promoção de passagem que só cita a Livelo no corpo", () => {
    expect(filtrar("Voos da Azul a partir de 4 mil pontos", "compre pontos na Livelo com bônus")).toBeNull();
  });

  it("recusa post de Livelo sem assunto de interesse", () => {
    expect(filtrar("Livelo lança novo aplicativo", "novidades do app")).toBeNull();
  });
});

describe("parseFeed", () => {
  const feed = (itens: string) => `<?xml version="1.0"?><rss><channel>${itens}</channel></rss>`;
  const agora = new Date("2026-09-09T12:00:00-03:00");
  const item = (titulo: string, data: string) =>
    `<item><title><![CDATA[${titulo}]]></title><link>https://ex.com/${encodeURIComponent(titulo)}</link><pubDate>${data}</pubDate><description>bônus</description></item>`;

  it("ignora post antigo, que só encheria o primeiro alerta", () => {
    const xml = feed(
      item("Livelo com 100% de bônus hoje", "Tue, 09 Sep 2026 09:00:00 +0000") +
        item("Livelo com bônus na semana passada", "Tue, 01 Sep 2026 09:00:00 +0000"),
    );
    const ofertas = parseFeed(xml, "Teste", agora);
    expect(ofertas.map((o) => o.titulo)).toEqual(["Livelo com 100% de bônus hoje"]);
  });

  it("reclama de feed sem itens em vez de devolver lista vazia", () => {
    expect(() => parseFeed(feed(""), "Teste", agora)).toThrow(/sem itens/);
  });
});

describe("semHtml", () => {
  it("decodifica entidade numérica sem reintroduzir &amp;", () => {
    expect(semHtml("Clube Livelo Top &#8211; milheiro a R$ 23,68")).toBe("Clube Livelo Top – milheiro a R$ 23,68");
  });

  it("decodifica &amp;#39; sem virar apóstrofo solto", () => {
    expect(semHtml("Sam&amp;#39;s Club")).toBe("Sam&#39;s Club");
  });
});

describe("formatarOferta", () => {
  it("escapa o título do blog para não quebrar o HTML do Telegram", () => {
    const a = avaliar({
      tipo: "blog",
      id: "1",
      titulo: "Livelo & Smiles <promo>",
      url: "https://ex.com/a?b=1&c=2",
      fonte: "Teste",
      motivos: ["bônus"],
    });
    const html = formatarOferta(a);
    expect(html).toContain("Livelo &amp; Smiles &lt;promo&gt;");
    expect(html).toContain("b=1&amp;c=2");
  });
});

describe("fatiar", () => {
  it("quebra em blocos sem partir uma oferta ao meio", () => {
    const bloco = "linha1\nlinha2";
    const pedacos = fatiar(Array.from({ length: 10 }, () => bloco).join("\n\n"), 40);
    expect(pedacos.length).toBeGreaterThan(1);
    expect(pedacos.every((p) => p.length <= 40)).toBe(true);
    expect(pedacos.join("\n\n").split("\n\n")).toHaveLength(10);
  });
});
