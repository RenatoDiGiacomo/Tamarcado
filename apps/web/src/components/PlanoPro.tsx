import { useState, type ReactNode } from "react";
import { Crown, Lock, MessageCircle, Users } from "lucide-react";
import { useAuth, type CapabilityKey } from "../auth/AuthContext";
import { useInstallation } from "../lib/useInstallation";
import { conteudoDoRecurso, linkWhatsAppUpgrade } from "../lib/plano-pro";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

/**
 * MARCADOR PADRÃO DE RECURSO BLOQUEADO — a coroa (Story 6.15, DL-075).
 *
 * NÃO é um componente da tela de WhatsApp. É o tratamento ÚNICO de "isto existe
 * e a sua empresa não tem", alimentado pela CAPABILITY (DL-072). Financeiro,
 * Dashboard e limite de equipe herdam o comportamento quando virarem pagos —
 * **sem componente novo e sem lista de exceções por tela**; entram como entrada
 * no mapa de `lib/plano-pro.ts`.
 *
 * Se isto nascesse dentro da tela de WhatsApp, o próximo recurso pago ganharia
 * uma cópia levemente diferente — foi o que já aconteceu com o `.social` no CSS
 * do projeto.
 *
 * ┌─ a jornada ────────────────────────────────────────────────────────────┐
 * │ recurso bloqueado → <CoroaPro> → clique → <ModalPro> → WhatsApp comercial │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Para o recurso que a empresa TEM, nada disto é renderizado: nem coroa, nem
 * espaço reservado, nem tooltip (AC final da 6.15). Quem garante isso é o
 * chamador, que só monta a coroa quando `hasCapability` é falso — e o
 * `<BloqueioPro>` de tela cheia só aparece no 403 do backend.
 */

/** Ícone do recurso na tela de bloqueio, por capability. */
const ICONE: Record<CapabilityKey, typeof MessageCircle> = {
  whatsapp_bot: MessageCircle,
  lembrete_automatico: MessageCircle,
};

/**
 * Botão do WhatsApp comercial. Abre em NOVA ABA — o dono está no meio de um
 * atendimento; tirá-lo do painel para negociar seria perder as duas coisas.
 */
function BotaoFalarComigo({ className }: { className?: string }) {
  const installation = useInstallation();
  return (
    <Button asChild className={className}>
      <a
        href={linkWhatsAppUpgrade(installation?.name ?? null)}
        target="_blank"
        rel="noopener noreferrer"
      >
        <MessageCircle className="mr-2 size-4" aria-hidden="true" />
        Quero saber mais
      </a>
    </Button>
  );
}

/**
 * O conteúdo comercial, reaproveitado pelo modal e pela tela cheia de bloqueio.
 * Sem PREÇO, de propósito (DL-075): a landing page vende plano único hoje, e
 * Básico/Pró ainda não têm escopo nem valor definidos. Número aqui prenderia a
 * decisão de preço antes do primeiro cliente pagante e criaria contradição com
 * a landing e com os Termos.
 */
