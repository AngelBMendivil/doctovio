# Cómo publicar el sitio de la Dra. Mendívil en Railway

Este sitio es estático (HTML + imágenes). Se publica como un **servicio
independiente** en Railway, con su propio dominio, sin tocar la app de Doctovio.

Los archivos `package.json`, `railway.json` y `server.js` que están en esta
carpeta ya dejan todo listo: usan un servidor mínimo en Node (sin dependencias
que instalar) que sirve estos archivos en el puerto que Railway asigna.

---

## Paso 0 — Comprar el dominio (una sola vez)

Antes de nada, hace falta un dominio. Sugerencias:
- `dratrinimendivil.com` o `.mx`
- `doctoramendivil.com`

Se compra en cualquier registrador (Namecheap, GoDaddy, Google Domains,
Cloudflare). Costo aproximado: 150–400 pesos al año. Guarda el acceso al panel
del registrador: ahí se configura el DNS en el paso 4.

---

## Paso 1 — Subir el código a GitHub

El sitio ya vive dentro del repo `mvp-pacientes-saas`, en la carpeta
`sitio-dra-mendivil/`. Solo hay que subir los cambios:

```powershell
cd C:\Users\angel\mvp-pacientes-saas
git add sitio-dra-mendivil
git commit -m "Sitio web Dra. Mendivil listo para desplegar"
git push
```

---

## Paso 2 — Crear el servicio en Railway

1. Entra a https://railway.app y abre tu proyecto (el mismo de Doctovio).
2. Botón **+ New** → **GitHub Repo** → elige `mvp-pacientes-saas`.
   (Es el mismo repo, pero será un servicio SEPARADO.)
3. Cuando aparezca el servicio nuevo, ve a **Settings**:
   - En **Root Directory** escribe: `sitio-dra-mendivil`
     👉 Esto es lo clave: le dice a Railway que solo despliegue esta carpeta,
     no toda la app de Doctovio.
   - **Build** y **Start** los toma solos de `package.json` / `railway.json`.
4. Railway hará el primer despliegue. En 1–2 minutos te da una URL de prueba
   tipo `sitio-dra-mendivil-production.up.railway.app`. Ábrela para confirmar
   que todo se ve bien.

---

## Paso 3 — Conectar tu dominio en Railway

1. En el servicio del sitio → **Settings** → **Networking** → **Custom Domain**.
2. Escribe tu dominio (ej. `dratrinimendivil.com` y también `www.dratrinimendivil.com`).
3. Railway te mostrará uno o dos registros DNS (tipo **CNAME**) que hay que
   copiar. Déjalos a la vista para el paso 4.

---

## Paso 4 — Apuntar el DNS (en tu registrador)

En el panel donde compraste el dominio, agrega los registros que te dio Railway:

- Un **CNAME** para `www` → apuntando al valor que da Railway.
- Para el dominio "pelón" (sin www) Railway suele pedir un CNAME o un registro
  ALIAS/ANAME; sigue exactamente lo que muestre la pantalla de Railway.

El DNS tarda entre 10 minutos y unas horas en propagarse. Cuando Railway
muestre la palomita verde, el sitio ya está en línea con tu dominio y con
HTTPS automático.

---

## Actualizar el sitio después

Cada vez que cambies algo en esta carpeta:

```powershell
cd C:\Users\angel\mvp-pacientes-saas
git add sitio-dra-mendivil
git commit -m "Ajuste al sitio"
git push
```

Railway lo vuelve a desplegar solo. No hay que hacer nada más.

---

## Nota sobre el formulario de opiniones

Las estrellas y campos se ven y responden, pero **todavía no guardan nada**.
Para que las reseñas se envíen y se moderen hay que conectarlo con Doctovio.
Eso queda pendiente para cuando se trabaje la versión integrada.
