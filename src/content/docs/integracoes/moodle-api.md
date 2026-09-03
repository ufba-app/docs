---
title: Moodle — API REST oficial
description: Como o gradline se conecta ao ava.ufba.br via API REST oficial do Moodle.
---


## Status: FUNCIONANDO — implementado e validado em produção (fora do gradline)

Spike feito em 31/08/2026 no repo irmão `~/dev/me/rotina-pessoal`, pra
sincronizar materiais de disciplinas do Moodle pro sistema de rotina pessoal.
Diferente das investigações do SIGAA neste repo (`HISTORICO_PDF_INVESTIGATION.md`,
`TURMA_VIRTUAL_INVESTIGATION.md`, `PROFESSORES_INVESTIGATION.md`), **isso não é
scraping de HTML** — é a API REST oficial de Web Services do Moodle
(`webservice/rest/server.php`), a mesma que o app "Moodle Mobile" oficial usa.
Bem mais estável que qualquer coisa baseada em parsear página.

Código de referência (funcionando, pode copiar/portar pro gradline):
- `~/dev/me/rotina-pessoal/scripts/faculdade/moodle.py` — cliente da API +
  fluxo de obtenção de token
- `~/dev/me/rotina-pessoal/scripts/faculdade/moodle_auth.py` — captura o
  token automaticamente via Playwright (sem DevTools manual)
- `~/dev/me/rotina-pessoal/scripts/faculdade/moodle_sync.py` — exemplo de
  consumo: sincroniza tópicos/materiais/tarefas pra markdown

## Autenticação: o problema e a saída

A rota "normal" da API do Moodle é um `wstoken` gerado manualmente em
**Preferências → Segurança → Chaves de segurança de serviços web**. Essa
opção **não aparece** pra contas de aluno na UFBA (confirmado por captura de
tela real) — normalmente depende de um admin habilitar Web Services pra
determinado "serviço" e usuário, o que a STI da UFBA não libera pra alunos.

A saída é o **fluxo SSO do app mobile oficial**, pensado exatamente pra apps
externos obterem token sem reimplementar o login (que na UFBA é SAML via CAFe
— bem mais complexo que usuário/senha direto):

```
GET https://ava.ufba.br/admin/tool/mobile/launch.php
    ?service=moodle_mobile_app
    &passport=<float aleatório, gerado por você>
    &urlscheme=<esquema custom qualquer, ex: "meuapp">
```

Isso abre o fluxo de login normal do Moodle (CAFe/SAML no caso da UFBA — tela
de usuário/senha institucional). Depois do login bem-sucedido, o Moodle tenta
redirecionar (HTTP 302) o browser pra:

```
<seuesquema>://token=<base64>
```

Esse é um **esquema de URI customizado** (`meuapp://...`) que só existe
dentro de um app mobile de verdade — em qualquer browser comum isso "falha"
(erro tipo "the address wasn't understood"). Mas o browser já *recebeu* a
resposta 302 antes de tentar (e falhar em) navegar pra lá — o token está no
header `Location` dessa resposta, então **não precisa que a navegação
funcione**, só precisa capturar essa resposta.

### Decodificando o token

O valor depois de `token=` é base64 de uma string com até 3 partes separadas
por `:::`:

```python
import base64
decoded = base64.b64decode(token_b64).decode("utf-8")
signature, wstoken, privatetoken = decoded.split(":::")  # privatetoken pode faltar
```

`signature` é um MD5 de `site_url + passport` — serve pra você validar que o
token retornado corresponde à sua própria tentativa de login (e não foi
adulterado/trocado):

```python
import hashlib
expected = hashlib.md5((site_url + passport).encode()).hexdigest()
assert signature == expected
```

`wstoken` é o token de verdade, usado em toda chamada subsequente da API.
`privatetoken` não é usado nas chamadas REST (serve pra outro fluxo, de
"private token" do app mobile).

### Duas formas de capturar a resposta 302

1. **Manual, sem dependências**: abrir a launch URL num browser normal, logar,
   abrir o DevTools → Network → filtrar pela request de `launch.php`, e copiar
   o header `Location` da resposta 302 na mão.
2. **Automática, via Playwright** (o que o gradline provavelmente quer):
   abrir um Chromium de verdade (`headless=False`), você loga manualmente na
   janela (usuário/senha nunca passam pelo código), e o script escuta o
   evento `response` da página filtrando por `launch.php` com status 3xx,
   lendo `response.headers.get("location")` — sem precisar que a navegação
   pro esquema customizado complete.

