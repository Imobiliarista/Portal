// Login real — raiz (imobiliarista.net/login/) e subdomínio do corretor
// (nome.imobiliarista.net/login/) usam este MESMO arquivo. Quem decide
// pra onde ir depois de logar é sempre o backend (campo redirect_to,
// GET /api/auth/sessao e POST /api/auth/login) — ver
// src/lib/sessao-destino.ts. O front nunca calcula isso por conta própria,
// pra raiz e subdomínio nunca divergirem.

const elVerificando = document.getElementById("verificando");
const elForm = document.getElementById("form-login");
const elErro = document.getElementById("erro-login");
const elBotao = document.getElementById("btn-login");

function mostrarErro(mensagem) {
  elErro.textContent = mensagem;
  elErro.classList.remove("hidden");
}

function mostrarFormulario() {
  elVerificando.classList.add("hidden");
  elForm.classList.remove("hidden");
}

// Já autenticado? Pula o formulário e vai direto pro painel certo — sem
// isso, quem já tem sessão válida veria o login de novo (item explícito
// do comando: "já autenticado → serve o painel correspondente direto").
async function verificarSessaoExistente() {
  try {
    const res = await fetch("/api/auth/sessao");
    if (res.ok) {
      const dados = await res.json();
      if (dados.autenticado && dados.redirect_to) {
        window.location.href = dados.redirect_to;
        return;
      }
    }
  } catch (erro) {
    console.error("Erro ao verificar sessão:", erro);
  }
  mostrarFormulario();
}

async function enviarLogin(e) {
  e.preventDefault();
  elErro.classList.add("hidden");
  elBotao.disabled = true;
  elBotao.textContent = "Entrando...";

  try {
    const usuario = document.getElementById("login-usuario").value.trim();
    const senha = document.getElementById("login-senha").value;

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, senha }),
    });

    const dados = await res.json();

    if (!res.ok) {
      mostrarErro(dados.erro || "Não foi possível fazer login.");
      elBotao.disabled = false;
      elBotao.textContent = "Entrar";
      return;
    }

    window.location.href = dados.redirect_to || "/";
  } catch (erro) {
    console.error("Erro ao fazer login:", erro);
    mostrarErro("Erro ao conectar com o servidor. Tente novamente.");
    elBotao.disabled = false;
    elBotao.textContent = "Entrar";
  }
}

elForm.addEventListener("submit", enviarLogin);
verificarSessaoExistente();
