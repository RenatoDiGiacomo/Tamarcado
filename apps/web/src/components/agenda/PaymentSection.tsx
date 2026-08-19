import { useState } from "react";
import { bumpAppointments } from "../../lib/appointmentsSignal";
import type { ApiAppointment, PaymentMethod } from "../../pages/agendaMap";
import { brl } from "../../lib/currency";
import { Button } from "@/components/ui/button";
import { PaymentForm } from "./PaymentForm";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  outro: "Outro",
};

/**
 * Registro de pagamento a partir do agendamento (Story 5.2). Só é renderizado
 * para quem tem o módulo Financeiro (o pai gateia). Envolve o {@link PaymentForm}
 * (a UI de pagamento compartilhada) com o resumo + o toggle Registrar/Editar.
 * Recarrega a agenda no sucesso (`bumpAppointments`) para o detalhe refletir.
 */
export function PaymentSection({ appointment }: { appointment: ApiAppointment }) {
  const payment = appointment.payment ?? null;
  const [open, setOpen] = useState(false);

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
        <PaymentForm
          appointmentId={appointment.id}
          initialPayment={payment}
          fallbackPrice={appointment.price ?? null}
          onCancel={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            bumpAppointments(); // recarrega a agenda → o detalhe reflete o pagamento
          }}
        />
      )}
    </div>
  );
}
