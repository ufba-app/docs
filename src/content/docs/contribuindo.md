---
title: Como contribuir
description: Como abrir um PR no ecossistema ufba.app.
---

Todos os repositórios do ecossistema ufba.app são públicos. Qualquer
pessoa pode ler o código, dar fork e propor uma mudança — não é preciso
fazer parte do time pra contribuir.

## Fluxo de contribuição

1. Dê fork no repositório que você quer mudar (ex:
   [`ufba-app/docs`](https://github.com/ufba-app/docs)).
2. Crie uma branch a partir da `main` com um nome descritivo (ex:
   `fix/link-quebrado-moodle`).
3. Faça a mudança e commit (ver convenção abaixo).
4. Abra um Pull Request contra a `main` do repositório original.

**Push direto na `main` é restrito ao time do ecossistema.** Toda mudança,
inclusive do time, passa por PR.

## Convenção de commit

Mensagens de commit seguem o formato `tipo(escopo): descrição breve`,
onde `tipo` é um dos:

- `feat` — nova funcionalidade
- `fix` — correção de bug
- `docs` — mudança em documentação
- `chore` — manutenção (dependências, config, sem mudança de comportamento)
- `refactor` — mudança de código sem alterar comportamento observável

Exemplo: `fix(historico): corrige parsing de componente com 8 caracteres`.

## Onde cada coisa mora

Antes de abrir um PR, confira em qual repositório sua mudança se encaixa —
ver a tabela completa em [Visão geral](/visao-geral/). Resumindo:

- Encontrou um erro ou lacuna nesta documentação? → `docs` (este repo).
- Quer mudar uma tela ou comportamento do app Android? → `mobile`.
- Quer mudar um endpoint da API principal? → `api`.
- Quer mudar como uma integração (Moodle/Classroom) funciona? →
  `api-integrations`.

Se não tiver certeza de qual repo é o certo, abra uma issue descrevendo o
que você quer mudar — alguém do time redireciona.
