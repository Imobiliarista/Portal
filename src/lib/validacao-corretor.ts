// Validação de dados de corretor compartilhada entre os pontos de entrada
// que criam/editam uma conta: pré-cadastro público (routes/api-auth-cadastro.ts)
// e criação/edição direta pelo Superadmin (routes/painel-superadmin.ts).
// Extraído do pré-cadastro público pra não duplicar as mesmas 9 checagens
// em cada formulário novo.

import { validarCPF, normalizarCPF } from "./cpf";

export interface DadosCorretorFormulario {
  nome: string;
  email: string;
  telefone: string;
  creci: string;
  cpf: string;
  nome_usuario: string;
  sexo: string;
  data_nascimento: string;
  nacionalidade: string;
  endereco_residencial: string;
}

// Valida os campos base do cadastro. Com exigirTodos=true (padrão — uso
// no pré-cadastro público e na criação pelo Superadmin), todo campo é
// obrigatório. Com exigirTodos=false (edição parcial pelo Superadmin), só
// valida os campos que vieram preenchidos no corpo da requisição — os
// ausentes (undefined) são ignorados.
export function validarCamposCorretor(
  dados: Partial<DadosCorretorFormulario>,
  opcoes: { exigirTodos: boolean } = { exigirTodos: true }
): string | null {
  const { exigirTodos } = opcoes;

  if (exigirTodos || dados.nome !== undefined) {
    if (!dados.nome?.trim()) return "Nome é obrigatório";
  }
  if (exigirTodos || dados.email !== undefined) {
    if (!dados.email?.includes("@")) return "E-mail inválido";
  }
  if (exigirTodos || dados.telefone !== undefined) {
    if (!dados.telefone?.trim()) return "Telefone é obrigatório";
  }
  if (exigirTodos || dados.creci !== undefined) {
    if (!dados.creci?.trim()) return "CRECI é obrigatório";
  }
  if (exigirTodos || dados.nome_usuario !== undefined) {
    if (!dados.nome_usuario?.trim() || dados.nome_usuario.trim().length < 3) {
      return "Nome de usuário deve ter no mínimo 3 caracteres";
    }
  }
  if (exigirTodos || dados.sexo !== undefined) {
    if (!dados.sexo?.trim()) return "Sexo é obrigatório";
  }
  if (exigirTodos || dados.data_nascimento !== undefined) {
    if (!dados.data_nascimento?.trim() || isNaN(Date.parse(dados.data_nascimento))) {
      return "Data de nascimento inválida";
    }
  }
  if (exigirTodos || dados.nacionalidade !== undefined) {
    if (!dados.nacionalidade?.trim()) return "Nacionalidade é obrigatória";
  }
  if (exigirTodos || dados.endereco_residencial !== undefined) {
    if (!dados.endereco_residencial?.trim()) return "Endereço residencial é obrigatório";
  }
  if (exigirTodos || dados.cpf !== undefined) {
    if (!validarCPF(normalizarCPF(dados.cpf || ""))) return "CPF inválido";
  }

  return null;
}

// Checa unicidade de email/cpf/nome_usuario/creci (mesmas 4 colunas UNIQUE
// de `corretores`) — mesma ordem/mensagens do pré-cadastro público.
// excluirCorretorId permite reaproveitar a mesma checagem na edição (o
// próprio registro não deve colidir consigo mesmo).
export async function verificarUnicidadeCorretor(
  db: D1Database,
  dados: { email?: string; cpf?: string; nome_usuario?: string; creci?: string },
  excluirCorretorId?: number
): Promise<string | null> {
  const clausula = excluirCorretorId ? "AND id != ?" : "";

  if (dados.email) {
    const binds = excluirCorretorId ? [dados.email.toLowerCase(), excluirCorretorId] : [dados.email.toLowerCase()];
    const existe = await db.prepare(`SELECT id FROM corretores WHERE email = ? ${clausula}`).bind(...binds).first();
    if (existe) return "E-mail já cadastrado";
  }

  if (dados.cpf) {
    const cpfNormalizado = normalizarCPF(dados.cpf);
    const binds = excluirCorretorId ? [cpfNormalizado, excluirCorretorId] : [cpfNormalizado];
    const existe = await db.prepare(`SELECT id FROM corretores WHERE cpf = ? ${clausula}`).bind(...binds).first();
    if (existe) return "CPF já cadastrado";
  }

  if (dados.nome_usuario) {
    const binds = excluirCorretorId ? [dados.nome_usuario.trim(), excluirCorretorId] : [dados.nome_usuario.trim()];
    const existe = await db.prepare(`SELECT id FROM corretores WHERE nome_usuario = ? ${clausula}`).bind(...binds).first();
    if (existe) return "Nome de usuário já cadastrado";
  }

  if (dados.creci) {
    const binds = excluirCorretorId ? [dados.creci.trim(), excluirCorretorId] : [dados.creci.trim()];
    const existe = await db.prepare(`SELECT id FROM corretores WHERE creci = ? ${clausula}`).bind(...binds).first();
    if (existe) return "CRECI já cadastrado";
  }

  return null;
}
