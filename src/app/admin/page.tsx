import { redirect } from "next/navigation";

/**
 * El panel maestro se mudó a /master.
 *
 * Esta redirección existe porque /admin ya se desplegó y hubo enlaces
 * apuntando ahí. Quitarla rompería un marcador guardado, y no cuesta nada.
 */
export default function AdminRedirect() {
  redirect("/master");
}
