"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateUserAction, resetPasswordAction, type MasterState } from "@/lib/actions/master";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";

const initial: MasterState = {};

function Submit({ children, variant = "primary" }: { children: React.ReactNode; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? "Guardando..." : children}
    </Button>
  );
}

function Msg({ state }: { state: MasterState }) {
  if (state.error) return <Alert className="mt-3">{state.error}</Alert>;
  if (state.ok) return <Alert tone="success" className="mt-3">{state.ok}</Alert>;
  return null;
}

/**
 * Edición de un usuario, con guardado explícito.
 *
 * Sustituye a los desplegables que mutaban al cambiar en el listado: rozar la
 * rueda del mouse sobre uno reasignaba el rol de alguien o lo movía de
 * consultorio, sin confirmación y sin dejar claro qué había pasado.
 */
export function UserEditForm({
  user,
  clinics,
}: {
  user: {
    id: string;
    fullName: string;
    phone: string | null;
    primaryRole: string;
    isActive: boolean;
    isPlatformAdmin: boolean;
    organization: { id: string };
  };
  clinics: { id: string; name: string }[];
}) {
  const [state, action] = useFormState(updateUserAction, initial);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="userId" value={user.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Nombre completo *</Label>
          <Input id="fullName" name="fullName" defaultValue={user.fullName} required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" name="phone" defaultValue={user.phone ?? ""} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="role">Rol</Label>
          <Select id="role" name="role" defaultValue={user.primaryRole}>
            <option value="DOCTOR">Doctor</option>
            <option value="ADMIN">Administrativo</option>
            <option value="ASSISTANT">Secretaria</option>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="organizationId">Consultorio</Label>
          <Select id="organizationId" name="organizationId" defaultValue={user.organization.id}>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
      </div>

      <label className="flex items-center gap-2.5 text-sm text-foreground">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={user.isActive}
          className="h-4 w-4 rounded border-border"
        />
        Puede iniciar sesión
      </label>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Desactivar no borra nada: su historial, las citas que creó y las recetas que
        firmó siguen intactas.{" "}
        <span className="font-medium text-navy">Cambiarlo de consultorio tampoco mueve ese historial</span>,
        que pertenece a la clínica donde ocurrió.
      </p>

      <Msg state={state} />
      <Submit>Guardar cambios</Submit>
    </form>
  );
}

/** Restablecer la contraseña va aparte: es una acción distinta, no un campo. */
export function ResetPasswordForm({ email }: { email: string }) {
  const [state, action] = useFormState(resetPasswordAction, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="email" value={email} />

      <div className="space-y-1.5">
        <Label htmlFor="password">Contraseña nueva</Label>
        <Input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" />
      </div>

      <p className="text-xs text-muted-foreground">
        Mínimo 8 caracteres. La anterior se pierde: esto la reemplaza, no la recupera.
      </p>

      <Msg state={state} />
      <Submit variant="secondary">Restablecer acceso</Submit>
    </form>
  );
}
