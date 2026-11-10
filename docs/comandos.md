# Comandos de Koma · guía rápida

Todos se ejecutan desde la raíz del repositorio. Los que llevan `sudo` piden la contraseña del equipo.

## 1. Desarrollo diario

| Comando | Para qué sirve |
| --- | --- |
| `docker compose up -d db` | Levanta solo Postgres en segundo plano. Es lo primero de cada sesión |
| `npm run watch` | Compila TypeScript cada vez que guardas (terminal 1) |
| `npm run dev` | Arranca la app en `http://localhost:3000` y la reinicia al recompilar (terminal 2) |
| `npm run build` | Compila una vez. También sirve para comprobar tipos |
| `npm run typecheck` | Comprueba tipos sin arrancar nada |

## 2. Base de datos y contenido (local)

| Comando | Para qué sirve |
| --- | --- |
| `npm run migrate` | Aplica las migraciones pendientes |
| `npm run seed` | Crea las cuentas demo, etiquetas, anuncios y parámetros. Repetirlo no duplica nada |
| `npm run content:import` | Importa las obras de `content/`. Solo añade lo nuevo |
| `npm run demo:data` | Datos de demostración del panel del autor (obras, lectores, lecturas, comentarios). Solo BD local: aborta si no lo es |

Orden en una BD vacía: `migrate` → `seed` → `content:import` → `demo:data`.

## 3. Tests

| Comando | Para qué sirve |
| --- | --- |
| `npm test` | Tests unitarios (funciones puras) |
| `npm run test:api` | Reinicia la BD `koma_test` y ejecuta las pruebas de API. No toca la BD de desarrollo |
| `npm run build && node --test server/dist/tests/unit/<tema>.test.js` | Un solo archivo de tests |
| `node --test --test-name-pattern="RN-02" server/dist/tests/unit/<tema>.test.js` | Solo los tests de una regla |

## 4. Demo local en contenedores (respaldo sin internet)

| Comando | Para qué sirve |
| --- | --- |
| `mkdir -p storage` | Crea la carpeta de imágenes con tu usuario. Si la crea Docker, es de root y la app no puede escribir |
| `docker compose up --build` | Construye y levanta app + BD. La web queda en el puerto 80 |
| `docker compose up -d` | Lo mismo, en segundo plano y sin reconstruir |
| `docker compose up -d app` | Recrea solo la app. Úsalo tras cambiar `docker-compose.yml`; `restart` no relee el archivo |
| `docker compose ps` | Qué contenedores están en marcha |
| `docker compose logs -f app` | Logs de la app en directo (Ctrl+C para salir) |
| `docker compose stop app` | Apaga la app y deja la BD encendida |
| `docker compose stop` | Apaga todo. Los datos se conservan |
| `docker compose down` | Apaga y elimina los contenedores. Los datos se conservan |
| `docker compose down -v` | **Borra también los datos** (BD incluida). Solo si quieres empezar de cero |

## 5. Avahi: `http://koma.local` en la red local

| Comando | Para qué sirve |
| --- | --- |
| `sudo apt install avahi-daemon` | Instala Avahi (una sola vez) |
| `sudo systemctl enable --now avahi-daemon` | Lo arranca y lo deja activado en cada inicio |
| `sudo systemctl start avahi-daemon` | Lo arranca |
| `sudo systemctl restart avahi-daemon` | Lo reinicia. Necesario tras cambiar el nombre del equipo |
| `sudo systemctl stop avahi-daemon` | Lo apaga |
| `systemctl status avahi-daemon` | Comprueba que está `active (running)` |
| `hostname` | Muestra el nombre actual del equipo. Anótalo antes de cambiarlo |
| `sudo hostnamectl set-hostname koma` | Renombra el equipo para que Avahi anuncie `koma.local`. Cambia también la línea `127.0.1.1` de `/etc/hosts` y reinicia Avahi |
| `ip -4 addr show` | IP del portátil en la wifi |
| `avahi-publish -a -R koma.local <IP>` | Alternativa sin renombrar: publica `koma.local` mientras el comando siga abierto |
| `avahi-resolve -n koma.local` | Comprueba que el nombre resuelve a la IP del portátil |
| `sudo ufw status` | Mira si el cortafuegos está activo |
| `sudo ufw allow 5353/udp comment 'mDNS'` | Abre mDNS si `ufw` está activo |

Para restaurar el nombre del equipo después de la demo: `sudo hostnamectl set-hostname <nombre anotado>`, la línea de `/etc/hosts` y `sudo systemctl restart avahi-daemon`.

## 6. Si algo falla en la demo local

