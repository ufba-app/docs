---
title: Moodle — automação de login
description: Por que não trocamos o fluxo de SSO do Moodle Mobile por login via browser normal.
---


## Status: INVESTIGADO — recomendação é NÃO trocar a solução atual

Spike de reconhecimento feito em 31/08/2026 contra o `ava.ufba.br` e o IdP
`cafe.ufba.br` reais, **sem credenciais** (só endpoints públicos, headers e
metadados SAML) + leitura do código-fonte oficial do Moodle. Nada foi
implementado — este doc é insumo de decisão.

Complementa [`MOODLE_API_INVESTIGATION.md`](/integracoes/moodle-api/), que
descreve o fluxo que **já funciona** (Moodle Mobile SSO + Playwright local,
em `~/dev/me/rotina-pessoal/.claude/skills/sync-faculdade/scripts/moodle_auth.py`).

**A pergunta**: dá pra obter um `wstoken` do `ava.ufba.br` via browser normal,
hospedável como serviço público, sem app nativo e sem Playwright local — como
já fazemos pro Google Classroom no `ufba-integrations-api`?

**Resposta curta**: não. O Moodle upstream fechou essa porta de propósito
(MDL-70428, *Closed / Deferred*), e a versão que a UFBA roda (**3.8**) é velha
demais até pras alternativas que existiriam em Moodle novo.

## Fatos apurados sobre o ava.ufba.br

Tudo abaixo saiu de `tool_mobile_get_public_config` — chamável **sem token**,
pelo endpoint AJAX de nologin (o endpoint REST recusa: `invalidtoken`):

```
curl -s https://ava.ufba.br/lib/ajax/service-nologin.php?info=tool_mobile_get_public_config \
  -H 'Content-Type: application/json' \
  -d '[{"index":0,"methodname":"tool_mobile_get_public_config","args":{}}]'
```

| Campo | Valor | O que significa |
|---|---|---|
| `enablewebservices` | `1` | Web Services ligados |
| `enablemobilewebservice` | `1` | serviço `moodle_mobile_app` ativo |
| `typeoflogin` | `2` | `LOGIN_VIA_BROWSER` — o fluxo do `launch.php` é o oficial aqui |
| `launchurl` | `.../admin/tool/mobile/launch.php` | confirmado |
| `identityproviders` | **só** `CAFe UFBA` → `/auth/shibboleth/index.php` | **nenhum issuer OAuth2** |
| `forgottenpasswordurl` | `autenticacao.ufba.br` | senha é institucional, não local |

**Versão**: `https://ava.ufba.br/lib/upgrade.txt` termina em `=== 3.8.5 ===` →
o site roda **Moodle 3.8.x**. Isso é decisivo em várias linhas abaixo.

Outros probes (todos sem credencial):

- `login/token.php` → responde `invalidlogin` (serviço **habilitado**, mas exige
  usuário+senha nossos — ver opção 7).
- `tool_mobile_get_tokens_for_qr_login` → **não existe** na tabela
  `external_functions` (`dml_missing_record_exception`). Login por QR é 3.9+.
- `auth/oauth2/login.php?id=1` → 404 renderizado pelo Moodle (plugin sem issuer
  configurado), coerente com o `identityproviders`.
- `ava.ufba.br` manda `X-Frame-Options: SAMEORIGIN`.
- `cafe.ufba.br/idp/...` manda `X-Frame-Options: DENY` **e**
  `Content-Security-Policy: frame-ancestors 'none'`.

## O código do `launch.php` (fonte da verdade)

`admin/tool/mobile/launch.php` (core, inalterado no essencial desde 3.3):

```php
$urlscheme = optional_param('urlscheme', 'moodlemobile', PARAM_NOTAGS);
if (!preg_match('/^[a-zA-Z][a-zA-Z0-9-\+\.]*$/', $urlscheme)) { throw ... }
...
$location = "$urlscheme://token=$apptoken";
header('Location: ' . $location);
```

Três consequências duras:

1. O destino é **sempre** `<scheme>://token=<b64>`. Não existe path, não existe
   host controlável: mesmo com `urlscheme=https`, o resultado é
   `https://token=<base64>` — o "host" vira a string `token=...` (com `=`, `+`,
   `/` — nem hostname válido é). Não há como apontar pro nosso domínio.
2. O regex aceita letras, dígitos, `-`, `+`, `.` — **aceita `web+alguma`**
   (relevante na opção 4).
3. Existe um `oauthsso` param que desvia pro `/auth/oauth2/login.php` — só que
   `is_enabled_auth('oauth2')` precisa ser verdadeiro e ter issuer. Na UFBA não tem.

## Opções investigadas

