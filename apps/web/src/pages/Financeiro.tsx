import { PageLayout } from "@/components/PageLayout";

/**
 * Financeiro (Story 5.2) — menu próprio, só para quem tem o módulo (DL-062). O
 * REGISTRO do pagamento acontece a partir do próprio agendamento (na Agenda). A
 * lista de recebimentos por período (com totais) chega na Story 5.3; por isso
 * esta tela é, por ora, um ponto de entrada explicando onde registrar.
 */
export function Financeiro() {
  return (
    <PageLayout title="Financeiro">
      <div className="max-w-xl rounded-lg border border-border bg-card p-6">
        <p className="mb-2 text-sm font-medium text-foreground">
          Registre os pagamentos direto no agendamento.
        </p>
        <p className="text-sm text-muted-foreground">
          Abra um agendamento na Agenda e informe o <strong>valor</strong>, a{" "}
          <strong>forma de pagamento</strong> (opcional) e a{" "}
          <strong>situação</strong> (pago ou pendente). A lista de recebimentos
          por período, com totais, chega em breve.
        </p>
      </div>
    </PageLayout>
  );
}