| Situación | Comando |
| --- | --- |
| Comprobar que la app responde | `curl -i http://koma.local/api/health` → 200 y `{"status":"ok","db":"ok"}` |
| Un dispositivo no resuelve `koma.local` (plan C) | Añade `http://<IP del portátil>` a `ALLOWED_ORIGINS` en `docker-compose.yml`, ejecuta `docker compose up -d app` y entra por `http://<IP>`. Quítalo al terminar y no lo subas a git |
| La red aísla a los dispositivos (plan B) | Activa la zona wifi del portátil y conecta el móvil a ella |
| El puerto 80 está ocupado | `sudo ss -ltnp 'sport = :80'` y `docker ps` para ver quién lo usa; después, por ejemplo, `sudo systemctl stop apache2` |

## 7. Online (Render + Neon + R2)

| Comando | Para qué sirve |
| --- | --- |
| `git push origin main` | **Despliega.** Render reconstruye y arranca con cada push a la rama principal; las migraciones corren al arrancar |
| `curl -i https://<servicio>.onrender.com/api/health` | Comprueba que la web online responde. Si estaba dormida, tarda entre 30 y 60 s |
| `npm run build && npm run seed:online` | Seed contra Neon, desde local, con `.env.online`. La primera línea debe mostrar el host de Neon sin `-pooler` |
| `npm run content:import:online` | Importa `content/` a Neon y R2, desde local |
| `stripe trigger customer.subscription.created` | Envía un evento de prueba al webhook de Stripe |

- Las variables de la web online se cambian en el panel de Render. `.env.online` solo lo leen los scripts que ejecutas desde local.
- En el log de build de Render, la línea «Using Node.js version…» debe ser 24.2 o superior.
- `npm run demo:data` nunca se ejecuta online.

## 8. Git (lo manejas solo tú)

| Comando | Para qué sirve |
| --- | --- |
| `git status` | Qué archivos cambiaron |
| `git diff` | Qué cambió dentro de cada archivo |
| `git add <archivos>` | Prepara archivos para el commit |
| `git commit -m "tipo(módulo): mensaje (RN-xx)"` | Guarda el commit. En español y sin firmas de la IA |
| `git log --oneline -10` | Los últimos 10 commits |
| `git push origin main` | Sube los commits y despliega online |

## 9. Día de la presentación, en orden

1. `docker compose up -d` y `sudo systemctl start avahi-daemon`.
2. `curl -i http://koma.local/api/health` desde el portátil.
3. Abrir `http://koma.local` desde el móvil, escribiendo `http://`.
4. Abrir la web online unos 5 minutos antes para que Render despierte, y comprobar su `/api/health`.
5. Tener a mano el plan B (zona wifi) y el plan C (entrar por IP).

## 10. Levantar la app en local accesible desde la red

Paso a paso para el portátil de la presentación con Windows, en **PowerShell**, desde la raíz del repositorio. El móvil entra por `http://<nombre-del-equipo>.local`, sin cambiar el nombre del portátil: Windows 10 y 11 ya anuncian su propio nombre por mDNS, igual que Avahi en Linux (en el equipo de desarrollo, `3vil4n0n.local`).

> **Importante:** el control CSRF solo acepta los orígenes de `ALLOWED_ORIGINS`. Si entras por un nombre o una IP que no está ahí, las páginas cargan, pero entrar, registrarse, comentar o pagar dan **403**. Por eso el paso 10.6 añade el nombre y la IP del portátil en un archivo aparte, fuera del repositorio.

Los pasos 10.1 a 10.4 solo se hacen la primera vez. Para volver a levantarla, ve directo al 10.5.

### 10.1. Requisitos (una vez)

Instala Docker Desktop (con WSL 2), Node 24.2 o posterior y Git. Abre Docker Desktop y espera a que diga que está en marcha. Después comprueba las versiones:

```powershell
docker version
node --version          # v24.2 o superior
git --version
```

Si PowerShell dice que «la ejecución de scripts está deshabilitada» al usar `npm`, ejecuta esto una vez:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### 10.2. Código y obras (una vez)

```powershell
git clone <URL del repositorio> koma
cd koma
```

Copia también la carpeta `content/` del equipo de desarrollo a la raíz del repositorio: no está en git.

### 10.3. Archivo `.env` (una vez)

```powershell
Copy-Item .env.example .env
New-Item -ItemType Directory -Force storage | Out-Null
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # ejecútalo dos veces
notepad .env
```

