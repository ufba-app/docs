---
title: Entidades e relações
description: Como as entidades de SIGAA, Moodle, Classroom e do próprio app se relacionam.
---

Este documento é conceitual — descreve **o que** cada entidade representa
e **como** se relaciona com as outras, não como a conexão técnica foi
implementada (isso está em [Integrações](/integracoes/)).

## As três origens de dado

### Entidades do SIGAA

O SIGAA é a fonte de verdade acadêmica formal: matrícula, histórico,
estrutura curricular.

- **Aluno** — identificado pela matrícula. Tem um **Histórico**, composto
  por **Componentes do histórico** (uma linha por disciplina cursada, com
  nota e situação) e **Pendências** (o que falta cursar).
- **Curso** — o curso de graduação (ex: Ciência da Computação), dono de
  uma **Estrutura Curricular** (o currículo vigente), que por sua vez lista
  **Componentes Curriculares** (as disciplinas previstas, com
  pré-requisitos).
- **Turma** — uma oferta específica de um componente curricular num
  semestre, com um **Docente** responsável. Um Aluno se conecta a uma
  Turma por uma **Matrícula** (o vínculo "este aluno cursa esta turma
  neste semestre").
- **Docente** — identificado pelo SIAPE. Tem dados públicos (perfil,
  disciplinas que leciona, produção acadêmica) buscáveis sem sessão
  autenticada — ver [SIGAA — Página de professores](/integracoes/sigaa-professores/).
- **Turma Virtual** — a "lousa" de uma Turma dentro do SIGAA (notícias,
  tópicos de aula) — ver [SIGAA — Turma Virtual](/integracoes/sigaa-turma-virtual/).

### Entidades do Moodle

O Moodle (`ava.ufba.br`) é usado por parte das disciplinas como ambiente
virtual de aprendizagem, independente do SIGAA.

- **Curso (Moodle)** — não é o mesmo objeto que o Curso do SIGAA; aqui,
  "curso" é o espaço de uma disciplina específica dentro do Moodle. Um
  Curso do Moodle não referencia diretamente uma Turma do SIGAA — a
  ligação entre os dois é feita pelo próprio app (ver seção seguinte).
- **Tópico** — uma seção dentro de um Curso do Moodle (geralmente uma
  semana ou unidade).
- **Material/Recurso** — um arquivo, link ou atividade dentro de um
  Tópico.

### Entidades do Google Classroom

Usado por outra parte das disciplinas, via API REST oficial do Google —
ver [Google Classroom](/integracoes/google-classroom/).

- **Turma (Classroom)** — identificada por um `courseId` do Google, igual
  ao Curso do Moodle: não referencia uma Turma do SIGAA diretamente.
- **Atividade/Anexo** — conteúdo postado numa Turma do Classroom, podendo
  incluir arquivos do Google Drive.

## O que o próprio app compõe

Nenhum dos três sistemas de origem sabe da existência dos outros dois. O
app é quem faz essa ligação, sempre do lado do **aluno**: é o aluno logado
que "sabe" que a disciplina X, cursada como Turma no SIGAA, é a mesma
disciplina cujo material está no Curso Y do Moodle ou na Turma Z do
Classroom — não existe join automático por ID entre os três sistemas.

Entidades compostas/derivadas hoje no `backend` (ver `schema.prisma`):

- **User** — a conta no ecossistema ufba.app, separada da identidade no
  SIGAA. Um User se liga a um Aluno do SIGAA via **SigaaLink** (o vínculo
  de credenciais/sessão).
- **PontoAtencao** — uma entidade que não existe em nenhum sistema oficial:
  um alerta que o app cria (ex: "componente com risco de reprovação"),
  com **Votos** de outros alunos confirmando ou não a situação. É
  inteiramente do domínio do app, sem contrapartida no SIGAA/Moodle.
- **PlanoItem** — item de planejamento de trajetória acadêmica (o que
  cursar em semestres futuros), calculado a partir do Histórico e da
  Estrutura Curricular, mas não é um dado que o SIGAA expõe diretamente.
- **CachedGrade / CachedSchedule / DocenteLookup** — caches de dados que
  vêm do SIGAA/Moodle, mantidos pelo `api` pra evitar reconsultar o
  sistema de origem a cada acesso. Não são "novas" entidades de domínio,
  são cópias com TTL de algo que já existe em outro lugar.

## Fora de escopo (por ora)

Este documento não tem diagrama ER — só texto. Um diagrama pode ser
adicionado depois se a quantidade de entidades crescer o suficiente pra
justificar (ver a spec deste repo,
[2026-09-03-docs-site-design.md](https://github.com/ufba-app/docs)).
