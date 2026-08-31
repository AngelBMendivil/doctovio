-- El correo vuelve a ser obligatorio para todos los usuarios.
--
-- Se habia hecho opcional para permitir usuarios secundarios que entraran solo
-- con su alias (clp.carlos). Se revierte: sin correo no hay a donde mandar el
-- restablecimiento de contrasena ni los avisos, y una cuenta que solo se
-- recupera pidiendole al Master que la toque a mano no es recuperable de
-- verdad.
--
-- El alias SE CONSERVA y sigue sirviendo para entrar: el login acepta los dos.
--
-- Verificado antes de aplicar: 0 usuarios sin correo. Si en otro entorno esto
-- falla, hay filas que resolver primero:
--
--   SELECT id, full_name FROM users WHERE email IS NULL;

-- Ya no hace falta: con email obligatorio la condicion se cumple siempre, y
-- una restriccion que nunca puede fallar solo estorba al leer el esquema.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_login_check";

ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;
