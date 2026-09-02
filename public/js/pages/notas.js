import { tw } from '../ui.js';

/**
 * Notas operativas (empaquetado / instalación local de Los ERP).
 */
export async function renderNotas(container) {
  container.innerHTML = `
    <div class="space-y-4">
      <div class="${tw.panel}">
        <h3 class="mb-2 flex items-center gap-2 text-base font-semibold text-slate-800">
          <i class="fa-solid fa-box-archive" aria-hidden="true"></i>
          Empaquetado de cliente (OnneB / FS-SV)
        </h3>
        <p class="mb-3 text-sm text-slate-600">
          El desarrollo diario no cambia (<code class="rounded bg-slate-100 px-1">npm start</code>).
          Para generar el paquete que se instala en la máquina del cliente:
        </p>
        <pre class="mb-3 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800"># En cada repo (por separado):
npm run dist:client</pre>
        <p class="mb-2 text-sm text-slate-600">Salida: carpeta <code class="rounded bg-slate-100 px-1">dist-client/</code> (~90&nbsp;MB el <code class="rounded bg-slate-100 px-1">.exe</code>).</p>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[20rem] text-left text-sm">
            <thead>
              <tr class="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th class="py-2 pr-3 font-medium">Producto</th>
                <th class="py-2 pr-3 font-medium">Ejecutable</th>
                <th class="py-2 font-medium">Puerto</th>
              </tr>
            </thead>
            <tbody class="text-slate-800">
              <tr class="border-b border-slate-100">
                <td class="py-2 pr-3">OnneB</td>
                <td class="py-2 pr-3 font-mono text-xs">OnneB-Server.exe</td>
                <td class="py-2">6500</td>
              </tr>
              <tr>
                <td class="py-2 pr-3">FS-SV (FS ERP)</td>
                <td class="py-2 pr-3 font-mono text-xs">FSERP-Server.exe</td>
                <td class="py-2">6501</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="${tw.panel}">
        <h3 class="mb-2 flex items-center gap-2 text-base font-semibold text-slate-800">
          <i class="fa-solid fa-file-lines" aria-hidden="true"></i>
          Dónde va el archivo <code class="rounded bg-slate-100 px-1.5 py-0.5 text-sm">.env</code>
        </h3>
        <p class="mb-3 text-sm text-slate-600">
          En la <strong>misma carpeta</strong> que el <code class="rounded bg-slate-100 px-1">.exe</code>
          (la carpeta de instalación del cliente). Copie <code class="rounded bg-slate-100 px-1">.env.example</code> → <code class="rounded bg-slate-100 px-1">.env</code>
          y complete <code class="rounded bg-slate-100 px-1">DB_*</code>, <code class="rounded bg-slate-100 px-1">TOKEN</code> y <code class="rounded bg-slate-100 px-1">PORT</code>.
        </p>
        <pre class="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">C:\\Apps\\OnneB\\
  OnneB-Server.exe
  .env                 ← AQUÍ
  Fotos_productos\\
  EMPLEADOS\\
  data\\                ← license.json aquí

C:\\Apps\\FS-ERP\\
  FSERP-Server.exe
  .env                 ← AQUÍ
  Fotos_productos\\
  EMPLEADOS\\
  data\\</pre>
      </div>

      <div class="${tw.panel}">
        <h3 class="mb-2 flex items-center gap-2 text-base font-semibold text-slate-800">
          <i class="fa-solid fa-image" aria-hidden="true"></i>
          Fotos (LOCAL)
        </h3>
        <p class="text-sm text-slate-600">
          No van dentro del <code class="rounded bg-slate-100 px-1">.exe</code>. Se guardan junto al ejecutable en
          <code class="rounded bg-slate-100 px-1">Fotos_productos</code> y <code class="rounded bg-slate-100 px-1">EMPLEADOS</code>.
          Al actualizar, <strong>solo reemplace el .exe</strong>; no borre esas carpetas ni el <code class="rounded bg-slate-100 px-1">.env</code>.
        </p>
      </div>

      <div class="${tw.panel}">
        <h3 class="mb-2 flex items-center gap-2 text-base font-semibold text-slate-800">
          <i class="fa-brands fa-windows" aria-hidden="true"></i>
          Servicio Windows (opcional)
        </h3>
        <ol class="list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
          <li>
            Descargue WinSW (<code class="rounded bg-slate-100 px-1">WinSW-x64.exe</code>) desde
            <a class="text-blue-600 underline hover:text-blue-700" href="https://github.com/winsw/winsw/releases" target="_blank" rel="noopener noreferrer">github.com/winsw/winsw/releases</a>
          </li>
          <li>
            Renómbrelo a <code class="rounded bg-slate-100 px-1">OnneB-ERP.exe</code> o
            <code class="rounded bg-slate-100 px-1">FS-ERP.exe</code> (según el XML de <code class="rounded bg-slate-100 px-1">dist-client</code>)
          </li>
          <li>Ejecute <code class="rounded bg-slate-100 px-1">install-service.ps1</code> como Administrador</li>
        </ol>
      </div>

      <div class="${tw.panel}">
        <h3 class="mb-2 flex items-center gap-2 text-base font-semibold text-slate-800">
          <i class="fa-solid fa-code-branch" aria-hidden="true"></i>
          Flujo de trabajo
        </h3>
        <p class="text-sm text-slate-600">
          Programe en el repo como siempre. Cuando quiera liberar:
          <code class="rounded bg-slate-100 px-1">npm run dist:client</code>.
          Los módulos y cambios nuevos entran solos en el siguiente empaquetado.
          Detalle adicional en <code class="rounded bg-slate-100 px-1">dist-client/README-INSTALACION.txt</code>.
        </p>
      </div>
    </div>
  `;
}
