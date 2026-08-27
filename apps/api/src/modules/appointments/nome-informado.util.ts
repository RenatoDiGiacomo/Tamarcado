/**
 * Nome informado × nome cadastrado (DL-071).
 *
 * O link público reaproveita a cliente pelo telefone e ignora o nome digitado.
 * A tela Pendentes mostra o nome informado para quem confirma decidir — mas
 * **só quando ele diverge de verdade**. Aviso que aparece em toda solicitação
 * vira ruído e deixa de ser lido; aí a divergência real passa junto com o resto.
 *
 * A comparação é por TOKEN, normalizada: acento, caixa, pontuação, ordem e
 * partes faltando não são divergência. "Rosana" × "Rosana Aparecida Silva",
 * "rosana silva" × "Silva, Rosana" e "Ana-Maria" × "ana maria" batem.
 * "Teste" × "Rosana" não bate — e é esse que precisa aparecer.
 */

/** Partículas de nome: sozinhas não identificam ninguém (todo mundo tem "de"). */
const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "di", "du", "del", "van", "von"]);

/** Menor prefixo que ainda vale como abreviação ("Rosa"→"Rosana" bate; "R." não). */
const MIN_PREFIXO = 3;

/**
 * Nome → tokens comparáveis: sem acento, minúsculo, sem pontuação (hífen e
 * apóstrofo separam: "Ana-Maria" = "ana" + "maria"), sem partículas.
 */
export function tokensDeNome(valor: string): string[] {
  return valor
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t !== "" && !PARTICULAS.has(t));
}

/** Dois tokens "batem" se são iguais ou se um abrevia o outro (≥3 letras). */
function casam(a: string, b: string): boolean {
  if (a === b) return true;
  const [menor, maior] = a.length <= b.length ? [a, b] : [b, a];
  return menor.length >= MIN_PREFIXO && maior.startsWith(menor);
}

/**
 * Devolve o nome informado **como foi digitado** quando ele diverge do cadastro,
 * ou `null` quando não há o que avisar. Divergência = NENHUM token do informado
 * casa com algum token do cadastrado.
 *
 * `null` também quando não dá para comparar: sem nome informado (agendamento
 * manual/bot, solicitação anterior ao DL-071) ou quando um dos lados não tem
 * token significativo — sem base para afirmar divergência, não se avisa.
 */
export function nomeInformadoDivergente(
  informado: string | null | undefined,
  cadastrado: string | null | undefined,
): string | null {
  if (informado == null || informado.trim() === "") return null;
  const doInformado = tokensDeNome(informado);
  const doCadastro = tokensDeNome(cadastrado ?? "");
  if (doInformado.length === 0 || doCadastro.length === 0) return null;
  const bate = doInformado.some((i) => doCadastro.some((c) => casam(i, c)));
  return bate ? null : informado.trim();
}
