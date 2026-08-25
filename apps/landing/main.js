/* ═══════════════════════════════════════════════════════════════════════════
   Landing page do Tamarcado — JavaScript mínimo, sem dependências.
   Tudo aqui é progressivo: com o JS bloqueado a página continua legível,
   navegável e com todos os links funcionando.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ── Menu do celular ─────────────────────────────────────────────────────
     O estado fica no aria-expanded do botão (é ele que o leitor de tela
     anuncia); a classe no <nav> só reflete isso visualmente. */
  var botao = document.getElementById("menu-btn");
  var menu = document.getElementById("menu");

  if (botao && menu) {
    var abrir = function (deveAbrir) {
      botao.setAttribute("aria-expanded", String(deveAbrir));
      botao.setAttribute(
        "aria-label",
        deveAbrir ? "Fechar o menu de navegação" : "Abrir o menu de navegação",
      );
      menu.classList.toggle("esta-aberto", deveAbrir);
    };

    botao.addEventListener("click", function () {
      abrir(botao.getAttribute("aria-expanded") !== "true");
    });

    // Clicar num item leva para a seção e fecha o menu.
    menu.addEventListener("click", function (evento) {
      if (evento.target.closest("a")) abrir(false);
    });

    // Esc fecha e devolve o foco ao botão — senão o teclado fica preso.
    document.addEventListener("keydown", function (evento) {
      if (evento.key === "Escape" && botao.getAttribute("aria-expanded") === "true") {
        abrir(false);
        botao.focus();
      }
    });
  }

  /* ── Capturas de tela ainda não adicionadas ──────────────────────────────
     Enquanto os PNGs reais não estão em assets/screens/, a imagem quebrada
     viraria um ícone feio no meio do layout. Aqui a figura é marcada e o CSS
     mostra uma moldura com o nome do arquivo que falta. Quando o arquivo for
     adicionado, nada disso dispara — não é preciso mexer no código. */
  var capturas = document.querySelectorAll(".shot__img");
  Array.prototype.forEach.call(capturas, function (img) {
    var marcarFalta = function () {
      var figura = img.closest(".shot");
      if (!figura) return;
      figura.classList.add("shot--sem-arquivo");
      var legenda = figura.querySelector(".shot__falta");
      if (legenda) legenda.hidden = false;
    };
    // A imagem pode ter falhado ANTES deste script rodar (o <script> é defer).
    if (img.complete && img.naturalWidth === 0) marcarFalta();
    img.addEventListener("error", marcarFalta);
  });

  /* ── Ano do rodapé ─────────────────────────────────────────────────────── */
  var ano = document.getElementById("ano");
  if (ano) ano.textContent = String(new Date().getFullYear());
})();