function ConteudoPro({ capability }: { capability?: CapabilityKey | string }) {
  // Só o corpo: o TÍTULO é responsabilidade de quem chama (o `DialogTitle` no
  // modal, o `<p>` na tela cheia). Repeti-lo aqui duplicaria o texto para leitor
  // de tela e para quem enxerga.
  const { resumo, beneficios } = conteudoDoRecurso(capability);
  return (
    <div className="flex flex-col gap-3 text-left">
      <p className="text-sm text-muted-foreground">{resumo}</p>
      {beneficios.length > 0 && (
        <ul className="flex flex-col gap-2">
          {beneficios.map((beneficio) => (
            <li key={beneficio} className="flex gap-2 text-sm text-foreground">
              <Crown
                className="mt-0.5 size-4 shrink-0 text-amber-500"
                aria-hidden="true"
              />
              <span>{beneficio}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * O MODAL — explica o que o Pró desbloqueia e leva ao WhatsApp comercial.
 * Controlado pelo chamador para poder abrir tanto da coroa quanto da tela cheia.
 */
export function ModalPro({
  capability,
  open,
  onOpenChange,
}: {
  capability?: CapabilityKey | string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { titulo } = conteudoDoRecurso(capability);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="size-5 text-amber-500" aria-hidden="true" />
            {titulo}
          </DialogTitle>
          <DialogDescription>Disponível no plano Pró</DialogDescription>
        </DialogHeader>
        <ConteudoPro capability={capability} />
        <BotaoFalarComigo className="mt-2 w-full" />
      </DialogContent>
    </Dialog>
  );
}

/**
 * A COROA — marcador de recurso bloqueado. Use ao lado do nome do recurso em
 * qualquer lugar: item de menu, item de lista, botão, interruptor.
 *
 * É um `<button>` de verdade (não um ícone decorativo) porque clicar nele é a
 * ação principal da jornada de venda — e porque leitor de tela precisa anunciá-lo.
 */
export function CoroaPro({
  capability,
  label = "Disponível no plano Pró",
}: {
  capability: CapabilityKey | string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // O marcador costuma viver DENTRO de um link de menu; sem isto, o
          // clique navegaria para a rota bloqueada em vez de abrir o modal.
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={label}
        title={label}
        className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20"
      >
        <Crown className="size-3" aria-hidden="true" />
        <span className="text-[10px] font-semibold uppercase tracking-wide">
          Pró
        </span>
      </button>
      <ModalPro capability={capability} open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * TELA DE BLOQUEIO POR CAPABILITY — o CAMINHO CRU.
 *
 * A coroa cobre o caminho desenhado (o usuário vê o marcador e clica). Este
 * componente cobre o outro, que é o que acontece com usuários de verdade: link
 * antigo, favorito, endereço digitado, alguém mandou o link. Aí **não existe
 * coroa** — existe um 403.
 *
 * Antes desta story esse caminho mostrava *"Tivemos um problema no servidor.
 * Tente de novo em instantes"* com um botão **Tentar de novo** que nunca ia
 * funcionar: bloqueio comercial com cara de defeito. Por isso aqui **não há
 * botão de repetir** — não há o que tentar; há o que contratar.
 */
export function BloqueioPro({
  capability,
}: {
  /**
   * A capability barrada, quando conhecida — ela escolhe o texto de venda. Vem
   * do próprio 403 do backend na maioria dos casos. Sem ela o texto cai no
   * genérico do Pró, que ainda é correto: o que não pode voltar a acontecer é
   * bloqueio comercial descrito como falha do servidor.
   */
  capability?: CapabilityKey | string;
}) {
  const [open, setOpen] = useState(false);
  const { titulo } = conteudoDoRecurso(capability);
  const Icone = ICONE[capability as CapabilityKey] ?? Crown;
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-6 py-10 text-center dark:border-amber-500/40 dark:bg-amber-500/5"
    >
      <span className="relative">
        <Icone className="size-8 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <Crown
          className="absolute -right-2 -top-2 size-4 text-amber-500"
          aria-hidden="true"
        />
      </span>
      <p className="text-base font-semibold text-foreground">{titulo}</p>
      <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
        Disponível no plano Pró
      </p>
      <div className="max-w-sm">
        <ConteudoPro capability={capability} />
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <BotaoFalarComigo />
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Ver o que muda
        </Button>
      </div>
      <ModalPro capability={capability} open={open} onOpenChange={setOpen} />
    </div>
  );
}

/**
 * TELA DE BLOQUEIO POR PERMISSÃO — deliberadamente DIFERENTE do bloqueio por
 * plano, e esta diferença é o coração da Story 6.15.
 *
 * Quem barra aqui é o DONO DO ESTABELECIMENTO (visibilidade de módulo, DL-062) ou
 * a matriz de papéis (FR-I2) — não a Tamarcado. A profissional não tem como
 * comprar o que o dono já pagou, então **nenhuma oferta de plano aparece**:
 * mostrar a coroa aqui faria ela cobrar o dono por uma compra que não existe.
 *
 * Também sem "Tentar de novo": repetir não muda permissão.
 */
export function BloqueioPermissao({ recurso }: { recurso?: string }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center"
    >
      <span className="relative">
        <Lock className="size-8 text-muted-foreground" aria-hidden="true" />
      </span>
      <p className="text-base font-semibold text-foreground">
        Você não tem acesso a {recurso ?? "esta área"}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        O acesso é liberado pelo dono do estabelecimento. Fale com ele para pedir
        a liberação.
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="size-3.5" aria-hidden="true" />
        Quem libera é o dono, dentro de Equipe.
      </p>
    </div>
  );
}

/** Envolve um item de menu/lista, acrescentando a coroa quando bloqueado. */
export function ComCoroa({
  bloqueado,
  capability,
  children,
}: {
  bloqueado: boolean;
  capability: CapabilityKey | string;
  children: ReactNode;
}) {
  // Recurso liberado: NENHUM vestígio do marcador — nem espaço reservado, nem
  // tooltip, nem wrapper extra (AC final da 6.15).
  if (!bloqueado) return <>{children}</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      <CoroaPro capability={capability} />
    </span>
  );
}

/**
 * Atalho para telas: a empresa tem a capability? Lê do AuthContext, que já faz
 * o polling de ~20s (DL-062/DL-072) — cortar um cliente reflete sem relogar.
 * Continua sendo UX: a segurança é o 403 do backend.
 */
export function useTemCapability(capability: CapabilityKey): boolean {
  const { user } = useAuth();
  return user?.companyCapabilities?.includes(capability) ?? false;
}
