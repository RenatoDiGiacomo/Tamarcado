import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "done"
  | "cancelled"
  | "noshow";

const statusChipVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      status: {
        pending: "bg-status-pending/15 text-status-pending",
        confirmed: "bg-status-confirmed/15 text-status-confirmed",
        done: "bg-status-done/15 text-status-done",
        cancelled: "bg-status-cancelled/15 text-status-cancelled",
        noshow: "bg-status-noshow/15 text-status-noshow",
      },
    },
    defaultVariants: { status: "confirmed" },
  },
);

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  done: "Concluído",
  cancelled: "Cancelado",
  noshow: "Não compareceu",
};

// Classes literais (Tailwind não faz JIT de strings interpoladas).
const STATUS_DOT: Record<AppointmentStatus, string> = {
  pending: "bg-status-pending",
  confirmed: "bg-status-confirmed",
  done: "bg-status-done",
  cancelled: "bg-status-cancelled",
  noshow: "bg-status-noshow",
};

/** Chip de status do design system (Sally §2.2): cor + rótulo, nunca só cor. */
export function StatusChip({
  status,
  className,
}: {
  status: AppointmentStatus;
  className?: string;
}) {
  return (
    <span className={cn(statusChipVariants({ status }), className)}>
      <span
        className={cn("size-2 rounded-full", STATUS_DOT[status])}
        aria-hidden="true"
      />
      {STATUS_LABEL[status]}
    </span>
  );
}