| # | Opção | Viabilidade | Por quê |
|---|---|---|---|
| 1 | Plugin `auth_oauth2` do Moodle (OAuth2 de verdade, `redirect_uri` HTTPS) | **Descartada** | Nenhum issuer OAuth2 no `ava.ufba.br` — comprovado |
| 2 | Login por QR code / `tool_mobile_get_tokens_for_qr_login` | **Descartada** | Função não existe: site é Moodle 3.8, QR login é 3.9+ |
| 3 | Manipular `urlscheme` pra apontar pro nosso HTTPS | **Descartada** | Regex + `"$urlscheme://token="` tornam impossível por construção; MDL-70428 pedindo isso foi *Closed / Deferred* |
| 4 | `registerProtocolHandler("web+...")` no browser | **Baixa** (único caminho "público" real) | Funciona só em desktop Chrome/Firefox, atrás de prompt; sem suporte em Safari nem em browser mobile |
| 5 | SAML ECP / Shibboleth headless | **Descartada por política** | Exigiria nosso servidor mandar a senha (HTTP Basic) ao IdP |
| 6 | iframe da tela do CAFe + captura por JS | **Descartada** | `frame-ancestors 'none'` no IdP; e mesmo se carregasse, same-origin impede ler |
| 6b | Proxy reverso nosso na frente do `ava.ufba.br` | **Tecnicamente viável, descartada por política** | A senha institucional passaria pela nossa infra |
| 7 | `login/token.php` (usuário+senha → token) | **Descartada por política** | Endpoint está ligado, mas o form da senha seria nosso |
| 8 | LTI / `enrol_lti` | **Descartada** | Resolve outro problema; e depende de config de admin por curso |
| 9 | Extensão de browser capturando o 302 | **Média** | Funciona, mas é "outro app nativo" com outro nome — e só desktop |
| 10 | Colar a URL que falhou (fluxo manual já existente) | **Alta**, mas só desktop | Zero infra; no mobile a URL não é copiável |
| 11 | **App nativo registrando o esquema (`ufba-app://`)** | **Alta — é o caminho certo pro gradline** | Já configurado em `mobile/app.config.js` |
| 12 | Playwright local (status quo) | **Alta — é o que funciona hoje** | Custo: exige sessão local com janela |

### 1. Plugin `auth_oauth2` — descartada

Seria o análogo exato do Classroom: `launch.php?...&oauthsso=<issuerid>` desvia
pro `/auth/oauth2/login.php`, e o retorno do OAuth cai num `redirect_uri` HTTPS
do próprio Moodle. Mas isso autentica *no Moodle* — o token final ainda voltaria
pelo mesmo `<scheme>://token=`. Ou seja: **mesmo se a UFBA habilitasse, não
resolveria nosso problema**, só trocaria a tela de login.

E de qualquer forma não está habilitado. Como verificar sem credenciais (já
feito): `identityproviders` no `get_public_config` — se `auth_oauth2` tivesse
issuers, cada um apareceria ali com `url` apontando pra
`/auth/oauth2/login.php?id=N`. Só aparece o Shibboleth do CAFe.

**Próximo passo se algum dia mudar**: reexecutar o `get_public_config` e olhar
`identityproviders`. Mas ver a ressalva acima — o ganho seria pequeno.

### 2. QR code / polling por sessionid — descartada

Moodle 3.9+ tem login por QR: o usuário loga no `ava` **no browser dele**, abre
o QR do próprio perfil, e o app chama `tool_mobile_get_tokens_for_qr_login`
(sem token) com `qrloginkey` + `userid`, recebendo `wstoken` + `privatetoken`.
Seria **exatamente** o que queremos: nenhum esquema customizado, funciona de
qualquer lugar, a senha só é digitada na página oficial.

Só que a função **não existe** no `ava.ufba.br` (3.8). Não existe nenhum outro
webservice de "iniciar sessão e aguardar confirmação" no 3.8.

**Próximo passo**: reprobar a cada semestre (a STI eventualmente atualiza) —
o teste é uma linha, sem credencial:

```
curl -s https://ava.ufba.br/lib/ajax/service-nologin.php?info=tool_mobile_get_tokens_for_qr_login \
  -H 'Content-Type: application/json' \
  -d '[{"index":0,"methodname":"tool_mobile_get_tokens_for_qr_login","args":{"qrloginkey":"x","userid":1}}]'
```

Se um dia parar de dizer `invalidrecord` e passar a reclamar do `qrloginkey`,
**esse vira o caminho recomendado** e o Playwright pode ser aposentado. Nota: o
admin ainda precisa ter `tool_mobile | qrcodetype = 2` (login automático).

### 3. Truque no `urlscheme` — descartada, por construção

