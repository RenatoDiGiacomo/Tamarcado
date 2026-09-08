import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { PLAN_NAMES } from "../../common/capabilities/plan";

/**
 * GUARD-RAIL do DL-072: NENHUM CÓDIGO PERGUNTA O NOME DO PLANO.
 *
 * O defeito que o DL-072 existe para impedir é exatamente `plan === "pro"`
 * espalhado — foi o que reprovou o DL-057. Com o campo `companies.plan` de volta
 * na base (como RÓTULO comercial e histórico do que foi vendido), a tentação
 * volta junto; este teste é o que a mantém honesta.
 *
 * A regra: literal de nome de plano só pode aparecer em `capability-presets.ts`
 * (a tradução plano→capabilities, que acontece UMA VEZ, na contratação) e nas
 * migrations (o DEFAULT da coluna). Em qualquer outro lugar do `src/`, falha.
 *
 * Comentários e docblocks são removidos antes da varredura — explicar o defeito
 * na documentação é justamente o que queremos incentivar.
 */

const SRC = join(__dirname, "..", "..");

/** Onde o nome do plano PODE aparecer, e por quê. */
const ARQUIVOS_AUTORIZADOS = [
  // A lista do que vendemos. Vocabulário comercial, sem condicional nenhuma.
  join("common", "capabilities", "plan.ts"),
  // A tradução plano → capabilities. A razão de ser deste arquivo.
  join("modules", "capabilities", "capability-presets.ts"),
  // DEFAULT da coluna `companies.plan` no schema — dado, não decisão.
  join("database", "migrations"),
  // Seed de desenvolvimento: escolhe o plano do salão de teste (contratação).
  join("database", "seeds"),
];

function listarArquivosTs(dir: string): string[] {
  const encontrados: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      encontrados.push(...listarArquivosTs(caminho));
    } else if (nome.endsWith(".ts") && !nome.endsWith(".spec.ts")) {
      encontrados.push(caminho);
    }
  }
  return encontrados;
}

/** Remove comentários de bloco e de linha (o literal em doc não é violação). */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function autorizado(caminhoRelativo: string): boolean {
  return ARQUIVOS_AUTORIZADOS.some((permitido) =>
    caminhoRelativo.startsWith(permitido),
  );
}

describe("GUARD-RAIL: nome de plano não vaza para a lógica de negócio (DL-072)", () => {
  const literais = PLAN_NAMES.map(
    (plano) => new RegExp(`["'\`]${plano}["'\`]`),
  );

  it("nenhum literal de plano fora dos presets, migrations e seed", () => {
    const violacoes: string[] = [];
    for (const arquivo of listarArquivosTs(SRC)) {
      const caminhoRelativo = relative(SRC, arquivo).split("/").join(sep);
      if (autorizado(caminhoRelativo)) {
        continue;
      }
      const codigo = semComentarios(readFileSync(arquivo, "utf-8"));
      codigo.split("\n").forEach((linha, indice) => {
        if (literais.some((literal) => literal.test(linha))) {
          violacoes.push(`${caminhoRelativo}:${indice + 1} → ${linha.trim()}`);
        }
      });
    }
    // Se falhar: o acesso voltou a ser decidido pelo NOME DO PLANO, que é o
    // modelo revogado (DL-057 ⛔). Decida por CAPABILITY — a lista da empresa —
    // e, se o recurso é novo, adicione a chave em `common/capabilities/`.
    expect(violacoes).toEqual([]);
  });

  it("a varredura enxerga de fato os arquivos do src (sanity)", () => {
    // Sem esta âncora, um erro na varredura deixaria o guard-rail cego e verde.
    const arquivos = listarArquivosTs(SRC);
    expect(arquivos.length).toBeGreaterThan(20);
    expect(
      arquivos.some((arquivo) => arquivo.endsWith("capability-presets.ts")),
    ).toBe(true);
  });
});