En `.env`:
- `JWT_SECRET` y `COOKIE_SECRET`: pega uno de los dos valores generados en cada una, distintos.
- `SEED_ADMIN_PASSWORD`, `SEED_AUTHOR_PASSWORD`, `SEED_PREMIUM_PASSWORD` y `SEED_READER_PASSWORD`: las contraseñas de las cuentas demo (de 10 caracteres a 72 bytes).
- `DISCORD_INVITE_URL`: la invitación, si quieres el enlace (sin internet, no abre nada).
- El resto, como viene: `NODE_ENV=development`, `STORAGE_DRIVER=local` y `PAYMENTS_DRIVER=fake`.

### 10.4. Base de datos y contenido (una vez)

```powershell
docker compose up -d db
npm ci
npm run build
npm run migrate
npm run seed
npm run content:import
npm run demo:data        # opcional: datos del panel del autor
```

### 10.5. Nombre e IP del portátil

Conéctalo a la wifi de la presentación y anota los dos valores:

```powershell
$nombre = (hostname).ToLower()
$ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi*" | Select-Object -First 1).IPAddress
"http://$nombre.local  ·  http://$ip"
```

Si la wifi tiene otro nombre de interfaz, mírala con `Get-NetIPAddress -AddressFamily IPv4`.

### 10.6. Orígenes permitidos de la demo (fuera del repositorio)

Crea `koma-lan.yml` en tu carpeta de usuario. Sustituye `APP_URL` y `ALLOWED_ORIGINS` de `docker-compose.yml` sin tocarlo:

```powershell
$lan = @"
services:
  app:
    environment:
      APP_URL: http://$nombre.local
      ALLOWED_ORIGINS: http://$nombre.local,http://$ip,http://localhost
"@
[System.IO.File]::WriteAllText("$HOME\koma-lan.yml", $lan)   # UTF-8 sin BOM
Get-Content "$HOME\koma-lan.yml"
```

Si cambian la red o la IP, repite los pasos 10.5 y 10.6.

### 10.7. Red privada y cortafuegos (PowerShell como administrador, una vez por red)

```powershell
Get-NetConnectionProfile                                                   # mira el nombre y la categoría
Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private  # si sale Public
New-NetFirewallRule -DisplayName "Koma demo (HTTP 80)" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Koma demo (mDNS)" -Direction Inbound -Protocol UDP -LocalPort 5353 -Action Allow -Profile Private
```

Con la red en «Pública», Windows no responde a los demás dispositivos aunque la app esté en marcha.

### 10.8. Levantar la app

```powershell
docker compose -f docker-compose.yml -f "$HOME\koma-lan.yml" up -d --build app
docker compose ps                          # db (healthy) y app en marcha
docker compose logs -f app                 # Ctrl+C para salir; sin "level":"error"
```

### 10.9. Comprobar

```powershell
curl.exe -i http://localhost/api/health    # 200 y {"status":"ok","db":"ok"}
curl.exe -i "http://$nombre.local/api/health"
```

En PowerShell, `curl` a secas es otro comando: usa `curl.exe`.

Desde el móvil, en la misma wifi y escribiendo `http://`:
1. `http://<nombre>.local/api/health` responde `{"status":"ok","db":"ok"}`.
2. `http://<nombre>.local` muestra la portada.
3. Entra con una cuenta demo: si da 403, el nombre por el que entras no está en `ALLOWED_ORIGINS` (paso 10.6).

### 10.10. Si algo falla

| Situación | Qué hacer |
| --- | --- |
| El móvil no resuelve `<nombre>.local` (pasa en algunos Android) | Entra por `http://<IP>`: ya está en `ALLOWED_ORIGINS` |
| No carga ni por nombre ni por IP | Revisa el paso 10.7: red en «Privada» y regla del puerto 80 |
| La red aísla a los dispositivos (wifi de invitados o de centros) | Activa la zona con cobertura inalámbrica móvil de Windows, conecta el móvil a ella y repite los pasos 10.5, 10.6 y 10.8 |
| El puerto 80 está ocupado | `Get-NetTCPConnection -LocalPort 80 -State Listen` y `Get-Process -Id <OwningProcess>`; para IIS, `Stop-Service W3SVC` (como administrador) |
| Docker no arranca | Abre Docker Desktop y espera a que esté en marcha; `docker version` debe mostrar «Server» |

### 10.11. Apagar

```powershell
docker compose stop app          # la BD sigue encendida
docker compose stop              # todo; los datos se conservan
```

Para quitar las reglas del cortafuegos (como administrador):

```powershell
Remove-NetFirewallRule -DisplayName "Koma demo (HTTP 80)", "Koma demo (mDNS)"
```
