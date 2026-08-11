-- 0011_modulo_pwa.sql — registra o módulo PWA na tabela modulos_ativos
-- Lote 15, seção 4.18 do project.md
--
-- NOTA: o Lote 10 já entregava manifest.json/sw.js estáticos, sem flag de
-- rede nenhuma (PWA universal, sem controle). O Lote 15 introduz o controle
-- duplo (rede + plano do corretor) descrito em 4.18, então o módulo passa a
-- existir aqui pela primeira vez. Ligado por padrão (ativo = 1), diferente
-- dos demais módulos opcionais (padrão desligado) — preserva o comportamento
-- já em produção desde o Lote 10 para o Portal Principal, que não deve
-- "sumir" de uma hora para outra só porque passou a existir uma flag.

INSERT INTO modulos_ativos (nome, slug, descricao, ativo) VALUES
  ('PWA (App Instalável)', 'pwa', 'Permite instalar o Portal/minisite como app (manifest + Service Worker). Nos minisites, também depende de permite_pwa no plano do corretor.', 1);
