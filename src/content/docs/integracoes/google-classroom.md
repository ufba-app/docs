---
title: Google Classroom — API REST oficial
description: Arquitetura de broker OAuth2 para sincronizar turmas do Google Classroom.
---


Como a sincronização de turmas do Google Classroom funciona hoje, implementada em
[`rotina-pessoal/.claude/skills/sync-faculdade/scripts/classroom_sync.py`](../rotina-pessoal/.claude/skills/sync-faculdade/scripts/classroom_sync.py).
Complementa [`MOODLE_API_INVESTIGATION.md`](/integracoes/moodle-api/) — enquanto o Moodle exigiu
scraping de sessão via SSO do app mobile, o Classroom usa a **API REST oficial** do
Google (`classroom.googleapis.com` + `www.googleapis.com/drive` para anexos), com OAuth2
padrão. Não há automação de login/browser envolvida.

## Arquitetura: broker, não client direto

O client_id/client_secret do projeto Google Cloud não circula pelo computador do
André nem em nenhum `.env` — mora só no broker
[`ufba-integrations-api`](https://github.com/andreojr/ufba-integrations-api)
(rodando em `https://ufba-integrations-api-production.up.railway.app`). O que o
script local guarda é um **refresh token pessoal e revogável**
(`CLASSROOM_REFRESH_TOKEN`).

Fluxo de obtenção do refresh token (self-serve, qualquer aluno):
1. Abrir `{broker}/classroom/oauth/start` em um browser, logar com a conta Google.
2. O broker conduz o consent screen OAuth2 (usando seu próprio client_secret) e,
   ao final, mostra o `CLASSROOM_REFRESH_TOKEN` pra colar no `.env` local.

Fluxo de uso (a cada sync):
1. `get_access_token()` — POST `{broker}/classroom/token` com `{refresh_token}` →
   broker troca pelo access token de curta duração junto ao Google e devolve
   `{access_token}`.
2. Todas as chamadas de API passam por dois endpoints proxy do broker, nunca
   direto pro Google:
   - `POST {broker}/classroom/call` — chama qualquer `path` da Classroom API,
     paginando automaticamente por `paginate_key` (o broker resolve `nextPageToken`
     por trás, o script só recebe a lista final).
   - `GET {broker}/classroom/drive-file` e `GET {broker}/classroom/drive-download` —
     metadados e bytes de um arquivo do Drive por `file_id`.

Essa indireção é o mesmo padrão do Google Calendar (ver `CLAUDE.md` da raiz do
`rotina-pessoal`): um único broker guarda segredo de OAuth para múltiplas integrações
Google, e só tokens de usuário revogáveis circulam nas pontas.

## Como a API identifica cada entidade

A Classroom API organiza tudo por **courseId** — o identificador central. A partir
dele, três coleções filhas são listadas via `GET /v1/courses/{courseId}/<coleção>`
(chamado aqui como `path` através do broker):

| Coleção (path) | O que é | Chave de paginação |
|---|---|---|
| `courseWork` | Tarefas/atividades com nota | `courseWork` |
| `courseWorkMaterials` | Materiais sem nota (slides, links) | `courseWorkMaterial` |
| `announcements` | Avisos do mural | `announcements` |

Cada item dessas três coleções tem seu próprio **id** (string numérica, imutável),
usado no script pra:
- desempate de nome de arquivo (`{data}-{slug-do-título}-{id}.md` quando duas
  entradas colidem no mesmo dia + título derivado);
- registrado no comentário de topo do markdown gerado, como referência de origem
  (`a partir do Classroom (coursework, id \`123456\`)`).

Campos usados de cada item (variam por tipo):
- `title` — ausente em `announcement`; nesse caso o script deriva um título da
  primeira linha não vazia de `text` (campo específico de anúncio; `courseWork` e
  `courseWorkMaterial` usam `description`).
- `creationTime` (ISO 8601) — os 10 primeiros chars (`YYYY-MM-DD`) viram o prefixo
  do nome do arquivo.
- `dueDate`/`dueTime` — só em `courseWork`, objetos `{year, month, day}` /
  `{hours, minutes}` separados (não um único timestamp).
- `maxPoints` — só em `courseWork`.
- `alternateLink` — URL direta pro item na UI do Classroom.
- `materials[]` — lista de anexos heterogênea (ver seção seguinte).

### `courseId` das turmas do André (hardcoded, não descoberto em runtime)

```python
COURSES = [
    {"id": "875681263757", "slug": "mata59-redes-1", ...},
    {"id": "869236057406", "slug": "mata58-sistemas-operacionais", ...},
]
```

Esses IDs foram obtidos manualmente uma vez (análogo ao processo de listar cursos
matriculados via API — `GET /v1/courses` filtrado por `studentId=me` retornaria isso,
mas o script não faz essa descoberta automática: é lista fixa, editada à mão quando
uma turma entra/sai do semestre). Cada pessoa que reusa o script edita essa lista
com os próprios `courseId`.

## Anexos: `materials[]` é uma união de tipos

Cada entrada de `materials[]` num `courseWork`/`courseWorkMaterial` é um objeto com
**exatamente uma** destas chaves preenchidas (union type da API):

- `driveFile: { driveFile: { id, title } }` — arquivo real no Google Drive.
  Identificado pelo **Drive file `id`** (não o mesmo namespace do `courseId`/item
  `id` do Classroom — é um ID de arquivo do Drive, resolvido via
  `GET /drive/v3/files/{fileId}` por trás de `/classroom/drive-file`).
- `link: { url, title }` — URL externa qualquer, só linkada como veio.
- `youtubeVideo: { url, title }` — vídeo do YouTube, tratado igual a `link`.
- `form: { url, title }` — Google Form, tratado igual a `link`.

Só o caso `driveFile` baixa conteúdo; os outros três viram link direto no markdown
gerado.

### Download de Drive file: exportação condicional por MIME type

Nem todo Drive file pode ser baixado como bytes crus — Google Docs/Slides/Sheets
nativos (`application/vnd.google-apps.*`) não têm "conteúdo binário" real, só um
formato de exportação:

```python
GOOGLE_APPS_EXPORT_MIME = {
    "application/vnd.google-apps.document": ("application/pdf", ".pdf"),
    "application/vnd.google-apps.presentation": ("application/pdf", ".pdf"),
    "application/vnd.google-apps.spreadsheet": ("text/csv", ".csv"),
}
```

O script primeiro busca metadados (`mimeType`, `name`, `modifiedTime`) via
`drive-file`, decide se precisa de `export_mime` (rota `files.export` da Drive API
por trás do broker) ou pode baixar direto (`files.get?alt=media`, arquivos binários
de verdade — PDF já pronto, imagens, zips), e só então chama `drive-download`.

## Idempotência: `modifiedTime` do Drive como chave de "mudou ou não"

Cada matéria mantém `faculdade/<slug>/materiais/.sync-manifest.json`:

```json
{ "<drive-file-id>": { "filename": "...", "modifiedTime": "..." } }
```

Antes de baixar, compara o `modifiedTime` atual do Drive com o cacheado — se bater,
pula o download e reusa o nome de arquivo já escolhido. Isso é o único uso de
"versionamento" da API: a Drive API não expõe um ETag simples pro caso de uso, mas
`modifiedTime` (timestamp ISO 8601, atualizado em qualquer edição do arquivo) serve
como proxy suficiente pra detectar mudança.

Os markdowns de `aulas/` (coursework/material/anúncio) **não têm manifest** — são
regenerados por completo a cada sync (idempotentes por conteúdo: mesmo item sempre
produz o mesmo arquivo, então sobrescrever é barato e não perde histórico real).

## Escopo OAuth necessário

Não está explícito no script (o broker decide o `scope` pedido no consent screen),
mas pelas chamadas feitas, o mínimo necessário é:
- `classroom.courses.readonly` (ou `.readonly` equivalente) — listar `courseWork`,
  `courseWorkMaterials`, `announcements`.
- `drive.readonly` (ou `drive.file` se o broker restringir a arquivos
  compartilhados com o app) — ler metadados e baixar/exportar anexos.

Tudo somente-leitura — o sync nunca escreve nada de volta no Classroom ou no Drive.
