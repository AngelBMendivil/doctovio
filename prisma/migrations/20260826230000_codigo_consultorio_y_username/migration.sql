-- Código corto de consultorio (CLP) y nombre de acceso de usuarios (clp.carlos).
--
-- Tres pasos con cuidado, porque `code` es obligatorio y único:
--   1. Se agrega la columna NULA.
--   2. Se rellenan los consultorios que ya existen.
--   3. Recién entonces se exige NOT NULL y se crea el único.
--
-- Agregarla NOT NULL de una vez fallaría con cualquier fila existente.

-- ------------------------------------------------------------------ 1. columna
ALTER TABLE "organizations" ADD COLUMN "code" TEXT;

-- ------------------------------------------------------------------ 2. relleno
--
-- Regla simple y suficiente para el relleno: las 3 primeras letras del nombre,
-- con un número si chocan. Los consultorios NUEVOS usan el generador de
-- lib/utils/clinic-code.ts, que toma la inicial de cada palabra (CMV para
-- "Centro Médico del Valle"). No se replica esa lógica aquí: hacerlo en SQL
-- sería frágil, y esto solo corre una vez sobre los que ya estaban.
DO $$
DECLARE
  r        RECORD;
  base     TEXT;
  candidato TEXT;
  n        INT;
BEGIN
  FOR r IN SELECT id, name FROM organizations WHERE code IS NULL ORDER BY created_at LOOP
    -- Solo letras ASCII; los acentos se caen, que para un código está bien.
    base := upper(substring(regexp_replace(r.name, '[^A-Za-z]', '', 'g') FROM 1 FOR 3));

    -- Nombre sin letras suficientes: se completa con X para no dejarlo corto.
    WHILE length(base) < 3 LOOP
      base := base || 'X';
    END LOOP;

    candidato := base;
    n := 2;
    WHILE EXISTS (SELECT 1 FROM organizations WHERE code = candidato) LOOP
      candidato := base || n::TEXT;
      n := n + 1;
    END LOOP;

    UPDATE organizations SET code = candidato WHERE id = r.id;
  END LOOP;
END $$;

-- ------------------------------------------------------- 3. exigir y hacer único
ALTER TABLE "organizations" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- ------------------------------------------------------------------ usuarios
--
-- El correo deja de ser obligatorio: los usuarios secundarios entran con su
-- nombre de acceso y pueden no tener correo propio. Relajar la restricción no
-- invalida ninguna fila existente.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "users" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- Pero un usuario SIN correo y SIN nombre de acceso no podría entrar nunca.
-- La base lo impide, no solo la aplicación: es el tipo de fila que se cuela
-- por un script o una carga masiva.
ALTER TABLE "users"
  ADD CONSTRAINT "users_login_check"
  CHECK ("email" IS NOT NULL OR "username" IS NOT NULL);