Ver a análise do código acima. Não é sanitização frouxa que salva: o problema é
que a URL final é literalmente `"$urlscheme://token=$apptoken"`, sem host nem
path. `urlscheme=https` é aceito pelo regex (testei: `launch.php?...&urlscheme=https`
responde 303 normal), e produziria `https://token=<b64>` — que não resolve DNS
nem é hostname sintaticamente válido.

Sobre Android App Links / iOS Universal Links: eles associam um domínio HTTPS a
um app, mas dependem de o servidor emitir uma **URL `https://dominio/path`** —
que é justamente o que o Moodle nunca emite aqui. O `forcedurlscheme` (setting
de admin) também só troca o esquema, não a forma.

Upstream: **[MDL-70428 — "Allow custom callback url for admin/tool/mobile/launch.php"](https://moodle.atlassian.net/browse/MDL-70428)**
pede exatamente isso, com exatamente a nossa justificativa ("impossible to use
webservices from within a browser"). Status: **Closed, resolution Deferred**,
sem `fixVersion`. É a confirmação definitiva de que não existe rota oficial.

### 4. `registerProtocolHandler("web+ufba", ...)` — baixa, mas é a única ideia genuinamente nova

A única forma de um **browser comum** entregar aquele `<scheme>://token=` pro
nosso domínio é o próprio browser ter um handler registrado pra esse esquema —
e a web tem uma API pra isso sem app nativo:

```js
navigator.registerProtocolHandler("web+ufba", "https://gradline.app/moodle/token?u=%s");
```

O regex do Moodle **aceita** `web+ufba` (o `+` está na classe permitida). Então
`launch.php?service=moodle_mobile_app&passport=...&urlscheme=web+ufba`
redirecionaria pra `web+ufba://token=<b64>`, e o browser encaminharia isso pro
nosso endpoint HTTPS como query param. Fluxo 100% web, hospedável, e a senha
continua sendo digitada só no CAFe.

Por que a viabilidade ainda é **baixa**:

- **Safari não suporta** `registerProtocolHandler` (a Apple se opôs à proposta)
  — mata macOS e todo o iOS.
- **Nenhum browser mobile mainstream** implementa handlers `web+` (caniuse,
  fev/2026) — mata o caso de uso principal do gradline, que é celular.
- No Chrome o suporte a esquemas `web+` custom ainda anda atrás de flag
  experimental em versões recentes; no Firefox funciona, mas com prompt de
  permissão e exigindo gesto do usuário.
- Cobertura estimada: ~34% do tráfego global, quase todo desktop.
- Precisa ainda que o handler dispare a partir de uma **navegação vinda de um
  302 de terceiro** — plausível, mas não verificado.

**Próximo passo se quisermos testar** (barato, ~1h): página estática que chama
`registerProtocolHandler("web+ufba", ...)`, aceitar o prompt no Chrome/Firefox
desktop, e abrir o `launch.php` com `urlscheme=web+ufba`. Se o token cair no
nosso endpoint, temos um caminho web para desktop — mas ainda **nada** para
mobile, que é onde o gradline vive. Por isso: interessante, não prioritário.

### 5. SAML ECP / Shibboleth headless — descartada por política

O IdP do CAFe (`cafe.ufba.br/idp`, Shibboleth) publica bindings SOAP no
metadata (`/idp/shibboleth`: 3× `SAML:2.0:bindings:SOAP`), e
`/idp/profile/SAML2/SOAP/ECP` responde 500 a um GET — ou seja, o handler
provavelmente existe. Tecnicamente ECP permitiria autenticar sem redirect de
browser.

Mas ECP é, por definição, o cliente mandando as credenciais (HTTP Basic) pro
IdP. Qualquer implementação nossa implica **nosso código recebendo a senha
institucional** — barrado pela restrição inegociável. Descartada sem mais
análise.

### 6. iframe da tela de login + captura por JS — descartada (confirmado no fio)

A ideia: embutir o `launch.php`/CAFe num iframe da nossa UI e ler o token por JS
quando o login terminar. Morre em dois pontos independentes, o primeiro
confirmado empiricamente:

**Bloqueio 1 — o IdP proíbe ser embutido.** Confirmado sem credencial, seguindo
a cadeia `ava.ufba.br/auth/shibboleth/index.php` → `cafe.ufba.br/idp/...`:

```
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none';
```

O próprio `ava.ufba.br` já manda `X-Frame-Options: SAMEORIGIN`. É proteção
anti-clickjacking padrão de tela de login — a hipótese estava certa e a opção
morre aqui, antes mesmo do problema 2.

**Bloqueio 2 — same-origin.** Ainda que carregasse: JS da página pai não lê a
URL, o DOM nem os headers de um iframe de outra origem. É exatamente essa
barreira que nos obrigou a usar Playwright/CDP — o CDP tem visibilidade
privilegiada da camada de rede que JS de página não tem, **de propósito**
(senão qualquer site roubaria token e sessão de qualquer outro).

**6b — proxy reverso nosso repassando o `ava.ufba.br`**: viabilidade
**técnica alta**, política **descartada**. Tudo passaria pelo nosso domínio →
vira same-origin de verdade, nosso servidor veria o `Location:` do 302 antes do
browser. Mas a senha institucional trafegaria pela nossa infraestrutura, mesmo
sem log e sem persistência — e "de passagem" também é manusear. Some-se a isso
que o CAFe é federação (não é só a UFBA que confia nesse IdP) e que o SP do
Shibboleth valida hosts, o que provavelmente quebraria o SAML de qualquer jeito.
**Próximo passo: não fazer.** Fica registrado como avaliado e recusado — que é
diferente de não ter sido pensado.

### 7. `login/token.php` — descartada por política

Existe e está ligado (`invalidlogin` com credenciais falsas). É o grant
usuário+senha → `wstoken` direto. Duas razões pra não usar: (a) o formulário
seria nosso → viola a restrição; (b) contas UFBA são SAML/CAFe, então nem é
certo que a senha institucional funcione nesse endpoint (o `invalidlogin` com
lixo é inconclusivo).

### 8. LTI — descartada

LTI resolve "lançar uma ferramenta externa a partir do Moodle, com identidade",
não "obter um wstoken de fora". Além disso `enrol_lti` exige que um admin/professor
publique cada curso como ferramenta. Fora de alcance.

### 9. Extensão de browser — média, mas não muda a natureza do problema

Uma extensão (MV3, `webRequest`/`declarativeNetRequest`) veria o `Location:` do
302 — igual ao Playwright, sem baixar Chromium. Mas continua sendo software
nativo instalado, só desktop, e com fricção de distribuição maior que o script
atual. Não é ganho suficiente.

### 10. Colar a URL que falhou — alta em desktop, já implementado

É o `moodle.py parse-token` que já existe. No Chrome desktop, a navegação pra
`ufba-app://token=...` falha mas a **barra de endereço mostra a URL completa** —
o usuário copia e cola. Zero infra, funciona hoje, e serviria como fallback
público de um serviço web. Problema: no mobile (que é o caso do gradline),
Safari/Chrome mostram um alerta e não expõem a URL de forma copiável.

### 11. App nativo registrando `ufba-app://` — é a resposta certa pro gradline

Para o **app**, o problema simplesmente não existe: `mobile/app.config.js` já
tem `scheme: "ufba-app"`, que é exatamente o `urlscheme` que o
`moodle_auth.py` usa. O fluxo oficial do Moodle Mobile funciona nativamente —
abrir o `launch.php` num navegador do sistema e receber o deep link de volta.
Nenhuma das gambiarras acima é necessária no app.

O buraco é só a **skill `sync-faculdade`** (desktop, sem app nativo pra
registrar esquema). E é aí que o Playwright entra.

## Recomendação

**Manter o Playwright local. Não construir nada agora.**

- Não existe rota oficial: o Moodle upstream recusou explicitamente
  ([MDL-70428, Deferred](https://moodle.atlassian.net/browse/MDL-70428)) —
  não é omissão da UFBA, é decisão de projeto.
- A única alternativa que seria realmente boa (**login por QR, opção 2**) exige
  Moodle 3.9+; a UFBA está no 3.8. É o item a monitorar: um `curl` de uma linha,
  a cada semestre, diz se virou viável.
- A única ideia web genuinamente nova (**`registerProtocolHandler`, opção 4**)
  não funciona em nenhum browser mobile e não funciona em Safari nenhum — ou
  seja, não serve pro gradline, que é um app de celular. Serviria, na melhor
  hipótese, como conveniência de desktop.
- Tudo que "funcionaria de verdade num serviço público" (proxy reverso, ECP,
  `token.php`) esbarra na mesma coisa: nossa infra tocando na senha
  institucional. Regra não negociável, e nenhuma delas vale abrir exceção.
- Para o **gradline mobile**, o esquema `ufba-app://` já registrado resolve o
  problema por completo — o Playwright é uma necessidade **só** da skill de
  desktop, onde rodar local já é premissa aceita.

### Gatilhos pra reabrir esta investigação

1. `ava.ufba.br/lib/upgrade.txt` passar de 3.8 → reprobar o QR login (opção 2).
2. `identityproviders` do `get_public_config` listar algo além do CAFe.
3. MDL-70428 ser reaberto/implementado upstream.
