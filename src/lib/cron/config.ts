/**
 * Secreto de los endpoints de mantenimiento.
 *
 * Se lee en lib/ y no dentro de app/: en la capa RSC del bundler `process.env`
 * no existe y el route truena al cargarse.
 */
export const CRON_SECRET = process.env.CRON_SECRET ?? "";
