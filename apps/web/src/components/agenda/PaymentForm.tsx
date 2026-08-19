import { useState } from "react";
import { toast } from "sonner";
import { authedRequest } from "../../lib/session";
import type { PaymentMethod } from "../../pages/agendaMap";
import { brl, maskBRL, brlToNumber } from "../../lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "debito", label: "Cartão de débito" },
  { value: "credito", label: "Cartão de crédito" },
  { value: "outro", label: "Outro" },
];

const selectCls =
  "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

export interface PaymentFormInitial {
  amount: number;
  method: PaymentMethod | null;
  status: "pago" | "pendente";
}

/**
 * Formulário de registro de pagamento (Story 5.2) — a FONTE ÚNICA da UI de
 * pagamento. É reusado nos dois caminhos (DL-065): no detalhe do agendamento
 * (via {@link PaymentSection}, para quem recebe na saída da cliente) e na lista
 * do Financeiro (dialog, para quem fecha o caixa). Valor pré-preenchido, forma
 * OPCIONAL, situação pago/pendente. Upsert via `PUT /appointments/:id/payment`;
 * o `onSaved` do pai decide o efeito colateral (recarregar agenda vs. lista).
 */
export function PaymentForm({
  appointmentId,
  initialPayment,
  fallbackPrice = null,
  onSaved,
  onCancel,
}: {
  appointmentId: string;
  initialPayment: PaymentFormInitial | null;
  /** Preço do serviço, para pré-preencher quando ainda não há pagamento. */
  fallbackPrice?: number | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  // Pré-preenche: pagamento existente > preço do serviço > vazio (sob consulta).
  // Sempre editável (desconto/acréscimo). Já mascarado.
  const [amount, setAmount] = useState(
    initialPayment
      ? brl(initialPayment.amount)
      : fallbackPrice != null
        ? brl(fallbackPrice)
        : "",
  );
  const [method, setMethod] = useState<string>(initialPayment?.method ?? "");
  const [status, setStatus] = useState<"pago" | "pendente">(
    initialPayment?.status ?? "pago",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    const value = brlToNumber(amount);
    if (value <= 0) {
      setError("Informe o valor recebido.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await authedRequest(`/appointments/${appointmentId}/payment`, {
        method: "PUT",
        body: { amount: value, method: method || undefined, status },
      });
      if (!res.ok) {
        setError("Não foi possível salvar o pagamento.");
        return;
      }
      toast.success("Pagamento registrado.");
      onSaved();
    } catch {
      setError("Não foi possível salvar. Verifique sua conexão.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Valor recebido</span>
        <Input
          type="text"
          inputMode="numeric"
          placeholder="R$ 0,00"
          aria-label="Valor recebido"
          value={amount}
          onChange={(e) => setAmount(maskBRL(e.target.value))}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Situação</span>
        <select
          aria-label="Situação do pagamento"
          className={selectCls}
          value={status}
          onChange={(e) => setStatus(e.target.value as "pago" | "pendente")}
        >
          <option value="pago">Pago</option>
          <option value="pendente">Pendente</option>
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">
          Forma de pagamento (opcional)
        </span>
        <select
          aria-label="Forma de pagamento"
          className={selectCls}
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          <option value="">Não informar</option>
          {METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancelar
        </Button>
        <Button type="button" onClick={() => void save()} disabled={submitting}>
          {submitting ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
