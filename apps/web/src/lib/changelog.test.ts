import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { CHANGELOG } from "./changelog";

/**
 * As novidades de cada versão vivem em DOIS lugares: o `CHANGELOG.md` da raiz
 * (notas de versão, para mostrar ao cliente) e o `changelog.ts` (o aviso dentro
 * do app + Perfil → Novidades). O próprio .md pede a sincronia na mão (DL-063).
 *
 * Este teste é quem cobra — pega o esquecimento clássico de escrever a novidade
 * num arquivo e não no outro, que só apareceria depois, com o cliente na frente.
 *
 * A comparação é de ESTRUTURA (versão, data e quantidade de itens), não de texto
 * palavra a palavra: as notas de versão podem ser mais prolixas que o aviso da
 * tela, e isso é proposital. O que não pode é uma novidade existir só de um lado.
 */

/**
 * Sobe do diretório de execução até achar o arquivo na raiz do monorepo — não dá
 * para usar `import.meta.url` aqui (no Vitest ele não é uma URL `file:`) e fixar
 * "../../" amarraria o teste a rodar de `apps/web`.
 */
function fromRepoRoot(name: string): string {
  let dir = process.cwd();
  for (;;) {
    const candidate = resolve(dir, name);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`${name} não encontrado a partir de ${process.cwd()}`);
    dir = parent;
  }
}

const MD = readFileSync(fromRepoRoot("CHANGELOG.md"), "utf8");

/**
 * Título da seção no .md a partir da versão crua: "1.1.0-beta" → "v1.1.0b".
 * Repare que NÃO é o rótulo da UI (`formatVersion` dá "v1.1b", sem o patch zero)
 * — nas notas de versão o semver aparece cheio, para não haver dúvida de qual é.
 */
function heading(raw: string): string {
  const [core, pre] = raw.split("-");
  const suffix = pre ? (/^b(eta)?/i.test(pre) ? "b" : `-${pre}`) : "";
  return `v${core}${suffix}`;
}

interface Section {
  version: string;
  date: string;
  items: number;
}

/** Seções `## vX.Y.Zb — AAAA-MM-DD` do .md, com a contagem de itens de cada uma. */
function parseMd(md: string): Section[] {
  const sections: Section[] = [];
  for (const line of md.split(/\r?\n/)) {
    const head = /^## (\S+) — (\d{4}-\d{2}-\d{2})\s*$/.exec(line);
    if (head) {
      sections.push({ version: head[1], date: head[2], items: 0 });
      continue;
    }
    // Só os itens de primeiro nível (o "> Sincronize…" é citação, não item).
    if (sections.length > 0 && line.startsWith("- ")) {
      sections[sections.length - 1].items += 1;
    }
  }
  return sections;
}

describe("changelog — CHANGELOG.md e changelog.ts não podem divergir (DL-063)", () => {
  const sections = parseMd(MD);

  it("o .md tem uma seção por versão do aviso, na mesma ordem (recente primeiro)", () => {
    expect(sections.map((s) => s.version)).toEqual(
      CHANGELOG.map((e) => heading(e.version)),
    );
  });

  it("cada versão tem a mesma data nos dois arquivos", () => {
    for (const [i, entry] of CHANGELOG.entries()) {
      expect(sections[i].date, `data da ${entry.version}`).toBe(entry.date);
    }
  });

  it("cada versão tem a mesma quantidade de novidades nos dois arquivos", () => {
    for (const [i, entry] of CHANGELOG.entries()) {
      expect(
        sections[i].items,
        `nº de novidades da ${entry.version} — escreveu num arquivo e esqueceu do outro?`,
      ).toBe(entry.items.length);
    }
  });

  it("nenhuma novidade está vazia", () => {
    for (const entry of CHANGELOG) {
      expect(entry.items.length).toBeGreaterThan(0);
      for (const item of entry.items) expect(item.trim()).not.toBe("");
    }
  });
});
