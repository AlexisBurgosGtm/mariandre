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

## Generador de licencias OnneB

La sección **Generador Licencias** emite archivos `.json` firmados para instalaciones OnneB. El catálogo se lee en vivo desde OnneB (`MENU_GROUPS`). En el POS del cliente se cargan en **Configuraciones → Licencia**.

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
