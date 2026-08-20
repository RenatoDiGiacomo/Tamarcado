import { useEffect, useState } from "react";
import { authedRequest } from "../../lib/session";
import { brl, maskBRL, brlToNumber } from "../../lib/currency";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MemberLite {
  id: string;
  name: string;
  forecast: { total: number };
}

const controlCls =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Registrar SAÍDA — pagamento à equipe (Story 5.10). Owner-only (o pai gateia).
 * Puxa a PREVISÃO do período (`GET /team`) para pré-preencher o valor do
 * profissional escolhido (o "real" fecha o previsão→real). `POST /team/payments`.
 */
export function RegistrarSaidaDialog({
  from,
  to,
  onClose,
  onSaved,
}: {
  from: string;
  to: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [professionalId, setProfessionalId] = useState("");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today());
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await authedRequest(`/team?from=${from}&to=${to}`);
      if (res.ok) setMembers(((await res.json()) as { members: MemberLite[] }).members);
    })();
  }, [from, to]);

  function pick(id: string): void {
    setProfessionalId(id);
    const m = members.find((x) => x.id === id);
    // Pré-preenche com a PREVISÃO do período (editável — pode pagar outro valor).
    if (m) setAmount(m.forecast.total > 0 ? brl(m.forecast.total) : "");
  }

  async function submit(): Promise<void> {
    const value = brlToNumber(amount);
    if (!professionalId) {
      setError("Escolha o profissional.");
      return;
    }
    if (value <= 0) {
      setError("Informe o valor pago.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await authedRequest("/team/payments", {
        method: "POST",
        body: {
          professionalId,
          amount: value,
          paidOn,
          periodFrom: from,
          periodTo: to,
          note: note.trim() || undefined,
        },
      });
      if (!res.ok) {
        setError("Não foi possível registrar o pagamento.");
        return;
      }
      onSaved();
    } catch {
      setError("Não foi possível salvar. Verifique sua conexão.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pagar à equipe (saída)</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Referente a {from.split("-").reverse().join("/")} a{" "}
          {to.split("-").reverse().join("/")}.
        </p>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Profissional</span>
            <select aria-label="Profissional" className={controlCls} value={professionalId} onChange={(e) => pick(e.target.value)}>
              <option value="">Selecione…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — previsão {brl(m.forecast.total)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Valor pago</span>
            <Input aria-label="Valor pago" inputMode="numeric" placeholder="R$ 0,00" value={amount} onChange={(e) => setAmount(maskBRL(e.target.value))} />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Pago em</span>
            <input type="date" aria-label="Pago em" className={cn(controlCls, "max-w-40")} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Observação (opcional)</span>
            <Input aria-label="Observação" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: comissão de setembro" />
          </label>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancelar</Button>
            <Button onClick={() => void submit()} disabled={submitting}>{submitting ? "Salvando…" : "Registrar saída"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
