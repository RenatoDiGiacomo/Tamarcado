import { useState } from "react";
import { toast } from "sonner";
import { authedRequest } from "../../lib/session";
import { bumpAppointments } from "../../lib/appointmentsSignal";
import type { ApiAppointment, PaymentMethod } from "../../pages/agendaMap";
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
const METHOD_LABEL: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  outro: "Outro",
};

const selectCls =
  "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

/**
 * Registro de pagamento a partir do agendamento (Story 5.2). Só é renderizado
 * para quem tem o módulo Financeiro (o pai gateia). Valor obrigatório, forma
 * OPCIONAL, situação pago/pendente. Upsert via `PUT /appointments/:id/payment`;
 * recarrega a agenda no sucesso (`bumpAppointments`) para o detalhe refletir.
 */
export function PaymentSection({ appointment }: { appointment: ApiAppointment }) {
  const payment = appointment.payment ?? null;
  const [open, setOpen] = useState(false);
  // Pré-preenche (Story 5.2): pagamento existente > preço do serviço > vazio
  // (serviço sob consulta). Sempre editável (desconto/acréscimo). Já mascarado.
  const [amount, setAmount] = useState(
    payment
      ? brl(payment.amount)
      : appointment.price != null
        ? brl(appointment.price)
        : "",
  );
  const [method, setMethod] = useState<string>(payment?.method ?? "");
  const [status, setStatus] = useState<"pago" | "pendente">(
    payment?.status ?? "pago",
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
      const res = await authedRequest(`/appointments/${appointment.id}/payment`, {
        method: "PUT",
        body: { amount: value, method: method || undefined, status },
      });
      if (!res.ok) {
        setError("Não foi possível salvar o pagamento.");
        return;
      }
      setOpen(false);
      bumpAppointments(); // recarrega a agenda → o detalhe reflete o pagamento
      toast.success("Pagamento registrado.");
    } catch {
      setError("Não foi possível salvar. Verifique sua conexão.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">Pagamento</span>
        {!open && (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            {payment ? "Editar" : "Registrar"}
          </Button>
        )}
      </div>

      {!open ? (
        <p className="text-sm text-muted-foreground">
          {payment
            ? `${payment.status === "pago" ? "Pago" : "Pendente"} · ${brl(
                payment.amount,
              )}${payment.method ? ` · ${METHOD_LABEL[payment.method]}` : ""}`
            : "Sem pagamento registrado."}
        </p>
      ) : (
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
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={() => void save()} disabled={submitting}>
              {submitting ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
