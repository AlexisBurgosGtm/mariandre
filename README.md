# MariAndre

Aplicación web (Express + SPA en vanilla JavaScript) para gestionar conexiones a bases de datos **SQL Server** y **MySQL**, WhatsApp, Google Tasks y más.

## Características

- Interfaz SPA con tema azul oscuro y efectos glass
- Iconos Font Awesome Free
- Servidor web en puerto **9006** (configurable con `PORT`)
- Gestión de conexiones a SQL Server y MySQL desde la interfaz
- Prueba de conexión para MSSQL y MySQL

## Instalación

```bash
npm install
```

## Ejecutar

```bash
npm start
```

Abre el navegador en [http://localhost:9006](http://localhost:9006).

## Variables de entorno opcionales

| Variable | Descripción | Default |
|----------|-------------|---------|
| `PORT` | Puerto del servidor | `9006` |
| `DATA_DIR` | Carpeta de datos JSON / auth | raíz del proyecto |
| `MARIANDRE_DATA_KEY` | Llave AES-256 (32 bytes en base64 o hex). Si no se define, se usa el archivo de llave | se genera `.mariandre-key` |
| `MARIANDRE_KEY_FILE` | Ruta del archivo de llave | `DATA_DIR/.mariandre-key` |
| `ONNEB_ROOT` | Ruta al proyecto OnneB (`OnneB-ERP`) para el generador de licencias | carpeta hermana `../OnneB-ERP` (también acepta `pos_onneb`) |
| `FSERP_ROOT` | Ruta al proyecto FS ERP (`FsERP-EL SALVADOR`) para licencias El Salvador | carpeta hermana `../FsERP-EL SALVADOR` |

## Generador de licencias

**Mariandre es la única generadora** de licencias para OnneB y FS-SV.

| Sección | Producto | Claves |
|---------|----------|--------|
| **Generador Licencias** | OnneB | `license-keys/` (en Mariandre) |
| **Licencias FS ERP** | FS-SV | `license-keys-fserp/` (en Mariandre) |

El catálogo se lee en vivo desde cada producto (`MENU_GROUPS`). La clave pública se sincroniza a `config/license-public.pem` del POS al emitir/cargar el catálogo. En el cliente: **Configuraciones → Licencia**.

## Notas

Empaquetado e instalación local de OnneB / FS-SV: ver la sección **Notas** en la app Mariandre (`#/notas`), o `dist-client/README-INSTALACION.txt` tras `npm run dist:client` en cada ERP.

## Conexiones

Las conexiones se dan de alta, editan y prueban en la pantalla **Conexiones**. Quedan en un archivo local cifrado (no se versiona). Si ese archivo no existe, la aplicación crea uno vacío al arrancar. `conexiones.example.json` es solo una plantilla con datos ficticios; la app no la copia sola.

## Datos cifrados en disco

Estos archivos se guardan con **AES-256-GCM** (módulo `crypto` de Node, sin dependencias extra):

| Archivo | Qué protege |
|---------|-------------|
| `conexiones.json` | Datos de conexión que carga la pantalla Conexiones |
| `cursor-api.json` | Llave local, si el archivo existe (la app no la muestra en la interfaz) |
| `license-keys/private.pem` y `license-keys-fserp/private.pem` | Clave privada del generador, si ya existe en la PC |

La llave de cifrado **no está en el repositorio**. La primera vez se crea sola en `DATA_DIR/.mariandre-key` (en una instalación normal, la raíz del proyecto). También vale definir `MARIANDRE_DATA_KEY`.

Respalde `.mariandre-key` fuera de la carpeta del proyecto (otro disco o una carpeta que no se suba a git). **Si esa llave se pierde o no coincide, los archivos cifrados no se pueden leer.** En ese caso la aplicación escribe el motivo en la consola y no borra ni reescribe los datos.

Si un archivo protegido todavía está en texto plano (por ejemplo justo después de actualizar), al arrancar se lee y se vuelve a guardar cifrado, sin tirar el contenido.

Otros JSON de la raíz (`config.json`, `mantenimiento.json`, `alarmas.json`, `servicios-online.json`, `comandos-voz.json`, plantillas de licencias) no llevan contraseñas ni llaves de API y siguen versionados en claro. La sesión de WhatsApp (`.baileys_auth/`), `google-credentials.json`, `google-tokens.json` y las carpetas `license-keys/` ya estaban fuera de git; Baileys sigue escribiendo su sesión como hasta ahora.

### Actualizar en la PC (Windows)

Hay que respaldar **antes** de `git pull`. Esos archivos dejan de estar en git: si el pull los encuentra iguales a la última versión publicada, **git los borra** del disco.

En la carpeta del proyecto, en el símbolo del sistema:

```bat
mkdir "%USERPROFILE%\mariandre-respaldo"
copy /Y "conexiones.json" "%USERPROFILE%\mariandre-respaldo\"
copy /Y "cursor-api.json" "%USERPROFILE%\mariandre-respaldo\"
```

Si usa `DATA_DIR`, copie también los mismos nombres desde esa carpeta (un `git pull` no los toca si están fuera del repositorio, pero el respaldo igual conviene).

Después del pull, devuelva los archivos y arranque:

```bat
copy /Y "%USERPROFILE%\mariandre-respaldo\conexiones.json" .
copy /Y "%USERPROFILE%\mariandre-respaldo\cursor-api.json" .
npm install
npm start
```

Al arrancar, la consola indica que se cifraron y dónde quedó la llave. Copie también `.mariandre-key` al respaldo. No lo suba a git.

Ese respaldo sigue en texto plano. No lo ponga en una carpeta que se sincronice ni lo suba a git. Cuando la aplicación ya arrancó bien y la llave está copiada en el respaldo, puede borrar las copias en texto plano.

Si `npm start` avisa que creó `conexiones.json` vacío, no siga usando ese archivo vacío: cierre la app, vuelva a copiar el respaldo encima y arranque otra vez. Si `cursor-api.json` no existía, el `copy` de ese nombre puede fallar: no pasa nada.

El historial de git puede conservar copias viejas en texto plano. Conviene cambiar esas contraseñas y llaves, o pasar el repositorio a privado.

## API REST

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/status` | Estado del servicio |
| GET | `/api/conexiones` | Listar conexiones |
| POST | `/api/conexiones` | Crear conexión |
| PUT | `/api/conexiones/:id` | Actualizar conexión |
| DELETE | `/api/conexiones/:id` | Eliminar conexión |
| POST | `/api/conexiones/:id/test` | Probar conexión guardada |
| POST | `/api/conexiones/test` | Probar datos sin guardar |

## Tecnologías

- Node.js + Express
- mssql / mysql2
- Baileys (`@whiskeysockets/baileys`)
- Font Awesome 6
