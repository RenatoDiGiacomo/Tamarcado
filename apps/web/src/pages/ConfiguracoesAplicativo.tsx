import { CheckCircle2, Download, Share, Smartphone } from "lucide-react";
import {
  isChromium,
  isIOS,
  isSafari,
  usePwaInstall,
} from "../lib/usePwaInstall";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * "Aplicativo" — instalar o Tamarcado no computador (ou no celular).
 *
 * Existe porque a instalação no COMPUTADOR estava escondida: o botão da tela de
 * login só aparecia no mobile, mas Chrome e Edge instalam PWA no desktop
 * normalmente, com ícone na área de trabalho e janela própria. O salão com
 * computador na recepção quer justamente isso — abrir pelo ícone, sem digitar
 * endereço.
 */
export function ConfiguracoesAplicativo() {
  const { podeInstalar, instalado, instalar } = usePwaInstall();

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">Aplicativo</CardTitle>
        <CardDescription>
          Instale o Tamarcado no computador ou no celular para abrir direto pelo
          ícone, em janela própria, sem precisar digitar o endereço.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {instalado ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2
              className="size-5 shrink-0 text-status-confirmed"
              aria-hidden="true"
            />
            O Tamarcado já está instalado neste aparelho — você está usando o
            aplicativo agora.
          </p>
        ) : podeInstalar ? (
          <>
            <Button type="button" className="gap-2 self-start" onClick={instalar}>
              <Download className="size-4" aria-hidden="true" />
              Instalar o Tamarcado no computador
            </Button>
            <p className="text-sm text-muted-foreground">
              O navegador vai pedir a sua confirmação. Depois disso, o ícone
              aparece na área de trabalho e no menu iniciar.
            </p>
          </>
        ) : (
          <InstrucaoManual />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Sem o evento de instalação, a saída é ensinar o caminho — e o caminho depende
 * do navegador. Um botão que não faz nada seria pior que instrução nenhuma.
 */
function InstrucaoManual() {
  if (isIOS() && isSafari()) {
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Smartphone className="size-4 shrink-0" aria-hidden="true" />
        <span>Para instalar no iPhone ou iPad: toque em</span>
        <Share className="inline size-4 shrink-0" aria-label="Compartilhar" />
        <span>e depois em “Adicionar à Tela de Início”.</span>
      </p>
    );
  }

  if (isChromium()) {
    // Chrome/Edge que ainda não ofereceram o evento (acabou de abrir, ou já
    // recusou antes). O caminho pelo próprio navegador continua valendo.
    return (
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>
          Para instalar agora, clique no ícone de instalar que fica na barra de
          endereço, à direita — ou abra o menu do navegador (⋮) e escolha
          <strong className="font-medium text-foreground"> Instalar Tamarcado</strong>.
        </p>
        <p>
          Se a opção não aparecer, recarregue a página: o navegador leva alguns
          segundos para liberar a instalação.
        </p>
      </div>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Este navegador não instala aplicativos. Abra o Tamarcado no{" "}
      <strong className="font-medium text-foreground">Google Chrome</strong> ou no{" "}
      <strong className="font-medium text-foreground">Microsoft Edge</strong> para
      instalar no computador. No iPhone, use o Safari.
    </p>
  );
}
