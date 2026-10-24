-- Contagem somente leitura do CPF ainda em claro.
-- Não grava, não cifra e não apaga customers.cpf.
-- cpf_sem_hash: tem CPF e cpf_hash está nulo.
-- cpf_sem_cifra: tem CPF e cpf_enc está nulo.

select
  count(*) filter (
    where cpf is not null and btrim(cpf) <> '' and cpf_hash is null
  )::int as cpf_sem_hash,
  count(*) filter (
    where cpf is not null and btrim(cpf) <> '' and cpf_enc is null
  )::int as cpf_sem_cifra
from customers;
