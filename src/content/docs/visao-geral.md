---
title: O que é o ufba.app
description: Visão geral do ecossistema ufba.app.
---

## Por que existe

O `ufba.app` nasceu de uma ideia simples: os sistemas oficiais da UFBA
(SIGAA, Moodle/AVA, Google Classroom) resolvem o que precisam resolver,
mas a experiência de usar todos eles no dia a dia de um estudante é
fragmentada — cada um com sua sessão, seu fluxo de login, sua interface.
O ufba.app conecta a esses sistemas (via scraping autenticado quando não
há API oficial, via API REST oficial quando há) e apresenta os dados de
forma unificada, num app mobile e, futuramente, num web app.

Não é um substituto dos sistemas oficiais — é uma camada de acesso melhor
sobre dados que já existem.

## Arquitetura do ecossistema

O ecossistema é dividido em 8 repositórios, cada um com uma
responsabilidade clara:

| Repo | Papel |
|---|---|
| [`docs`](https://github.com/ufba-app/docs) | Este site. |
| `design-system` | Tokens de design (cor, tipografia, espaçamento) e guia visual. |
| `contracts` | Schemas e tipos compartilhados entre APIs e clientes. |
| `api` | API principal do ecossistema. |
| `api-notifications` | Serviço de cron para push notifications. |
| `api-integrations` | Serviço de integração com Moodle e Google Classroom. |
| `mobile` | App mobile (Android; iOS por web, ver histórico do projeto). |
| `web` | Web app com stack própria (Next.js), independente do mobile. |

`api`, `api-notifications` e `api-integrations` rodam como containers
separados dentro do mesmo projeto Railway, compartilhando banco quando faz
sentido (dados de aluno tocados por mais de um serviço). `mobile` e `web`
consomem `contracts` e `design-system`; não compartilham componentes de UI
entre si (bibliotecas de componentes diferentes: HeroUI Native no mobile,
HeroUI React no web).

Veja a decisão completa e o raciocínio por trás dela na seção
[Contribuindo](/contribuindo/), que linka a spec de arquitetura no repo
`docs`.

## Onde ir a partir daqui

- **[Integrações](/integracoes/)** — como cada conexão com SIGAA, Moodle e
  Google Classroom foi descoberta e implementada, tecnicamente.
- **[Modelo de dados](/modelo-de-dados/)** — como as entidades desses
  sistemas se relacionam dentro do ecossistema.
- **[Contribuindo](/contribuindo/)** — como propor uma mudança, mesmo sem
  fazer parte do time.
