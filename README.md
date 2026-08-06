# TripleLínea

Plantilla para una plataforma editorial de análisis deportivo. El editor puede publicar hasta tres jugadas al día, cada una con contexto, una cuota que haya comprobado, un enlace externo autorizado y un escudo visual automático. La página no promete ganancias ni coloca apuestas.

## Lo que incluye

- Página de miembros, aviso de juego responsable y confirmación de edad legal.
- Registro e inicio de sesión mediante Supabase.
- Prueba de acceso de 30 días, una vez por cuenta.
- Panel privado `admin.html` simplificado: escribe la jugada y el análisis; la fecha y hora se asignan automáticamente.
- Campo opcional para pegar el enlace externo de una jugada; los miembros pueden abrirlo en otra pestaña.
- Escudo automático para cada jugada, creado con sus iniciales. No usa logotipos oficiales de clubes.
- Pulso deportivo diario para publicar notas y análisis.
- Calculadora de cuotas, buscador de publicaciones y lista local de favoritos.
- Bloque de marcadores en vivo preparado para TheSportsDB, sin exponer la clave de datos al navegador.
- Imágenes propias de futbolistas genéricos y escudos ficticios en `assets/`; no representan jugadores, clubes ni selecciones reales.

## Modo demostración

Antes de conectar Supabase, haz doble clic en `INICIAR-WEB-LOCAL.bat`. Usa las direcciones que se abren en el navegador: `http://localhost:8000/admin.html` para publicar y `http://localhost:8000/index.html` para ver cada jugada en la página principal. No abras los archivos HTML directamente desde la carpeta, porque el navegador puede separar su almacenamiento.

Este modo solo sirve para probar en la misma computadora y navegador. No publica nada en Internet ni muestra las jugadas en otros dispositivos.

Para mostrar una cuota mientras conservas el formulario corto, inclúyela dentro de la jugada, por ejemplo:

```text
Equipo A -3.5 (-110)
```

El sistema detecta `-110`, `+150` o una cuota decimal como `1.91`. Si no incluyes una, muestra “Pendiente de verificación” en vez de inventar una cuota.

Si quieres compartir un enlace con esa publicación, pégalo en **Enlace externo de la jugada**. Solo se aceptan enlaces que comiencen con `https://` o `http://`; el usuario lo abre por decisión propia en una pestaña nueva.

## Publicación real para usuarios

1. Crea un proyecto en Supabase y habilita el inicio de sesión por correo y contraseña.
2. En el SQL Editor de Supabase, ejecuta `supabase/schema.sql`.
3. En Netlify configura estas variables de entorno. La web carga automáticamente la URL y la clave pública mediante `public-config`; no debes editar `app.js` ni `admin.js`:

   ```text
   SUPABASE_URL=
   SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   THESPORTSDB_API_KEY=
   ```

   Cuando un procesador haya aprobado el negocio, añade también en `app.js` su URL de checkout alojado:

   ```js
   paymentCheckoutUrl: "https://URL-DE-CHECKOUT-APROBADA"
   ```

   El checkout alojado debe decidir de forma dinámica cuáles métodos mostrar según país, moneda, importe y elegibilidad. No codifiques una lista fija de métodos ni guardes datos de tarjeta en esta web.

4. Publica con un repositorio Git conectado a Netlify o con Netlify CLI. Este proyecto usa funciones en `netlify/functions/`, por lo que una carga puramente estática no activa cuentas ni acceso protegido.
5. Crea tu cuenta de editor desde la página pública. Busca su UUID en Supabase y ejecuta:

   ```sql
   update public.profiles set is_admin = true where user_id = 'TU-UUID-DE-USUARIO';
   ```

6. Entra a `https://TU-DOMINIO/admin.html` y publica las tres jugadas diarias.

## Marcadores en vivo

El bloque “Marcadores” está incluido y se actualiza al pulsar **Actualizar**. Para que aparezcan resultados reales de fútbol, añade `THESPORTSDB_API_KEY` en las variables de entorno de Netlify. La función `netlify/functions/live-scores.mjs` consulta el endpoint de livescore de TheSportsDB en el servidor; la clave nunca se entrega al navegador.

La coincidencia con una publicación se hace usando el nombre del evento y los equipos. Para mejores resultados, en los detalles opcionales del panel escribe un evento con esta forma:

```text
Equipo A vs. Equipo B
```

Verifica condiciones de uso, cobertura, retrasos y límites del proveedor antes de lanzar la función. Si no hay una fuente de datos conectada o no hay un juego en curso, la web lo indica claramente y no inventa marcadores.

## Prueba y membresía de US$2.99

La prueba de 30 días está implementada como acceso gratuito controlado por servidor. **La facturación automática de US$2.99 no se activa en esta plantilla.**

Antes de cobrar por un servicio relacionado con pronósticos o enlaces de apuestas, confirma requisitos de licencias, publicidad, geolocalización, verificación de edad, afiliados y que el procesador de pagos apruebe específicamente el negocio y las jurisdicciones. No integres un enlace de pago ni almacenes tarjetas hasta tener esa autorización por escrito.

Cuando tengas un proveedor de cobro autorizado, su webhook seguro debe actualizar `public.member_access`: usa `status = 'active'` para una membresía pagada. Nunca permitas que el navegador cambie ese estado directamente.

## Límites y seguridad

- No publiques ni anuncies “apuestas seguras” o resultados garantizados.
- TripleLínea no recibe dinero para apuestas ni coloca apuestas.
- Exige la edad legal aplicable y muestra recursos de juego responsable.
- Incluye términos de uso, política de privacidad, política de reembolsos y divulgación de afiliados antes de lanzarla.
- Revisa las normas de cada país o estado donde se vea la web antes de mostrar ofertas o enlaces de casas de apuestas.

## Archivos principales

- `index.html`: sitio de miembros.
- `admin.html`: panel para subir las tres publicaciones diarias.
- `app.js` y `admin.js`: interfaz, cuentas y modo demostración.
- `netlify/functions/live-scores.mjs`: proxy de marcadores de fútbol en vivo.
- `netlify/functions/`: protección del acceso y publicación editorial.
- `supabase/schema.sql`: tablas y permisos.
