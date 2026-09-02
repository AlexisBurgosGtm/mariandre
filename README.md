# MariAndre

Aplicación web (Express + SPA en vanilla JavaScript) para gestionar conexiones a bases de datos **SQL Server** y **MySQL**, WhatsApp, Google Tasks y más.

## Características

- Interfaz SPA con tema azul oscuro y efectos glass
- Iconos Font Awesome Free
- Servidor web en puerto **9006** (configurable con `PORT`)
- Gestión CRUD de conexiones en `conexiones.json`
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

## Estructura de conexiones (`conexiones.json`)

Cada conexión incluye el campo `tipo` para identificar el motor:

| Campo | Descripción |
|-------|-------------|
| `id` | Identificador único |
| `nombre` | Nombre descriptivo |
| `tipo` | `"mssql"` o `"mysql"` |
| `host` | Servidor |
| `puerto` | Puerto (1433 MSSQL, 3306 MySQL) |
| `usuario` | Usuario |
| `password` | Contraseña |
| `baseDatos` | Base de datos |
| `opciones` | Solo MSSQL: `encrypt`, `trustServerCertificate` |

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
