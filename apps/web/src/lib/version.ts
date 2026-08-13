// Rótulo de versão exibido na UI (login + painel).
//
// A fonte é o `version` do package.json, injetado na build via `define`
// (__APP_VERSION__) — NÃO hardcoded aqui, para não desatualizar. Este módulo só
// FORMATA: "1.0.0-beta" -> "v1.0b"; "1.0.1-beta" -> "v1.0.1b"; "1.0.0" -> "v1.0".
// O PATCH aparece quando > 0 — é o que torna uma correção (bump de PATCH, DL-063)
// VISÍVEL na tela; sem isso o cliente/Renato não sabe que houve atualização. O
// sufixo "b" (beta) some sozinho quando a versão sair de pré-lançamento.
export function formatVersion(raw: string): string {
  const [core, pre] = raw.split("-");
  const [major = "0", minor = "0", patch = "0"] = core.split(".");
  let suffix = "";
  if (pre) {
    // beta -> "b"; qualquer outro pré-lançamento aparece por extenso.
    suffix = /^b(eta)?/i.test(pre) ? "b" : `-${pre}`;
  }
  // PATCH só entra quando > 0, para o ".0" ficar limpo (v1.0b, não v1.0.0b).
  const patchPart = patch !== "0" ? `.${patch}` : "";
  return `v${major}.${minor}${patchPart}${suffix}`;
}

// Guarda o caso (testes/ambientes) em que o `define` não substituiu o global.
const raw = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

export const APP_VERSION = formatVersion(raw);
