-- Moneda del renglon del plan de tratamiento.
--
-- ADITIVA: una columna con default. Las filas existentes quedan en MXN, que es
-- lo que valian: hasta ahora no habia forma de capturar otra cosa.
--
-- Existe porque el precio se COPIA del catalogo pero la moneda no se copiaba, y
-- un servicio en dolares terminaba sumado como si fueran pesos.
ALTER TABLE "treatment_plan_items" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'MXN';