Detalhe que mordeu na prática: usar um **contexto novo/incógnito** do
Playwright (`browser.new_page()`) fez o CAFe (IdP SAML da UFBA) devolver um
erro genérico de sessão ("Erro no IDP UFBA... feche o navegador e abra
novamente"). Trocar pra `launch_persistent_context()` (perfil com cookies
persistentes entre execuções, como um profile de browser normal) resolveu —
aparenta ser sensível a cookies/estado de sessão que um contexto zerado não
tem. Vale testar isso primeiro se o gradline for fazer o mesmo com Playwright.

O token dura **~7 dias** aproximadamente antes de invalidar (não confirmado
com precisão — vale monitorar erro `invalidtoken` da API e reautenticar).

## Fazendo chamadas depois de ter o token

Endpoint único pra tudo, sempre POST:

```
POST https://ava.ufba.br/webservice/rest/server.php
  wstoken=<wstoken>
  wsfunction=<nome da função>
  moodlewsrestformat=json
  <parâmetros específicos da função>
```

Erros vêm como `200 OK` com corpo `{"exception": ..., "errorcode": ...,
"message": ...}` — não como status HTTP de erro. `errorcode: "invalidtoken"`
é o sinal de token expirado.

### Funções confirmadas funcionando (documentadas oficialmente pelo Moodle)

| `wsfunction` | Pra quê | Parâmetros |
|---|---|---|
| `core_webservice_get_site_info` | Confirma token + retorna `userid` | (nenhum) |
| `core_enrol_get_users_courses` | Lista turmas matriculadas | `userid` |
| `core_course_get_contents` | Tópicos/seções e módulos de uma turma (recursos, links, tarefas — mas **sem** prazo/descrição de tarefa) | `courseid` |
| `mod_assign_get_assignments` | Detalhe de tarefas: `duedate`, `allowsubmissionsfromdate`, `cutoffdate`, `intro` (descrição HTML), `introattachments` (arquivos do enunciado) | `courseids[0]`, `courseids[1]`... |
| `core_calendar_get_action_events_by_timesort` | Eventos com "ação pendente" (entregas, provas) a partir de um timestamp | `timesortfrom`, opcional `courseid` |

Cada tipo de atividade do Moodle (tarefa, fórum, questionário, recurso de
arquivo, link, glossário...) tem sua própria família `mod_<tipo>_get_*` pra
detalhe — `core_course_get_contents` só dá o esqueleto genérico (nome, id,
`modname`, e pra recursos/links o `fileurl` direto). Descobri isso na prática
ao notar que módulos `modname == "assign"` vinham sem prazo nenhum —
precisou de uma chamada extra e um join por `cmid` (= id do módulo em
`core_course_get_contents`) pra enriquecer.

### Baixando arquivos

Todo arquivo (recurso, anexo de tarefa) vem com um `fileurl` tipo:

```
https://ava.ufba.br/webservice/pluginfile.php/<contextid>/mod_resource/content/<rev>/<nome>?forcedownload=1
```

Pra baixar, só anexar o token como query param:

```
GET <fileurl>&token=<wstoken>
```

(nota: usa `webservice/pluginfile.php`, não o `pluginfile.php` normal — esse
outro caminho é o que aceita `?token=` como forma de auth em vez de sessão de
browser.)

### Resource tipo "link" (`mod_url`) — armadilha

Um módulo com `modname: "url"` (recurso "Link/URL") retorna, no
`core_course_get_contents`, um `contents[]` com `type: "url"` cujo `fileurl`
é o **destino real** (Drive, YouTube etc.) — mas o `module.url` (nível
superior do módulo) é só a página wrapper `mod/url/view.php?id=...` que faz
o redirect. Fácil de confundir os dois e acabar linkando pro wrapper em vez
do destino direto. Preferir `contents[].fileurl` quando `type == "url"`.

## Pra portar isso pro gradline

Diferenças a considerar frente ao SIGAA:
- Não precisa manter `JSESSIONID`/cookies de sessão pra cada chamada — só o
  `wstoken`, que dura dias, não a sessão do browser.
- Não tem parsing de HTML nem `ViewState`/postback JSF nenhum — é JSON
  estruturado o tempo todo.
- O único ponto que toca browser/SAML é a obtenção inicial do token (via
  Playwright ou manual) — depois disso é REST puro, dá pra rodar em
  qualquer lugar (mobile app do gradline incluso, se o token puder ser
  persistido com segurança no device).
- Vale mapear se o app mobile do gradline consegue reusar esse mesmo fluxo
  de captura via `WebView` + interceptação de navegação (equivalente ao que
  o Playwright faz), já que é exatamente o cenário pra que esse SSO existe.
