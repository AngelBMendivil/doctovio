-- Correo único a nivel plataforma.
--
-- El login busca por correo ANTES de saber a qué consultorio pertenece la
-- persona. Con el único anterior, (organization_id, email), dos consultorios
-- podían tener el mismo correo y la consulta devolvía uno al azar: o metía a
-- alguien al consultorio equivocado, o lo dejaba fuera del suyo.
--
-- Verificado antes de aplicar: 0 correos repetidos. Si en otro entorno esto
-- falla, hay duplicados que resolver a mano primero:
--
--   SELECT email, count(*) FROM users GROUP BY email HAVING count(*) > 1;
--
-- El único compuesto (organization_id, email) se conserva: lo usa
-- findUserByEmail() para buscar dentro de un consultorio.

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
