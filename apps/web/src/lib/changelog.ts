import { formatVersion } from "./version";

/**
 * Novidades por versão, em LINGUAGEM DE QUEM USA — fonte do aviso de atualização
 * (mostrado uma vez por versão) e da lista "Novidades" no Perfil. Espelha o
 * `CHANGELOG.md` da raiz (DL-063); mantenha os dois em sincronia ao lançar.
 * O mais recente vem PRIMEIRO. `version` é a versão CRUA (bate com APP_VERSION_RAW).
 */
export interface ChangelogEntry {
  version: string; // ex.: "1.1.0-beta"
  date: string; // "YYYY-MM-DD"
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.1.0-beta",
    date: "2026-08-20",
    items: [
      "Financeiro: registre o pagamento recebido de cada atendimento (pago ou pendente, forma de pagamento opcional) e acompanhe os recebimentos por período, com filtros e exportação para o Excel (CSV).",
      "Clientes: na lista e no perfil de cada cliente aparece quanto está em aberto e o que já foi pago.",
      "Dashboard: um painel de leitura com os números do negócio — faturamento, vendas, ticket médio, atendimentos, clientes e o resultado do período — com gráficos. Abre como a primeira página ao entrar.",
      "Equipe: virou um menu próprio para cadastrar a remuneração de cada profissional (comissão e/ou salário) e ver a previsão do período.",
      "Pagamento à equipe: registre no Financeiro quanto pagou à equipe; o sistema passa a mostrar o resultado — o que entrou menos o que saiu.",
      "No celular, a navegação mudou: a barra de baixo ficou fixa com Agenda, Pendentes, o botão de novo agendamento no meio, Clientes e um Menu. Dashboard, Financeiro, Equipe, Configurações e Perfil ficam no Menu, que abre pelo lado — assim nada fica escondido nem espremido quando o sistema ganha uma tela nova.",
      "No celular, o Dashboard e o Financeiro ficaram mais fáceis de ler: os números agora deslizam para o lado, como as fotos de uma rede social, em vez de ocuparem a tela inteira empilhados. No Dashboard o gráfico já aparece de cara. No Financeiro, as datas continuam à mão e os outros filtros (situação, forma de pagamento e cliente) abrem pelo botão \"Filtros\", que mostra quantos estão ligados — antes o campo da cliente aparecia cortado no celular.",
      "Aviso de novidades: ao entrar depois de uma atualização, você vê um resumo do que mudou (este aviso). Dá para reabrir em Perfil → Novidades.",
    ],
  },
  {
    version: "1.0.1-beta",
    date: "2026-08-13",
    items: [
      "Corrigido: o sistema não perde mais a sessão quando fica muito tempo aberto sem uso. Agora a sessão se renova sozinha; se o acesso realmente tiver expirado, você é levado à tela de entrada com um aviso claro, em vez de um erro na tela.",
    ],
  },
];

/** Rótulo exibível da versão (ex.: "1.1.0-beta" → "v1.1b"). */
export function displayVersion(version: string): string {
  return formatVersion(version);
}

/** Entrada de uma versão específica, ou undefined. */
export function entryFor(version: string): ChangelogEntry | undefined {
  return CHANGELOG.find((e) => e.version === version);
}

const seenKey = (userId: string): string => `tamarcado.changelogSeen.${userId}`;

/** Última versão que o usuário já viu (no navegador deste aparelho). */
export function lastSeenVersion(userId: string): string | null {
  try {
    return localStorage.getItem(seenKey(userId));
  } catch {
    return null;
  }
}

/** Marca a versão como já vista por este usuário (não volta a aparecer). */
export function markVersionSeen(userId: string, version: string): void {
  try {
    localStorage.setItem(seenKey(userId), version);
  } catch {
    /* storage indisponível — no pior caso o aviso reaparece; sem dano */
  }
}
