// scripts/fixtures/r2-read-models-fixture.js
//
// Fixture local determinística para `scripts/r2-read-models.js validate`
// (Etapa 5). Em vez de um JSON estático copiado à mão (que poderia
// divergir silenciosamente do formato real que
// `business/brokers.js#createBroker`/`business/listings.js#createListing`
// produzem), este arquivo semeia um `IMOB_PRIVATE`/`IMOB_DATA` em memória
// (`FakeR2Bucket` — o mesmo dublê que toda a suíte em `tests/` já usa)
// chamando as funções de negócio REAIS. Isso garante que `validate` sempre
// exercita o pipeline contra um estado privado estruturalmente idêntico ao
// que a produção teria, sem nunca abrir uma conexão de rede nem precisar de
// nenhuma credencial (Etapa 5 "validate não pode exigir credenciais/abrir
// conexão remota").

import { createBroker } from "../../business/brokers.js";
import { createListing } from "../../business/listings.js";
import { publishListing } from "../../business/publishing.js";
import { FakeR2Bucket } from "../../tests/storage/fake-r2-bucket.js";

// Secret/CPF de fixture — nunca usados fora deste ambiente em memória,
// nunca lidos de env/rede (mesma convenção de
// tests/publishing/publishing.test.js).
const FIXTURE_LOGIN_INDEX_SECRET = "r2-read-models-fixture-login-index-secret";
const FIXTURE_CPF = "52998224725"; // CPF sintético, checksum-válido (mesmo algoritmo de tests/support/cpf.js)

/**
 * Constrói um `env` `{ IMOB_PRIVATE, IMOB_DATA }` em memória com um
 * corretor e um anúncio publicado, determinístico entre execuções (mesmos
 * ids/slugs sempre) — o que `scripts/r2-read-models.js validate` roda o
 * pipeline `enumerate -> validate -> plan -> apply` contra.
 */
export async function buildSampleFixtureEnv() {
  const env = { IMOB_PRIVATE: new FakeR2Bucket(), IMOB_DATA: new FakeR2Bucket() };

  const broker = await createBroker(
    env,
    {
      userId: "user_fixture_1",
      slug: "corretor-fixture",
      name: "Corretor de Validação (fixture)",
      plan: "free",
      status: "active",
      creci: "00000-F",
      cpf: FIXTURE_CPF,
    },
    { loginIndexSecret: FIXTURE_LOGIN_INDEX_SECRET },
  );

  const draft = await createListing(env, broker.brokerId, {
    city: "londrina",
    slug: "apartamento-fixture-validacao",
    title: "Apartamento de validação (fixture)",
    purpose: "venda",
    type: "apartamento",
    price: 350000,
    district: "Centro",
    features: { bedrooms: 2, bathrooms: 1, parkingSpaces: 1, area: 60 },
    status: "active",
  });
  await publishListing(env, draft.listingId);

  return env;
}

/**
 * `env` totalmente vazio — nenhuma cidade, nenhum corretor, nenhum
 * anúncio. Usado por `scripts/r2-read-models.js validate` para provar, a
 * cada execução de CI, que uma instalação nova (Etapa 3 "estado vazio
 * obrigatório") ainda produz os 3 catálogos globais válidos (nunca 404),
 * antes de qualquer publicação real acontecer.
 */
export function buildEmptyFixtureEnv() {
  return { IMOB_PRIVATE: new FakeR2Bucket(), IMOB_DATA: new FakeR2Bucket() };
}
