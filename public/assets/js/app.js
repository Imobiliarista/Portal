document.addEventListener('DOMContentLoaded', () => {
  console.log('Portal Imobiliarista — Carregado');

  const botaoPrecadastro = document.querySelector('.btn-primario');
  if (botaoPrecadastro) {
    botaoPrecadastro.addEventListener('click', () => {
      alert('Pré-cadastro de corretores — em breve!');
    });
  }
});
